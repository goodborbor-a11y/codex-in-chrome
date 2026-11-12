/* global process, console, fetch, crypto, AbortSignal */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

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
try {
  const firefox = (await tool('browsers_list')).filter(b => b.platform === 'Firefox');
  if (firefox.length !== 1) throw Error(`Expected one Firefox browser, found ${firefox.length}`);
  await tool('browser_select', { deviceId: firefox[0].deviceId });
  const tab = await tool('tabs_create'); tabId = tab.tabId;
  const navigation = await tool('navigate', { tabId, url: 'https://example.com' });
  console.log('Navigation:', navigation);
  const page = await tool('get_page_text', { tabId });
  if (String(page).length < 20) throw Error(`Unexpected page text: ${String(page).slice(0, 120)}`);
  const shot = await tool('screenshot', { tabId });
  if (String(shot.image || '').length < 1000) throw Error('Screenshot missing');
  console.log('Firefox LIVE PASS: created tab, navigated, read page, captured screenshot');
} finally {
  if (tabId) await tool('tabs_close', { tabId }).catch(e => console.error('Could not close test tab:', e.message));
}
