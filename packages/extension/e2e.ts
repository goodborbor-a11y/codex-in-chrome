import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { loadConfig } from '../bridge/src/config.js';

const config = loadConfig();
const fixture = readFileSync(resolve('packages/extension/fixtures/page.html'));
const server = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(fixture); });
await new Promise<void>(done => server.listen(17666, '127.0.0.1', done));
const url = 'http://127.0.0.1:17666/';
const terminal = createInterface({ input: process.stdin, output: process.stdout });
const sessionId = `e2e-${Date.now()}`;
async function rpc(name: string, input: Record<string, unknown> = {}): Promise<any> {
  const response = await fetch(`http://127.0.0.1:${config.port}/rpc`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiToken}` }, body: JSON.stringify({ sessionId, name, input }) });
  const body = await response.json() as { result?: unknown; error?: string };
  if (!response.ok) throw Error(`${name}: ${body.error}`);
  return body.result;
}
let tabId: number | undefined;
try {
  const browsers = await rpc('browsers_list') as { deviceId: string; name: string }[];
  if (!browsers.length) throw Error('No Saint in Chrome extension is paired with the bridge. Load packages/extension/dist in your current Chrome, then pair its code.');
  const selected = process.env.CODEX_CHROME_DEVICE_ID || (browsers.length === 1 ? browsers[0]?.deviceId : undefined);
  if (!selected) throw Error(`Several browsers are connected; set CODEX_CHROME_DEVICE_ID to one of: ${JSON.stringify(browsers)}`);
  await rpc('browser_select', { deviceId: selected });
  console.log(`Testing ${browsers.find(b => b.deviceId === selected)?.name} at ${url}`);
  if (process.env.CODEX_CHROME_E2E_AUTO !== '1') { console.log('Allow this exact origin in the extension panel, then press Enter.'); await terminal.question(''); }
  const existingTab = Number(process.env.CODEX_CHROME_TAB_ID || 0);
  if (existingTab) tabId = existingTab;
  else { const created = await rpc('tabs_create') as { tabId: number }; tabId = created.tabId; }
  const nav = await rpc('navigate', { tabId, url }); if (nav.url !== url) throw Error(`Unexpected final URL: ${nav.url}`);
  console.log('Navigation passed');
  const nodes = await rpc('read_page', { tabId, filter: 'interactive' }) as { ref: string; name: string }[];
  const ref = (name: string) => { const node = nodes.find(n => n.name === name); if (!node) throw Error(`Missing ${name} ref`); return node.ref; };
  console.log('Page refs passed');
  const overlayHit = await rpc('javascript', { tabId, confirmed: true, code: `(() => { const target = document.querySelector('#overlay-target'); const box = target.getBoundingClientRect(); return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.id; })()` });
  if (overlayHit !== 'overlay-target') throw Error('Status pill intercepted the underlying page button');
  await rpc('computer', { tabId, action: 'left_click', ref: ref('Button under status pill') });
  const overlayResult = String(await rpc('get_page_text', { tabId, mode: 'all' }));
  if (!overlayResult.includes('Overlay target clicked')) throw Error('Status pill blocked an underlying page button');
  console.log('Status pill click-through passed');
  await rpc('computer', { tabId, action: 'left_click', ref: ref('Button under Stop') });
  const stopResult = String(await rpc('get_page_text', { tabId, mode: 'all' }));
  if (!stopResult.includes('Stop target clicked')) throw Error('Stop button intercepted an underlying page button');
  console.log('Stop button click-through passed');
  await rpc('computer', { tabId, action: 'wait', seconds: .1 }); console.log('Action message passed');
  await rpc('computer', { tabId, action: 'mouse_move', coordinate: [100,100] }); console.log('Cursor move passed');
  await rpc('computer', { tabId, action: 'left_click', ref: ref('Name') });
  console.log('Input click passed');
  await rpc('computer', { tabId, action: 'type', text: 'Test User' });
  await rpc('computer', { tabId, action: 'left_click', ref: ref('Submit'), confirmed: true });
  const text = String(await rpc('get_page_text', { tabId, mode: 'all' }));
  if (!text.includes('Hello Test User')) throw Error(`Click or typing failed: ${text.slice(0, 200)}`);
  const shot = await rpc('screenshot', { tabId }) as { image: string; frame: { width: number; height: number } };
  if (!shot.image || shot.frame.width < 100) throw Error('Screenshot invalid');
  console.log(`E2E PASS: pair, select, create, permission, navigate, refs, click, type, screenshot ${shot.frame.width}x${shot.frame.height}, close`);
} finally { if (tabId) await rpc('tabs_close', { tabId }).catch(() => {}); terminal.close(); server.closeAllConnections(); await new Promise<void>(done=>server.close(()=>done())); }
