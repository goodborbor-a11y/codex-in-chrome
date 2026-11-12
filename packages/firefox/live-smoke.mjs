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
    <input id="first"><textarea id="second"></textarea>
    <select id="category"><option value="a">A</option><option value="b">B</option></select>
    <input id="agree" type="checkbox"><output id="result"></output>
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
  const interactive = await tool('read_page', { tabId, filter: 'interactive' });
  if (!interactive.nodes?.some(node => node.selector === '#first')) throw Error('Firefox interactive page reading failed');
  await tool('wait_for', { tabId, selector: '#category' });
  await tool('select_option', { tabId, selector: '#category', value: 'b' });
  await tool('check', { tabId, selector: '#agree' });
  if ((await tool('get_element', { tabId, selector: '#category' })).value !== 'b') throw Error('Firefox select_option failed');
  if ((await tool('get_element', { tabId, selector: '#agree' })).checked !== true) throw Error('Firefox check failed');
  await tool('focus', { tabId, selector: '#first' });
  await tool('computer', { tabId, action: 'key', text: 'Ctrl+A' });
  await tool('computer', { tabId, action: 'key', text: 'Backspace' });
  await tool('insert_text', { tabId, text: 'omega' });
  if (!(await tool('get_page_text', { tabId })).includes('omega|beta!')) throw Error('Firefox focus or keyboard editing failed');
  await tool('scroll_into_view', { tabId, selector: '#second' });
  await tool('scroll_page', { tabId, to: 'top' });
  console.log('Firefox LIVE PASS: navigation, screenshot, form, typing, keyboard editing, element reading, wait, select, check, scroll');
} finally {
  if (tabId) await tool('tabs_close', { tabId }).catch(e => console.error('Could not close test tab:', e.message));
  if (server.listening) server.close();
}
