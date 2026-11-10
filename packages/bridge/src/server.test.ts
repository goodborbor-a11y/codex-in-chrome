import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { Bridge } from './server.js';

const bridges: Bridge[] = [];
afterEach(async () => { vi.useRealTimers(); for (const b of bridges.splice(0)) { for (const ws of b.wss.clients) ws.terminate(); await new Promise<void>(done => b.server.close(() => done())); b.wss.close(); } });
describe('bridge pairing and routing', () => {
  it('pairs a browser, routes a tool, and fails after disconnect', async () => {
    const bridge = new Bridge(); bridges.push(bridge); const port = await bridge.listen();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/extension`);
    await new Promise<void>(done => ws.once('open', () => done()));
    ws.send(JSON.stringify({ type: 'hello', pairCode: 'ABC123' }));
    await new Promise<void>(done => ws.once('message', () => done()));
    const paired = bridge.pair('ABC123', 'Test Chrome');
    await new Promise<void>(done => ws.once('message', () => done()));
    ws.send(JSON.stringify({ type: 'hello', deviceId: paired.deviceId, token: bridge.config.devices.at(-1)?.token }));
    await new Promise<void>(done => ws.once('message', () => done()));
    expect(bridge.list()).toMatchObject([{ deviceId: paired.deviceId, name: 'Test Chrome' }]);
    ws.send(JSON.stringify({ type: 'select_choice', sessionId: 's1' }));
    await new Promise<void>(done => ws.once('message', () => done()));
    expect(bridge.selected.get('s1')).toBe(paired.deviceId);
    ws.on('message', raw => { const msg = JSON.parse(raw.toString()) as { type: string; id: string }; if (msg.type === 'tool') ws.send(JSON.stringify({ type: 'result', id: msg.id, result: { ok: true } })); });
    await expect(bridge.tool('s1', 'tabs_context', {})).resolves.toEqual({ ok: true });
    ws.close(); await new Promise<void>(done => ws.once('close', () => done()));
    await expect(bridge.tool('s1', 'tabs_context', {})).rejects.toThrow();
  });
  it('requires explicit selection when multiple browsers connect', async () => {
    const bridge = new Bridge(); bridges.push(bridge); await bridge.listen();
    bridge.browsers.set('a', { ws: {} as WebSocket, deviceId: 'a', name: 'A', lastSeen: Date.now(), busy: 0 });
    bridge.browsers.set('b', { ws: {} as WebSocket, deviceId: 'b', name: 'B', lastSeen: Date.now(), busy: 0 });
    await expect(bridge.tool('s2', 'tabs_context', {})).rejects.toThrow('Select a browser first');
  });
  it('returns a named timeout for a stalled click and clears the pending request', async () => {
    const bridge = new Bridge(); bridges.push(bridge); await bridge.listen();
    bridge.browsers.set('stalled', { ws: { readyState: WebSocket.OPEN, send: () => {} } as unknown as WebSocket, deviceId: 'stalled', name: 'Stalled', lastSeen: Date.now(), busy: 0 });
    bridge.selected.set('s3', 'stalled');
    vi.useFakeTimers();
    const pending = bridge.tool('s3', 'computer', { action: 'left_click' });
    const rejected = expect(pending).rejects.toThrow('browser_action_timed_out: left_click after 12s');
    await vi.advanceTimersByTimeAsync(12_000);
    await rejected;
    expect(bridge.pending.size).toBe(0);
    expect(bridge.browsers.get('stalled')?.busy).toBe(0);
  });
});
