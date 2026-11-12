import WebSocket from 'ws';

type Packet = { id?: number; type: string; result?: Record<string, any>; error?: string; message?: string };
type Pending = { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };
type Point = { x: number; y: number };

const special: Record<string, string> = {
  enter: '\uE007', return: '\uE006', tab: '\uE004', backspace: '\uE003', delete: '\uE017',
  escape: '\uE00C', esc: '\uE00C', arrowleft: '\uE012', arrowup: '\uE013',
  arrowright: '\uE014', arrowdown: '\uE015', home: '\uE011', end: '\uE010',
  pageup: '\uE00E', pagedown: '\uE00F', space: ' '
};
const modifiers: Record<string, string> = { ctrl: '\uE009', control: '\uE009', shift: '\uE008', alt: '\uE00A', meta: '\uE03D' };

export class FirefoxBidi {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private started = false;
  private constructor(port: number) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/session`, { handshakeTimeout: 4000 });
    this.ws.on('message', raw => {
      let packet: Packet;
      try { packet = JSON.parse(raw.toString()) as Packet; } catch { return; }
      if (packet.id === undefined) return;
      const pending = this.pending.get(packet.id);
      if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(packet.id);
      if (packet.type === 'error') pending.reject(new Error(`firefox_bidi_${packet.error}: ${packet.message}`));
      else pending.resolve(packet.result);
    });
    this.ws.on('close', () => { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('firefox_bidi_disconnected')); } this.pending.clear(); });
  }
  static async connect(port: number): Promise<FirefoxBidi> {
    const client = new FirefoxBidi(port);
    await new Promise<void>((resolve, reject) => { client.ws.once('open', () => resolve()); client.ws.once('error', reject); });
    try { await client.call('session.new', { capabilities: { alwaysMatch: {} } }); client.started = true; return client; }
    catch (error) { client.ws.close(); throw error; }
  }
  async call(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`firefox_bidi_timeout: ${method}`)); }, 15_000);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }), error => { if (error) { clearTimeout(timer); this.pending.delete(id); reject(error); } });
    });
  }
  async close(): Promise<void> { if (this.started && this.ws.readyState === WebSocket.OPEN) await this.call('session.end').catch(() => {}); this.ws.close(); }
  async contextForTab(tabId: number): Promise<string> {
    const tree = await this.call('browsingContext.getTree');
    for (const entry of tree.contexts as { context: string }[]) {
      try {
        const result = await this.call('script.evaluate', { expression: 'document.documentElement?.getAttribute("data-saint-tab-id")', target: { context: entry.context }, awaitPromise: false, resultOwnership: 'none' });
        if (result.result?.value === String(tabId)) return entry.context;
      } catch { /* inaccessible context */ }
    }
    throw new Error(`firefox_bidi_tab_not_found: ${tabId}`);
  }
  async pointer(context: string, point: Point, action: string, end?: Point): Promise<void> {
    const x = Math.round(point.x), y = Math.round(point.y);
    const actions: Record<string, unknown>[] = [{ type: 'pointerMove', x, y, origin: 'viewport', duration: 100 }];
    if (action === 'left_click_drag' && end) actions.push({ type: 'pointerDown', button: 0 }, { type: 'pointerMove', x: Math.round(end.x), y: Math.round(end.y), origin: 'viewport', duration: 450 }, { type: 'pointerUp', button: 0 });
    else if (action === 'hover' || action === 'mouse_move') { /* movement only */ }
    else {
      const button = action === 'right_click' ? 2 : action === 'middle_click' ? 1 : 0;
      const count = action === 'double_click' ? 2 : action === 'triple_click' ? 3 : 1;
      for (let i = 0; i < count; i++) actions.push({ type: 'pointerDown', button }, { type: 'pointerUp', button });
    }
    await this.call('input.performActions', { context, actions: [{ type: 'pointer', id: 'saint-mouse', parameters: { pointerType: 'mouse' }, actions }] });
  }
  async key(context: string, key: string): Promise<void> {
    const parts = key.toLowerCase().split('+').map(x => x.trim());
    const main = parts.pop() || '';
    const mods = parts.map(x => modifiers[x]);
    if (mods.some(x => !x)) throw new Error(`firefox_bidi_unsupported_key: ${key}`);
    const value = special[main] || (main.length === 1 ? main : '');
    if (!value) throw new Error(`firefox_bidi_unsupported_key: ${key}`);
    const actions = [...mods.map(value => ({ type: 'keyDown', value })), { type: 'keyDown', value }, { type: 'keyUp', value }, ...mods.reverse().map(value => ({ type: 'keyUp', value }))];
    await this.call('input.performActions', { context, actions: [{ type: 'key', id: 'saint-keyboard', actions }] });
  }
  async type(context: string, text: string): Promise<void> {
    const characters=[...text];
    for (let start = 0; start < characters.length; start += 100) {
      const chunk = characters.slice(start, start + 100);
      const actions = chunk.flatMap(value => [{ type: 'keyDown', value }, { type: 'keyUp', value }]);
      await this.call('input.performActions', { context, actions: [{ type: 'key', id: 'saint-keyboard', actions }] });
    }
  }
  async scroll(context: string, point: Point, direction: string, amount: number): Promise<void> {
    const dx = direction === 'left' ? -amount : direction === 'right' ? amount : 0;
    const dy = direction === 'up' ? -amount : direction === 'down' ? amount : 0;
    await this.call('input.performActions', { context, actions: [{ type: 'wheel', id: 'saint-wheel', actions: [{ type: 'scroll', x: Math.round(point.x), y: Math.round(point.y), deltaX: Math.round(dx), deltaY: Math.round(dy), duration: Math.min(1000, Math.max(320, Math.abs(amount))), origin: 'viewport' }] }] });
  }
}
