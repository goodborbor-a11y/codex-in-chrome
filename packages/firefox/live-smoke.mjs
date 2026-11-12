/* global process, console, fetch, crypto, AbortSignal */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

const config = JSON.parse(readFileSync(join(process.env.CODEX_CHROME_CONFIG_DIR || join(homedir(), '.codex-chrome'), 'config.json'), 'utf8'));
const sessionId = crypto.randomUUID();
async function tool(name, input = {}) {
  const response = await fetch(`http://127.0.0.1:${config.port}/rpc`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiToken}` },
    body: JSON.stringify({ sessionId, name, input }), signal: AbortSignal.timeout(30000)
  });
  const body = await response.json();
  if (!response.ok) throw Error(`${name}: ${body.error}`);
  return body.result;
}
let tabId;
const server = createServer((_, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html><title>Saint Firefox input test</title><h1>Saint Firefox input test</h1>
    <input id="first"><textarea id="second"></textarea><output id="result"></output>
    <script>
      const first = document.querySelector('#first'), second = document.querySelector('#second');
      const update = () => document.querySelector('#result').textContent = first.value + '|' + second.value;
      first.addEventListener('input', update); second.addEventListener('input', update); update();
    </script>`);
});
try {
  const firefox = (await tool('browsers_list')).filter(b => b.platform === 'Firefox');
  if (firefox.length !== 1) throw Error(`Expected one Firefox browser, found ${firefox.length}`);
  await tool('browser_select', { deviceId: firefox[0].deviceId });
  const tab = await tool('tabs_create'); tabId = tab.tabId;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const navigation = await tool('navigate', { tabId, url: `http://127.0.0.1:${address.port}/` });
  console.log('Navigation:', navigation);
  const page = await tool('get_page_text', { tabId });
  if (String(page).length < 20) throw Error(`Unexpected page text: ${String(page).slice(0, 120)}`);
  const shot = await tool('screenshot', { tabId });
  if (String(shot.image || '').length < 1000) throw Error('Screenshot missing');
  await tool('form_input', { tabId, fields: [{ selector: '#first', value: 'alpha' }, { selector: '#second', value: 'beta' }] });
  if (!(await tool('get_page_text', { tabId })).includes('alpha|beta')) throw Error('Firefox form_input did not update both fields');
  await tool('computer', { tabId, action: 'left_click', selector: '#first' });
  await tool('clear_field', { tabId, selector: '#first' });
  await tool('insert_text', { tabId, text: 'gamma' });
  if (!(await tool('get_page_text', { tabId })).includes('gamma|beta')) throw Error('Firefox click, clear_field, or insert_text failed');
  await tool('computer', { tabId, action: 'type', selector: '#second', text: '!' });
  if (!(await tool('get_page_text', { tabId })).includes('gamma|beta!')) throw Error('Firefox computer type failed');
  console.log('Firefox LIVE PASS: navigation, reading, screenshot, form_input, click, clear_field, insert_text, type');
} finally {
  if (tabId) await tool('tabs_close', { tabId }).catch(e => console.error('Could not close test tab:', e.message));
  if (server.listening) server.close();
}
