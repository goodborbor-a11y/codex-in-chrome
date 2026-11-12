#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline/promises';
import { homedir, platform } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bridge } from './server.js';
import { loadConfig, saveConfig } from './config.js';
import { rpcTimeoutMs } from './timeouts.js';
import { FirefoxBidi } from './firefox-bidi.js';

const [, , command = 'help', ...args] = process.argv;
const root = resolve(fileURLToPath(import.meta.url), '../../../..');
const config = loadConfig();
async function rpc(name: string, input: Record<string, unknown> = {}, path = '/rpc'): Promise<unknown> {
  const timeout = rpcTimeoutMs(name, input);
  const response = await fetch(`http://127.0.0.1:${config.port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiToken}` }, body: JSON.stringify(path === '/pair' ? input : { sessionId: 'cli', name, input }), signal: AbortSignal.timeout(timeout) }).catch((e: Error) => { if (e.name === 'TimeoutError') throw new Error(`browser_bridge_timed_out: ${name || 'pair'} after ${Math.ceil(timeout / 1000)}s`); throw e; });
  const body = await response.json() as { result?: unknown; error?: string };
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body.result;
}
async function main(): Promise<void> {
  if (command === 'serve') { try { const response=await fetch(`http://127.0.0.1:${config.port}/health`,{signal:AbortSignal.timeout(800)}); if(response.ok&&(await response.json() as {ok?:boolean}).ok){console.log('Saint in Browsers bridge already running');return;} } catch { /* start the bridge */ }
    const bridge = new Bridge(); const port = await bridge.listen(); console.log(`Saint in Browsers bridge listening on 127.0.0.1:${port}`); setInterval(() => { for (const b of bridge.browsers.values()) { if (Date.now() - b.lastSeen > 20_000) b.ws.close(); else b.ws.send(JSON.stringify({ type: 'heartbeat' })); } }, 5_000);
    const watchAddOn=(directory:string,firefox:boolean)=>{if(!existsSync(directory))return;let timer:NodeJS.Timeout|undefined;watch(directory,{recursive:true},(_,filename)=>{if(filename&&!/\.(js|json|html|css)$/i.test(String(filename)))return;if(timer)clearTimeout(timer);timer=setTimeout(()=>{for(const b of bridge.browsers.values()){if((b.platform==='Firefox')!==firefox)continue;const session=`watch-${b.deviceId}`;bridge.selected.set(session,b.deviceId);void bridge.tool(session,'extension_reload',{}).catch(()=>{});}},5000);});};
    watchAddOn(join(root,'packages','extension','dist'),false);
    watchAddOn(join(root,'packages','firefox'),true);
    return; }
  if (command === 'pair') { if (!args[0]) throw new Error('Usage: saint-in-browsers pair ABC123 [name]'); console.log(JSON.stringify(await rpc('', { code: args[0], name: args.slice(1).join(' ') || 'Chrome' }, '/pair'), null, 2)); return; }
  if (command === 'browsers') { console.log(JSON.stringify(await rpc('browsers_list'), null, 2)); return; }
  if (command === 'bidi') { const port=Number(args[0]); if(args[0]==='off')delete config.firefoxBidiPort;else if(Number.isInteger(port)&&port>0&&port<65536)config.firefoxBidiPort=port;else throw Error('Usage: bidi PORT | bidi off');saveConfig(config);console.log(JSON.stringify({firefoxBidiPort:config.firefoxBidiPort||null}));return; }
  if (command === 'bidi-install') { const port=Number(args[0]||config.firefoxBidiPort);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Configure a Firefox BiDi port first: bidi PORT');const bidi=await FirefoxBidi.connect(port);try{const result=await bidi.call('webExtension.install',{extensionData:{type:'path',path:join(root,'packages','firefox')}});console.log(JSON.stringify(result));}finally{await bidi.close()}return; }
  if (command === 'status') { console.log(JSON.stringify(await rpc('browser_status'), null, 2)); return; }
  if (command === 'resume') { console.log(JSON.stringify(await rpc('browser_resume', { confirmed: true }), null, 2)); return; }
  if (command === 'reload') { console.log(JSON.stringify(await rpc('extension_reload'), null, 2)); return; }
  if (command === 'tool') { if (!args[0]) throw new Error('Usage: saint-in-browsers tool <name> <json>'); console.log(JSON.stringify(await rpc(args[0], args[1] ? JSON.parse(args[1]) as Record<string, unknown> : {}), null, 2)); return; }
  if (command === 'doctor') {
    const chromePaths = platform() === 'win32' ? [join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'), join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'), join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe')] : platform() === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] : ['/usr/bin/google-chrome', '/usr/bin/chromium'];
    let health: unknown; try { health = await (await fetch(`http://127.0.0.1:${config.port}/health`)).json(); } catch { health = 'bridge offline'; }
    let debuggerAttachable: boolean | string = 'browser not connected';
    if (typeof health === 'object' && health && (health as { browsers?: unknown[] }).browsers?.length === 1) {
      try { const tab = await rpc('tabs_create') as { tabId: number }; await rpc('tabs_close', { tabId: tab.tabId }); debuggerAttachable = true; } catch (e) { debuggerAttachable = (e as Error).message; }
    }
    const codexConfig = join(homedir(), '.codex', 'config.toml');
    console.log(JSON.stringify({ chromeFound: chromePaths.some(existsSync), bridge: health, configWritten: existsSync(codexConfig) && readFileSync(codexConfig, 'utf8').includes('[mcp_servers.chrome]'), debuggerAttachable, port: config.port, pairedDevices: config.devices.length }, null, 2)); return;
  }
  if (command === 'install') {
    const dir = join(homedir(), '.codex'); mkdirSync(dir, { recursive: true });
    const file = join(dir, 'config.toml'); const old = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (!old.includes('[mcp_servers.saint-in-browsers]')) {
      const entry = `\n[mcp_servers.saint-in-browsers]\ncommand = "node"\nargs = [${JSON.stringify(join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'))}, ${JSON.stringify(join(root, 'packages', 'mcp-server', 'src', 'index.ts'))}]\n`;
      writeFileSync(file, old + entry);
    }
    console.log(`Extension: ${join(root, 'packages', 'extension', 'dist')}\nCodex config: ${file}\nBridge: corepack pnpm bridge`); return;
  }
  if (command === 'demo') {
    const fixture = readFileSync(join(root, 'packages', 'extension', 'fixtures', 'page.html'));
    const server = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(fixture); });
    const auto = process.env.CODEX_CHROME_DEMO_AUTO === '1';
    await new Promise<void>(done => server.listen(auto ? 17666 : 0, '127.0.0.1', done));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    let tabId: number | undefined;
    try {
      const tab = await rpc('tabs_create', { active: true }) as { tabId: number }; tabId = tab.tabId;
      if (!auto) { console.log(`Allow ${new URL(url).origin} in the extension side panel, then press Enter.`); await prompt.question(''); }
      console.log('Navigate:', await rpc('navigate', { tabId, url }));
      const nodes = await rpc('read_page', { tabId, filter: 'interactive' }) as { ref: string; name: string }[];
      const ref = (name: string) => { const found = nodes.find(n => n.name === name); if (!found) throw new Error(`Missing fixture element: ${name}`); return found.ref; };
      await rpc('computer', { tabId, action: 'wait', seconds: .1 });
      await rpc('computer', { tabId, action: 'mouse_move', coordinate: [100, 100] });
      await rpc('computer', { tabId, action: 'left_click', ref: ref('Name') });
      await rpc('computer', { tabId, action: 'type', text: 'Test User' });
      const nameField = await rpc('get_element', { tabId, ref: ref('Name') }) as { value?: string; focused?: boolean };
      console.log('Typed name:', nameField.value, 'focused:', nameField.focused);
      await rpc('computer', { tabId, action: 'left_click', ref: ref('Submit'), confirmed: true }); console.log('Clicked Submit');
      const submitted = String(await rpc('get_page_text', { tabId, mode: 'all' }));
      if (!submitted.includes('Hello Test User')) throw new Error(`Demo submit failed: ${submitted.slice(0, 160)}`);
      const uploadPath = join(homedir(), '.codex-chrome', 'demo-upload.txt'); mkdirSync(join(homedir(), '.codex-chrome'), { recursive: true }); writeFileSync(uploadPath, 'Saint browser demo file');
      await rpc('file_upload', { tabId, ref: ref('Upload'), paths: [uploadPath], confirmed: true }); console.log('Uploaded file');
      await rpc('clipboard_write', { text: 'Two cursors, one browser' });
      await rpc('computer', { tabId, action: 'left_click', ref: ref('Paste here') }); await rpc('paste', { tabId }); console.log('Pasted text');
      await rpc('gif_record', { tabId, action: 'start', fps: 5, path: join(config.downloadDir, 'demo.gif') });
      await rpc('computer', { tabId, action: 'scroll', direction: 'down', amount: 700 }); console.log('Scrolled');
      console.log('GIF:', await rpc('gif_record', { tabId, action: 'stop' }));
      console.log('Screenshot:', await rpc('screenshot_to_file', { tabId, path: join(config.downloadDir, 'demo.png') }));
      const pageText = String(await rpc('get_page_text', { tabId, mode: 'all' }));
      if (!pageText.includes('Hello Test User')) throw new Error('Demo submit was not reflected on page');
      console.log('Page text:', pageText.slice(0, 120));
    } finally { if (tabId) await rpc('tabs_close', { tabId }).catch(() => {}); prompt.close(); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
    return;
  }
  console.log('saint-in-browsers: install | doctor | pair CODE [name] | browsers | bidi PORT|off | bidi-install [PORT] | status | resume | reload | serve | tool NAME JSON | demo');
}
main().catch(e => { console.error((e as Error).message); process.exitCode = 1; });
