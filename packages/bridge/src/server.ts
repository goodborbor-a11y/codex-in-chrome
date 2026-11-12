import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, isAbsolute, relative, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WebSocketServer, WebSocket } from 'ws';
import { configDir, loadConfig, saveConfig, type Config } from './config.js';
import { browserToolTimeoutMs } from './timeouts.js';
import { schemas, computerActions } from '../../mcp-server/src/schemas.js';
import { FirefoxBidi } from './firefox-bidi.js';

type Packet = { id?: string; type: string; [key: string]: unknown };
type Browser = { ws: WebSocket; deviceId: string; name: string; profile?: string; platform?: string; buildId?: string; capabilities?: { version: string; tools: string[]; computerActions: string[] }; lastSeen: number; busy: number };
type Pending = { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: NodeJS.Timeout; deviceId: string };
const MAX_BODY = 5_000_000;
const execFileAsync = promisify(execFile);
const SENSITIVE = /password|credit.?card|\bcvv\b|\bssn\b|authorization|cookie/i;
function redact(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(redact);
  if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, SENSITIVE.test(k) ? '[redacted]' : redact(v)]));
  return input;
}
export class Bridge {
  readonly config: Config = loadConfig();
  readonly browsers = new Map<string, Browser>();
  readonly selected = new Map<string, string>();
  readonly pending = new Map<string, Pending>();
  readonly pairCodes = new Map<string, WebSocket>();
  readonly recordings = new Map<string, { dir: string; next: number; fps: number; path: string; tabId: number }>();
  readonly macros = new Map<string, { name: string; calls: { name: string; input: Record<string, unknown>; delay: number }[]; last: number }>();
  private bidiQueue: Promise<void> = Promise.resolve();
  readonly server = createServer((req, res) => void this.http(req, res));
  readonly wss = new WebSocketServer({ noServer: true });
  constructor() {
    this.server.on('upgrade', (req, socket, head) => {
      if (req.url !== '/extension' || req.socket.remoteAddress && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) { socket.destroy(); return; }
      this.wss.handleUpgrade(req, socket, head, ws => this.connect(ws));
    });
  }
  async listen(): Promise<number> {
    for (let port = this.config.port; port < 18000; port++) {
      try { await new Promise<void>((ok, fail) => { this.server.once('error', fail); this.server.listen(port, '127.0.0.1', () => { this.server.removeListener('error', fail); ok(); }); }); this.config.port = port; saveConfig(this.config); return port; }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw e; }
    }
    throw new Error('No available port in 17xxx range');
  }
  private connect(ws: WebSocket): void {
    let browser: Browser | undefined;
    ws.on('message', raw => {
      let msg: Packet;
      try { msg = JSON.parse(raw.toString()) as Packet; } catch { return; }
      if (msg.type === 'hello') {
        const device = this.config.devices.find(d => d.deviceId === msg.deviceId && d.token === msg.token);
        if (device) {
          const candidate=msg.capabilities as Record<string,unknown> | undefined;
          const capabilities=candidate&&typeof candidate.version==='string'&&Array.isArray(candidate.tools)&&candidate.tools.length<=200&&candidate.tools.every(x=>typeof x==='string')&&Array.isArray(candidate.computerActions)&&candidate.computerActions.length<=50&&candidate.computerActions.every(x=>typeof x==='string') ? candidate as Browser['capabilities'] : undefined;
          browser = { ws, deviceId: device.deviceId, name: device.name, profile: device.profile, platform: String(msg.platform || ''), buildId: String(msg.buildId || ''), capabilities, lastSeen: Date.now(), busy: 0 };
          this.browsers.get(device.deviceId)?.ws.close();
          this.browsers.set(device.deviceId, browser);
          ws.send(JSON.stringify({ type: 'ready', deviceId: device.deviceId }));
        } else if (typeof msg.pairCode === 'string' && /^[A-Z0-9]{6}$/.test(msg.pairCode)) {
          this.pairCodes.set(msg.pairCode, ws);
          ws.send(JSON.stringify({ type: 'pair_waiting' }));
        } else ws.send(JSON.stringify({ type: 'pair_required' }));
      } else if (msg.type === 'heartbeat' && browser) browser.lastSeen = Date.now();
      else if (msg.type === 'select_choice' && browser && typeof msg.sessionId === 'string') { this.selected.set(msg.sessionId, browser.deviceId); ws.send(JSON.stringify({ type: 'selected', sessionId: msg.sessionId })); }
      else if (msg.type === 'result' && browser && typeof msg.id === 'string') {
        const p = this.pending.get(msg.id); if (!p || p.deviceId !== browser.deviceId) return;
        clearTimeout(p.timer); this.pending.delete(msg.id); browser.busy--;
        if (msg.error) p.reject(new Error(String(msg.error))); else p.resolve(msg.result);
      }
    });
    ws.on('close', () => {
      for (const [code, candidate] of this.pairCodes) if (candidate === ws) this.pairCodes.delete(code);
      if (browser && this.browsers.get(browser.deviceId)?.ws === ws) {
        this.browsers.delete(browser.deviceId);
        for (const [id, p] of this.pending) if (p.deviceId === browser.deviceId) { clearTimeout(p.timer); p.reject(new Error('browser_disconnected')); this.pending.delete(id); }
      }
    });
  }
  pair(code: string, name: string): { deviceId: string; name: string } {
    const ws = this.pairCodes.get(code.toUpperCase());
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error('Pairing code not connected');
    const deviceId = crypto.randomUUID(), token = crypto.randomUUID();
    this.config.devices.push({ deviceId, name, token }); saveConfig(this.config);
    ws.send(JSON.stringify({ type: 'paired', deviceId, token, name })); this.pairCodes.delete(code.toUpperCase());
    return { deviceId, name };
  }
  list(): unknown[] { return [...this.browsers.values()].map(b => ({ deviceId: b.deviceId, name: b.name, platform: b.platform, buildId: b.buildId, capabilityVersion: b.capabilities?.version, toolCount: b.capabilities?.tools.length, profile: b.profile, onThisComputer: true, inUse: b.busy > 0, lastSeen: b.lastSeen })); }
  async tool(sessionId: string, name: string, input: Record<string, unknown>): Promise<unknown> {
    if (name === 'browsers_list') return this.list();
    if (name === 'browser_capabilities') {
      const id=String(input.deviceId||this.selected.get(sessionId)||(this.browsers.size===1?[...this.browsers.keys()][0]:''));
      const browser=this.browsers.get(id);if(!browser)throw Error('select_a_connected_browser');
      if(browser.platform==='Firefox'&&!browser.capabilities)throw Error('firefox_capabilities_missing: reload Saint in Firefox');
      const advanced=browser.platform==='Firefox'&&!!loadConfig().firefoxBidiPort;
      const capabilities=browser.capabilities||{version:browser.buildId,tools:Object.keys(schemas),computerActions};
      const actions=advanced?[...new Set([...capabilities.computerActions,'right_click','middle_click','double_click','triple_click','left_click_drag'])]:capabilities.computerActions;
      return {deviceId:id,platform:browser.platform,buildId:browser.buildId,...capabilities,computerActions:actions,advancedInputConfigured:advanced};
    }
    if (name === 'browser_select') { const id = String(input.deviceId || ''); if (!this.browsers.has(id)) throw new Error('browser_disconnected'); this.selected.set(sessionId, id); return { selected: id }; }
    if (name === 'browser_switch') {
      for (const b of this.browsers.values()) b.ws.send(JSON.stringify({ type: 'select_prompt', sessionId }));
      return { awaitingSelection: true, browsers: this.list() };
    }
    const id = this.selected.get(sessionId) || (this.browsers.size === 1 ? [...this.browsers.keys()][0] : undefined);
    if (!id) throw new Error(`Select a browser first: ${JSON.stringify(this.list())}`);
    const b = this.browsers.get(id); if (!b || b.ws.readyState !== WebSocket.OPEN) throw new Error('browser_disconnected');
    const bidiPort=b.platform==='Firefox'?loadConfig().firefoxBidiPort:undefined;
    if(bidiPort&&input._bidiSkip!==true&&(
      name==='computer'&&['left_click','right_click','middle_click','double_click','triple_click','hover','mouse_move','left_click_drag','scroll','type','key'].includes(String(input.action))||
      name==='insert_text'||name==='clear_field'||name==='form_input')){
      const recordKey=`${sessionId}:${input.tabId}`;
      if(this.recordings.has(recordKey))await this.frame(sessionId,recordKey);
      const result=name==='form_input'?await this.firefoxBidiForm(sessionId,bidiPort,input):
        name==='clear_field'?await this.firefoxBidiClear(sessionId,bidiPort,input):
        await this.firefoxBidiComputer(sessionId,bidiPort,name==='insert_text'?{...input,action:'type'}:input);
      mkdirSync(configDir,{recursive:true});appendFileSync(join(configDir,'activity.jsonl'),JSON.stringify(redact({timestamp:new Date().toISOString(),sessionId,browser:id,tool:name,input}))+'\n');
      const macro=this.macros.get(sessionId);if(macro){const now=Date.now();macro.calls.push({name,input:redact(input) as Record<string,unknown>,delay:now-macro.last});macro.last=now}
      if(this.recordings.has(recordKey))await this.frame(sessionId,recordKey);
      return result;
    }
    if (name === 'macro_record') {
      const action = String(input.action || '');
      if (action === 'start') { const macroName = String(input.name || `macro-${Date.now()}`); this.macros.set(sessionId, { name: macroName, calls: [], last: Date.now() }); return { recording: macroName }; }
      if (action === 'stop') { const macro = this.macros.get(sessionId); if (!macro) throw new Error('macro_not_recording'); const dir = join(configDir, 'macros'); mkdirSync(dir, { recursive: true }); const file = join(dir, `${macro.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`); writeFileSync(file, JSON.stringify(macro.calls, null, 2)); this.macros.delete(sessionId); return { path: file, calls: macro.calls.length }; }
      throw new Error('invalid_macro_action');
    }
    if (name === 'macro_replay') {
      const file = join(configDir, 'macros', `${String(input.name || '').replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
      if (!existsSync(file)) throw new Error('macro_not_found'); const calls = JSON.parse(readFileSync(file, 'utf8')) as { name: string; input: Record<string, unknown>; delay: number }[];
      const results = []; for (const call of calls) { await new Promise(r => setTimeout(r, Math.min(3000, call.delay / Math.max(.1, Number(input.speed || 1))))); results.push(await this.tool(sessionId, call.name, call.input)); } return { results };
    }
    const recordKey = `${sessionId}:${input.tabId}`;
    if (name === 'gif_record') {
      const action = String(input.action || '');
      if (action === 'start') {
        if (!Number.isInteger(input.tabId)) throw new Error('tabId_required');
        const dir = mkdtempSync(join(tmpdir(), 'codex-chrome-gif-'));
        const target = String(input.path || join(this.config.downloadDir, `recording-${Date.now()}.gif`));
        this.recordings.set(recordKey, { dir, next: 0, fps: Math.max(1, Math.min(20, Number(input.fps || 5))), path: target, tabId: Number(input.tabId) });
        await this.frame(sessionId, recordKey);
        return { recording: true, path: target };
      }
      if (action === 'frame') { await this.frame(sessionId, recordKey); return { frames: this.recordings.get(recordKey)?.next }; }
      if (action === 'stop') {
        const rec = this.recordings.get(recordKey); if (!rec) throw new Error('recording_not_started');
        await this.frame(sessionId, recordKey); mkdirSync(join(rec.path, '..'), { recursive: true });
        try { await execFileAsync('ffmpeg', ['-y','-loglevel','error','-framerate',String(rec.fps),'-i',join(rec.dir,'frame-%04d.png'),rec.path]); }
        finally { rmSync(rec.dir, { recursive: true, force: true }); this.recordings.delete(recordKey); }
        return { path: rec.path, frames: rec.next };
      }
      throw new Error('invalid_recording_action');
    }
    if (name === 'screenshot_to_file') {
      const shot = await this.tool(sessionId, 'screenshot', input) as { image: string };
      const target = String(input.path); if (!target) throw new Error('path_required');
      mkdirSync(join(target, '..'), { recursive: true }); writeFileSync(target, Buffer.from(shot.image, 'base64')); return { path: target };
    }
    let dispatchInput = input;
    if (name === 'file_upload' || name === 'upload_image' || name === 'file_drop') {
      if(input.confirmed!==true)throw Error('confirmation_required');
      const paths = Array.isArray(input.paths) ? input.paths : input.path ? [input.path] : [];
      if(!paths.length)throw Error('upload_path_required');
      const checked:string[]=[];
      for (const path of paths) {
        const target = realpathSync(String(path));
        if (!this.config.uploadRoots.some(root => { const rel = relative(realpathSync(root), target); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); })) throw new Error('upload_path_not_allowed');
        checked.push(target);
      }
      if(b.platform==='Firefox'&&(name==='file_upload'||name==='upload_image')){
        let total=0;
        const mime:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.pdf':'application/pdf','.txt':'text/plain','.csv':'text/csv'};
        const files=checked.map(path=>{const size=statSync(path).size;total+=size;if(size>16_000_000||total>50_000_000)throw Error('firefox_upload_too_large');return{name:basename(path),type:mime[extname(path).toLowerCase()]||'application/octet-stream',data:readFileSync(path).toString('base64')};});
        dispatchInput={...input,filesData:files};
      }
    }
    if (this.recordings.has(recordKey) && !['screenshot','gif_record'].includes(name)) await this.frame(sessionId, recordKey);
    const requestId = crypto.randomUUID();
    const duration = browserToolTimeoutMs(name, input);
    const result = await new Promise<unknown>((done, fail) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); b.busy--; fail(new Error(`browser_action_timed_out: ${name === 'computer' ? String(input.action || name) : name} after ${Math.ceil(duration / 1000)}s`)); }, duration);
      this.pending.set(requestId, { resolve: done, reject: fail, timer, deviceId: id }); b.busy++;
      b.ws.send(JSON.stringify({ type: 'tool', id: requestId, name, input:dispatchInput }));
    });
    mkdirSync(configDir, { recursive: true });
    appendFileSync(join(configDir, 'activity.jsonl'), JSON.stringify(redact({ timestamp: new Date().toISOString(), sessionId, browser: id, tool: name, input })) + '\n');
    const macro = this.macros.get(sessionId); if (macro && !['screenshot','gif_record','macro_record'].includes(name)) { const now = Date.now(); macro.calls.push({ name, input: redact(input) as Record<string, unknown>, delay: now - macro.last }); macro.last = now; }
    if (this.recordings.has(recordKey) && !['screenshot','gif_record'].includes(name)) await this.frame(sessionId, recordKey);
    if (name === 'print_to_pdf' || name === 'save_page') {
      const target = String(input.path || ''); if (!target) throw new Error('path_required');
      mkdirSync(join(target, '..'), { recursive: true });
      const data = result as { pdf?: string; mhtml?: string };
      writeFileSync(target, name === 'print_to_pdf' ? Buffer.from(data.pdf || '', 'base64') : data.mhtml || '');
      return { path: target };
    }
    return result;
  }
  private async withFirefoxBidi<T>(port:number,work:(bidi:FirefoxBidi)=>Promise<T>):Promise<T>{
    const previous=this.bidiQueue;
    let release!:()=>void;
    this.bidiQueue=new Promise<void>(resolve=>{release=resolve});
    await previous;
    let bidi:FirefoxBidi|undefined;
    try{bidi=await FirefoxBidi.connect(port);return await work(bidi)}
    finally{try{await bidi?.close()}finally{release()}}
  }
  private async firefoxBidiComputer(sessionId:string,port:number,input:Record<string,unknown>):Promise<unknown>{
    const action=String(input.action||'');
    if(action==='key'&&/(^|\+)enter$/i.test(String(input.text))&&input.confirmed!==true)throw Error('confirmation_required');
    const point=await this.tool(sessionId,'bidi_target',{tabId:input.tabId,action,selector:input.selector,ref:input.ref,coordinate:input.coordinate}) as {x:number;y:number;dpr:number};
    return this.withFirefoxBidi(port,async bidi=>{
      const context=await bidi.contextForTab(Number(input.tabId));
      if(['left_click','right_click','middle_click','double_click','triple_click','hover','mouse_move'].includes(action))await bidi.pointer(context,point,action);
      else if(action==='left_click_drag'){
        const start=input.start as [number,number],end=input.end as [number,number];
        if(!start||!end)throw Error('drag_coordinates_required');
        await bidi.pointer(context,{x:start[0]/point.dpr,y:start[1]/point.dpr},action,{x:end[0]/point.dpr,y:end[1]/point.dpr});
      }else if(action==='scroll')await bidi.scroll(context,point,String(input.direction||'down'),Number(input.amount||400));
      else if(action==='key'){
        if(input.selector||input.ref)await bidi.pointer(context,point,'left_click');
        for(let i=0;i<Math.min(100,Number(input.repeat||1));i++)await bidi.key(context,String(input.text||''));
      }
      else if(action==='type'){
        if(input.selector||input.ref)await bidi.pointer(context,point,'left_click');
        await bidi.type(context,String(input.text||''));
      }
      return{ok:true,action,advancedInput:true};
    });
  }
  private async firefoxBidiClear(sessionId:string,port:number,input:Record<string,unknown>):Promise<unknown>{
    const point=await this.tool(sessionId,'bidi_target',{tabId:input.tabId,action:'type',selector:input.selector,ref:input.ref}) as {x:number;y:number};
    return this.withFirefoxBidi(port,async bidi=>{const context=await bidi.contextForTab(Number(input.tabId));if(input.selector||input.ref)await bidi.pointer(context,point,'left_click');await bidi.key(context,'ctrl+a');await bidi.key(context,'backspace');return{ok:true,advancedInput:true}});
  }
  private async firefoxBidiForm(sessionId:string,port:number,input:Record<string,unknown>):Promise<unknown>{
    const tabId=Number(input.tabId),results:unknown[]=[];
    return this.withFirefoxBidi(port,async bidi=>{
      let context:string|undefined;
      for(const field of (input.fields||[]) as {selector?:string;ref?:string;value:unknown}[]){
        const selector=field.selector||field.ref;if(!selector)throw Error('field_selector_required');
        const target=await this.tool(sessionId,'get_element',{tabId,selector}) as {tag:string;type?:string};
        if(target.tag==='textarea'||target.tag==='input'&&!['checkbox','radio','file','hidden','date','color'].includes(String(target.type))){
          const point=await this.tool(sessionId,'bidi_target',{tabId,selector,action:'type'}) as {x:number;y:number};
          context ||= await bidi.contextForTab(tabId);
          await bidi.pointer(context,point,'left_click');await bidi.key(context,'ctrl+a');await bidi.type(context,String(field.value));
          results.push(await this.tool(sessionId,'get_element',{tabId,selector}));
        }else results.push(await this.tool(sessionId,'form_input',{tabId,fields:[field],confirmed:input.confirmed,_bidiSkip:true}));
      }
      return results;
    });
  }
  private async frame(sessionId: string, key: string): Promise<void> {
    const rec = this.recordings.get(key); if (!rec) throw new Error('recording_not_started');
    const shot = await this.tool(sessionId, 'screenshot', { tabId: rec.tabId, format: 'png' }) as { image: string };
    writeFileSync(join(rec.dir, `frame-${String(rec.next++).padStart(4, '0')}.png`), Buffer.from(shot.image, 'base64'));
  }
  private async http(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader('Content-Type', 'application/json');
    if (req.socket.remoteAddress && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) { res.writeHead(403); res.end('{}'); return; }
    if (req.url === '/health') { res.end(JSON.stringify({ ok: true, port: this.config.port, browsers: this.list() })); return; }
    if (req.headers.authorization !== `Bearer ${this.config.apiToken}`) { res.writeHead(401); res.end(JSON.stringify({ error: 'unauthorized' })); return; }
    if (req.method !== 'POST' || !['/rpc', '/pair'].includes(req.url || '')) { res.writeHead(404); res.end('{}'); return; }
    try {
      let body = ''; for await (const chunk of req) { body += String(chunk); if (body.length > MAX_BODY) throw new Error('request_too_large'); }
      const data = JSON.parse(body) as Record<string, unknown>;
      const value = req.url === '/pair' ? this.pair(String(data.code || ''), String(data.name || 'Chrome')) : await this.tool(String(data.sessionId || 'http'), String(data.name), (data.input || {}) as Record<string, unknown>);
      res.end(JSON.stringify({ result: value }));
    } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: (e as Error).message })); }
  }
}
