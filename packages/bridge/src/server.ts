import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WebSocketServer, WebSocket } from 'ws';
import { configDir, loadConfig, saveConfig, type Config } from './config.js';

type Packet = { id?: string; type: string; [key: string]: unknown };
type Browser = { ws: WebSocket; deviceId: string; name: string; profile?: string; platform?: string; buildId?: string; lastSeen: number; busy: number };
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
          browser = { ws, deviceId: device.deviceId, name: device.name, profile: device.profile, platform: String(msg.platform || ''), buildId: String(msg.buildId || ''), lastSeen: Date.now(), busy: 0 };
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
  list(): unknown[] { return [...this.browsers.values()].map(b => ({ deviceId: b.deviceId, name: b.name, platform: b.platform, buildId: b.buildId, profile: b.profile, onThisComputer: true, inUse: b.busy > 0, lastSeen: b.lastSeen })); }
  async tool(sessionId: string, name: string, input: Record<string, unknown>): Promise<unknown> {
    if (name === 'browsers_list') return this.list();
    if (name === 'browser_select') { const id = String(input.deviceId || ''); if (!this.browsers.has(id)) throw new Error('browser_disconnected'); this.selected.set(sessionId, id); return { selected: id }; }
    if (name === 'browser_switch') {
      for (const b of this.browsers.values()) b.ws.send(JSON.stringify({ type: 'select_prompt', sessionId }));
      return { awaitingSelection: true, browsers: this.list() };
    }
    const id = this.selected.get(sessionId) || (this.browsers.size === 1 ? [...this.browsers.keys()][0] : undefined);
    if (!id) throw new Error(`Select a browser first: ${JSON.stringify(this.list())}`);
    const b = this.browsers.get(id); if (!b || b.ws.readyState !== WebSocket.OPEN) throw new Error('browser_disconnected');
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
    if (name === 'file_upload' || name === 'upload_image' || name === 'file_drop') {
      const paths = Array.isArray(input.paths) ? input.paths : input.path ? [input.path] : [];
      for (const path of paths) {
        const target = realpathSync(String(path));
        if (!this.config.uploadRoots.some(root => { const rel = relative(realpathSync(root), target); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)); })) throw new Error('upload_path_not_allowed');
      }
    }
    if (this.recordings.has(recordKey) && !['screenshot','gif_record'].includes(name)) await this.frame(sessionId, recordKey);
    const requestId = crypto.randomUUID();
    const duration = ['batch','computer'].includes(name) ? 25_000 : 10_000;
    const result = await new Promise<unknown>((done, fail) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); b.busy--; fail(new Error('renderer_frozen')); }, duration);
      this.pending.set(requestId, { resolve: done, reject: fail, timer, deviceId: id }); b.busy++;
      b.ws.send(JSON.stringify({ type: 'tool', id: requestId, name, input }));
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
