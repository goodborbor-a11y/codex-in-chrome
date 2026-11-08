type Data = Record<string, any>;
import { humanPath } from './motion.js';
import { rankElements, type Candidate } from './ranker.js';
declare const __BUILD_ID__: string;
type BridgePacket = { type: string; id?: string; name?: string; input?: Data; [key: string]: unknown };
type Device = { deviceId: string; token: string; name: string };
const state = { ws: null as WebSocket | null, port: 17345, scanning: false, connected: false, paired: false, code: '', device: null as Device | null, paused: false, allowAll: false, selectSession: '' as string, active: new Set<number>(), owned: new Set<number>(), downloadIds: new Set<number>(), groups: new Map<number, number>(), once: new Set<string>(), allowed: new Set<string>(), credentials: new Set<string>(), log: [] as string[], cursor: new Map<number, [number, number]>(), mainStatus: new Map<number, number>(), console: new Map<number, Data[]>(), network: new Map<number, Data[]>(), dialog: new Map<number, string>(), mocks: new Map<number, Data>() };
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
function code(): string { const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const n = new Uint32Array(6); crypto.getRandomValues(n); return [...n].map(v => chars[v % chars.length]).join(''); }
function origin(url?: string): string { try { const parsed=new URL(url || ''); return ['http:','https:'].includes(parsed.protocol) ? parsed.origin : ''; } catch { return ''; } }
function entry(name: string, detail = ''): void { state.log.push(`${new Date().toLocaleTimeString()} ${name} ${detail}`); if (state.log.length > 100) state.log.shift(); }
async function save(): Promise<void> { await chrome.storage.local.set({ device: state.device, allowed: [...state.allowed], allowAll: state.allowAll, credentials: [...state.credentials], port: state.port }); }
async function init(): Promise<void> { const saved = await chrome.storage.local.get(['device', 'allowed', 'allowAll', 'credentials', 'port', 'ownedTabIds']); const tabs=await chrome.tabs.query({}); const groups=await chrome.tabGroups.query({title:'Codex'}); const valid=new Set(groups.filter(g=>g.color==='blue').map(g=>g.id)); const existing=new Set(tabs.filter(t=>t.id!=null&&valid.has(t.groupId)).map(t=>t.id!)); state.owned=new Set(((saved.ownedTabIds as number[])||[]).filter(id=>existing.has(id))); state.device = (saved.device as Device) || null; state.paired = !!state.device; state.allowed = new Set(((saved.allowed as string[]) || []).filter(x=>origin(x)===x)); state.allowAll = saved.allowAll === true; state.credentials = new Set(((saved.credentials as string[]) || []).filter(x=>origin(x)===x)); state.port = Number(saved.port) || 17345; state.code = code(); chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); void connect(); }
async function saveOwned(): Promise<void> { await chrome.storage.local.set({ownedTabIds:[...state.owned]}); }
async function discover(): Promise<number | undefined> {
  const probe = async (port: number): Promise<number | undefined> => {
    try { const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) }); const body = await response.json() as { ok?: boolean }; return response.ok && body.ok ? port : undefined; }
    catch { return undefined; }
  };
  const preferred = await probe(state.port); if (preferred) return preferred;
  const candidates = Array.from({ length: 655 }, (_, i) => 17345 + i).filter(p => p !== state.port);
  for (let i = 0; i < candidates.length; i += 20) {
    const group = candidates.slice(i, i + 20);
    const found = await Promise.all(group.map(probe));
    const match = found.find(Boolean); if (match) return match;
  }
  return undefined;
}
async function connect(): Promise<void> {
  if (state.scanning || state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) return;
  state.scanning = true;
  const port = await discover(); state.scanning = false;
  if (!port) { setTimeout(() => void connect(), 3000); return; }
  state.port = port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/extension`); state.ws = ws;
  ws.onopen = () => { state.connected = true; void save(); void chrome.action.setBadgeBackgroundColor({ color: '#2F6BFF' }); void chrome.action.setBadgeText({ text: '1' }); ws.send(JSON.stringify({ type: 'hello', deviceId: state.device?.deviceId, token: state.device?.token, pairCode: state.code, platform: navigator.platform, buildId: __BUILD_ID__ })); };
  ws.onmessage = e => { void incoming(JSON.parse(e.data) as BridgePacket); };
  ws.onclose = () => { state.connected = false; state.ws = null; void chrome.action.setBadgeText({ text: '' }); setTimeout(() => void connect(), 1000); };
  ws.onerror = () => ws.close();
}
async function incoming(msg: BridgePacket): Promise<void> {
  if (msg.type === 'ready') { const tabs=await chrome.tabs.query({}); const groups=await chrome.tabGroups.query({title:'Codex'}); for(const g of groups) if(g.color==='blue') state.groups.set(g.windowId,g.id); for(const t of tabs) if(t.id&&state.groups.get(t.windowId)===t.groupId) await attached(t.id).catch(()=>{}); return; }
  if (msg.type === 'select_prompt') { state.selectSession = String(msg.sessionId || ''); await chrome.sidePanel.open({ windowId: (await chrome.windows.getCurrent()).id! }).catch(()=>{}); return; }
  if (msg.type === 'selected') { state.selectSession = ''; return; }
  if (msg.type === 'paired') { state.device = { deviceId: String(msg.deviceId), token: String(msg.token), name: String(msg.name) }; state.paired = true; await save(); state.ws?.send(JSON.stringify({ type: 'hello', ...state.device, platform: navigator.platform, buildId: __BUILD_ID__ })); return; }
  if (msg.type === 'heartbeat') { state.ws?.send(JSON.stringify({ type: 'heartbeat' })); return; }
  if (msg.type === 'tool' && msg.id && msg.name) {
    void chrome.action.setBadgeText({ text: '•' });
    try { const result = await run(msg.name, msg.input || {}); state.ws?.send(JSON.stringify({ type: 'result', id: msg.id, result })); }
    catch (e) { state.ws?.send(JSON.stringify({ type: 'result', id: msg.id, error: (e as Error).message })); }
    finally { void chrome.action.setBadgeText({ text: state.connected ? '1' : '' }); }
  }
}
chrome.alarms.create('keepalive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => { if (!state.connected) void connect(); else state.ws?.send(JSON.stringify({ type: 'heartbeat' })); });
chrome.debugger.onEvent.addListener((source, method, params) => {
  const id = source.tabId; if (id == null) return;
  const p = params as Data | undefined;
  if (method === 'Network.responseReceived' && p?.type === 'Document') state.mainStatus.set(id, p.response.status);
  if (method === 'Runtime.consoleAPICalled' || method === 'Log.entryAdded') { const log = state.console.get(id) || []; log.push({ time: Date.now(), method, params }); state.console.set(id, log.slice(-500)); }
  if (method.startsWith('Network.')) { const log = state.network.get(id) || []; log.push({ time: Date.now(), method, params }); state.network.set(id, log.slice(-1000)); }
  if (method === 'Page.javascriptDialogOpening') { const mode = state.dialog.get(id) || 'ask'; if (mode !== 'ask') void cdp(id, 'Page.handleJavaScriptDialog', { accept: mode === 'auto-accept' }); }
  if (method === 'Fetch.requestPaused') { const mock=state.mocks.get(id); if(mock && p?.request?.url?.includes(String(mock.urlPattern||''))) void cdp(id,'Fetch.fulfillRequest',{requestId:p.requestId,responseCode:Number(mock.status||200),responseHeaders:Object.entries(mock.headers||{}).map(([name,value])=>({name,value:String(value)})),body:btoa(String(mock.body||''))}); else void cdp(id,'Fetch.continueRequest',{requestId:p?.requestId}); }
});
chrome.debugger.onDetach.addListener(source => { if (source.tabId != null) state.active.delete(source.tabId); });
chrome.tabs.onUpdated.addListener((tabId,change) => { if(change.status==='complete'&&state.active.has(tabId)) void ensureContent(tabId); });
async function cdp(tabId: number, method: string, params: Data = {}): Promise<any> { let timer: ReturnType<typeof setTimeout> | undefined; try { return await Promise.race([chrome.debugger.sendCommand({ tabId }, method, params),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('renderer_frozen')),8000);})]); } finally { if(timer) clearTimeout(timer); } }
async function ensureContent(tabId: number): Promise<void> {
  try { await chrome.tabs.sendMessage(tabId, { type: 'attach' }, { frameId: 0 }); }
  catch {
    await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: ['content.js'] }).catch(() => {});
    await chrome.tabs.sendMessage(tabId, { type: 'attach' }, { frameId: 0 }).catch(() => {});
  }
}
async function attached(tabId: number): Promise<void> {
  if (state.active.has(tabId)) return;
  await chrome.debugger.attach({ tabId }, '1.3'); state.active.add(tabId);
  await Promise.all(['Page.enable', 'Runtime.enable', 'Network.enable', 'Log.enable'].map(m => cdp(tabId, m).catch(() => {})));
  await ensureContent(tabId);
}
async function group(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId); const windowId = tab.windowId;
  let groupId = state.groups.get(windowId);
  if (groupId != null) { try { const existing = await chrome.tabGroups.get(groupId); if (existing.windowId !== windowId) groupId = undefined; } catch { groupId = undefined; } if (groupId == null) state.groups.delete(windowId); }
  if (groupId == null) {
    const groups = await chrome.tabGroups.query({ windowId, title: 'Codex' });
    groupId = groups.find(g => g.color === 'blue')?.id;
  }
  if (groupId == null) groupId = await chrome.tabs.group({ tabIds: [tabId] });
  else await chrome.tabs.group({ groupId, tabIds: [tabId] });
  state.groups.set(windowId, groupId); await chrome.tabGroups.update(groupId, { title: 'Codex', color: 'blue' });
  const grouped = await chrome.tabs.get(tabId); if (grouped.groupId !== groupId) throw Error('tab_group_not_persisted');
}
async function tabFor(input: Data, allowUnlisted = false): Promise<chrome.tabs.Tab> {
  if (!Number.isInteger(input.tabId)) throw Error('tabId_required');
  const tab = await chrome.tabs.get(input.tabId);
  if (!allowUnlisted) { const valid = tab.groupId >= 0 ? await chrome.tabGroups.get(tab.groupId).catch(()=>null) : null; if(!valid||valid.windowId!==tab.windowId||valid.title!=='Codex'||valid.color!=='blue') throw Error('tab_not_in_codex_group'); state.groups.set(tab.windowId,valid.id); }
  return tab;
}
async function permitted(tab: chrome.tabs.Tab, name: string, input: Data): Promise<void> {
  const site = origin(tab.url);
  if (!site || (!state.allowAll && !state.allowed.has(site) && !state.once.has(site))) throw Error(`origin_not_allowed: ${site || tab.url}`);
  if (state.paused) throw Error('agent_paused');
  if (/^(file_upload|file_drop|upload_image|download_url|print_to_pdf|save_page)$/.test(name) && input.confirmed !== true) throw Error('confirmation_required');
  if ((name === 'computer' || name === 'form_input') && input.confirmed !== true && /submit|send|publish|purchase|delete|accept terms/i.test(JSON.stringify(input))) throw Error('confirmation_required');
}
async function safeField(tabId: number, input: Data): Promise<void> {
  const field = input.ref || input.selector ? await content(tabId, 'element', input) : (await cdp(tabId, 'Runtime.evaluate', { expression: '({type:document.activeElement?.getAttribute("type"),fieldName:document.activeElement?.getAttribute("name"),id:document.activeElement?.id})', returnByValue: true })).result?.value;
  if (!field) return;
  const label = `${field.type || ''} ${field.fieldName || ''} ${field.id || ''}`;
  if (/card.?number|\bcvv\b|\bcvc\b|\bssn\b/i.test(label)) throw Error('blocked_sensitive_field');
  const tab = await chrome.tabs.get(tabId);
  if (/password/i.test(label) && !state.credentials.has(origin(tab.url))) throw Error('credential_entry_not_allowed');
}
async function confirmTarget(tabId: number, input: Data): Promise<void> {
  if (input.confirmed === true || !(input.ref || input.selector)) return;
  const target = await content(tabId, 'element', input) as Data;
  const label = `${target.name || ''} ${target.text || ''} ${target.attributes?.['aria-label'] || ''}`;
  if (/\b(submit|send|publish|purchase|buy|checkout|delete|remove|accept terms|agree to)\b/i.test(label)) throw Error(`confirmation_required: ${String(target.name || '').slice(0,80)}`);
}
async function offscreen(action: string, text?: string): Promise<any> {
  if (!await chrome.offscreen.hasDocument()) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['CLIPBOARD'], justification: 'Read and write the browser clipboard for explicit Codex Chrome tools' });
  const response = await chrome.runtime.sendMessage({ target: 'offscreen', action, text });
  if (response?.error) throw Error(response.error); return response;
}
async function content(tabId: number, type: string, input: Data = {}): Promise<any> {
  const response = await chrome.tabs.sendMessage(tabId, { type, ...input }, { frameId: 0 });
  if (!response?.ok) throw Error(response?.error || 'content_script_unavailable'); return response.result;
}
async function point(tabId: number, input: Data): Promise<[number, number]> {
  if (Array.isArray(input.coordinate)) return [Number(input.coordinate[0]), Number(input.coordinate[1])];
  const e = await content(tabId, 'scroll_ref', { ref: input.ref, selector: input.selector });
  const b = e.box; return [Math.round(b.x + b.w / 2), Math.round(b.y + b.h / 2)];
}
async function move(tabId: number, to: [number, number]): Promise<void> {
  const from = state.cursor.get(tabId) || [48, 48];
  if (from[0]===to[0]&&from[1]===to[1]) { await cdp(tabId,'Input.dispatchMouseEvent',{type:'mouseMoved',x:to[0],y:to[1]}); await chrome.tabs.sendMessage(tabId,{type:'cursor',x:to[0],y:to[1]},{frameId:0}).catch(()=>{}); state.cursor.set(tabId,to); return; }
  const pts = humanPath(from, to); const duration = 380 + Math.random()*420;
  for (const [x, y] of pts) { await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await chrome.tabs.sendMessage(tabId, { type: 'cursor', x, y }, { frameId: 0 }).catch(() => {}); await wait(duration / pts.length); }
  state.cursor.set(tabId, to);
}
async function click(tabId: number, input: Data, count = 1, button = 'left'): Promise<void> {
  await confirmTarget(tabId,input);
  const [x, y] = await point(tabId, input); await move(tabId, [x,y]);
  if (input.ref || input.selector) {
    const hit = await cdp(tabId, 'Runtime.evaluate', { expression: `document.elementFromPoint(${x},${y})?.outerHTML.slice(0,200)`, returnByValue: true });
    const target = await content(tabId, 'element', { ref: input.ref, selector: input.selector });
    if (!hit.result?.value || !String(hit.result.value).includes(String(target.name).slice(0, 20)) && target.role === 'button') throw Error(`obscured_by: ${hit.result?.value || 'unknown'}`);
  }
  await content(tabId, 'press', { x, y });
  try { for (let n = 1; n <= count; n++) { await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x,y,button,clickCount:n }); await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x,y,button,clickCount:n }); } }
  finally { await content(tabId, 'release').catch(() => {}); }
  await wait(290 + Math.random()*130);
}
const keyMap: Record<string, [string,string,number]> = { enter:['Enter','Enter',13],tab:['Tab','Tab',9],escape:['Escape','Escape',27],backspace:['Backspace','Backspace',8],delete:['Delete','Delete',46],arrowup:['ArrowUp','ArrowUp',38],arrowdown:['ArrowDown','ArrowDown',40],arrowleft:['ArrowLeft','ArrowLeft',37],arrowright:['ArrowRight','ArrowRight',39],home:['Home','Home',36],end:['End','End',35],pageup:['PageUp','PageUp',33],pagedown:['PageDown','PageDown',34],space:[' ','Space',32] };
const punctuation: Record<string, [string, number]> = {
  '-':['Minus',189], '_':['Minus',189], '=':['Equal',187], '+':['Equal',187],
  ',':['Comma',188], '<':['Comma',188], '.':['Period',190], '>':['Period',190],
  '/':['Slash',191], '?':['Slash',191], ';':['Semicolon',186], ':':['Semicolon',186],
  "'":['Quote',222], '"':['Quote',222], '[':['BracketLeft',219], '{':['BracketLeft',219],
  ']':['BracketRight',221], '}':['BracketRight',221], '\\':['Backslash',220], '|':['Backslash',220],
  '`':['Backquote',192], '~':['Backquote',192], '!':['Digit1',49], '@':['Digit2',50],
  '#':['Digit3',51], '$':['Digit4',52], '%':['Digit5',53], '^':['Digit6',54],
  '&':['Digit7',55], '*':['Digit8',56], '(':['Digit9',57], ')':['Digit0',48]
};
async function key(tabId: number, text: string): Promise<void> {
  const parts = text.toLowerCase().split('+'); const name = parts.pop() || ''; const mod = (parts.includes('alt')?1:0)|(parts.includes('ctrl')?2:0)|(parts.includes('meta')?4:0)|(parts.includes('shift')?8:0);
  const actual = text.length === 1 ? text : name;
  const symbol = actual.length === 1 ? punctuation[actual] : undefined;
  const k = keyMap[name] || (symbol ? [actual, symbol[0], symbol[1]] : [actual.length === 1 ? actual : text, name.length === 1 ? (/\d/.test(name) ? `Digit${name}` : `Key${name.toUpperCase()}`) : text, name.length === 1 ? name.toUpperCase().charCodeAt(0) : 0]);
  const params = { key:k[0], code:k[1], windowsVirtualKeyCode:k[2], nativeVirtualKeyCode:k[2], modifiers:mod, text: mod ? '' : k[0].length === 1 ? k[0] : '' };
  await cdp(tabId, 'Input.dispatchKeyEvent', { type:'keyDown', ...params }); await cdp(tabId, 'Input.dispatchKeyEvent', { type:'keyUp', ...params });
}
async function screenshot(tabId: number, input: Data): Promise<Data> {
  if (!input.include_cursor) { await content(tabId, 'hide').catch(() => {}); await wait(50); }
  try { const tab = await chrome.tabs.get(tabId);
    const dims = await cdp(tabId, 'Runtime.evaluate', { expression: '({width:innerWidth,height:innerHeight,scrollX,scrollY})', returnByValue:true });
    const frame = dims.result.value as {width:number;height:number;scrollX:number;scrollY:number};
    const layout = input.fullPage ? await cdp(tabId,'Page.getLayoutMetrics') : null;
    const bounds = input.clip ? { x:frame.scrollX+Number(input.clip.x),y:frame.scrollY+Number(input.clip.y),width:Number(input.clip.w),height:Number(input.clip.h) } : input.fullPage ? { x:0,y:0,width:layout.cssContentSize.width,height:layout.cssContentSize.height } : { x:frame.scrollX,y:frame.scrollY,width:frame.width,height:frame.height };
    const result = await cdp(tabId, 'Page.captureScreenshot', { format: input.format || 'png', quality: input.quality, captureBeyondViewport: !!input.fullPage, clip: { ...bounds, scale: Number(input.scale || 1) } });
    return { image: result.data, mimeType: `image/${input.format || 'png'}`, frame, capture:bounds, url: tab.url };
  } finally { if (!input.include_cursor) await content(tabId, 'show').catch(() => {}); }
}
async function computer(tabId: number, input: Data): Promise<unknown> {
  const action = String(input.action || ''); await content(tabId, 'action', { action });
  if (['left_click','right_click','middle_click','double_click','triple_click'].includes(action)) { await click(tabId,input,action==='double_click'?2:action==='triple_click'?3:1,action==='right_click'?'right':action==='middle_click'?'middle':'left'); return { ok:true }; }
  if (action === 'hover' || action === 'mouse_move') { await move(tabId,await point(tabId,input)); return { ok:true }; }
  if (action === 'scroll') { const [x,y] = input.coordinate || state.cursor.get(tabId) || [400,300]; const amount = Number(input.amount || 400); const dir = String(input.direction || 'down'); await cdp(tabId,'Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX:dir==='left'?-amount:dir==='right'?amount:0,deltaY:dir==='up'?-amount:dir==='down'?amount:0}); return {ok:true}; }
  if (action === 'scroll_to') return content(tabId,'scroll_ref',{ref:input.ref,selector:input.selector});
  if (action === 'key') { if(/(^|\+)enter$/i.test(String(input.text))&&input.confirmed!==true) throw Error('confirmation_required'); for(let i=0;i<(input.repeat||1);i++) await key(tabId,String(input.text)); return {ok:true}; }
  if (action === 'type') { await safeField(tabId,input); const text=String(input.text || ''); for (const ch of text) { await key(tabId,ch); const pause = input.delayMs !== undefined ? Number(input.delayMs) : input.humanize === false ? 0 : 55 + Math.random()*55 + (/[,.;:!? ]/.test(ch) ? 65 + Math.random()*75 : 0); if (pause > 0) await wait(pause); } return {typed:text.length}; }
  if (action === 'wait') { await wait(Math.min(8000,Number(input.seconds || 1)*1000)); return {ok:true}; }
  if (action === 'screenshot') return screenshot(tabId,input);
  if (action === 'left_click_drag') { const [sx,sy] = input.start, [ex,ey] = input.end; await move(tabId,[sx,sy]); await cdp(tabId,'Input.dispatchMouseEvent',{type:'mousePressed',x:sx,y:sy,button:'left',clickCount:1}); for(const [x,y] of humanPath([sx,sy],[ex,ey])) await cdp(tabId,'Input.dispatchMouseEvent',{type:'mouseMoved',x,y,button:'left',buttons:1}); await cdp(tabId,'Input.dispatchMouseEvent',{type:'mouseReleased',x:ex,y:ey,button:'left',clickCount:1}); state.cursor.set(tabId,[ex,ey]); return {ok:true}; }
  throw Error(`unsupported_action: ${action}`);
}
async function run(name: string, input: Data): Promise<unknown> {
  if (name==='extension_reload') { setTimeout(()=>chrome.runtime.reload(),500); return {reloading:true}; }
  if (name==='sessions_list') return (await chrome.sessions.getRecentlyClosed({maxResults:25})).map(s=>({sessionId:s.window?.sessionId||s.tab?.sessionId,lastModified:s.lastModified,window:s.window?{tabs:s.window.tabs?.map(t=>({title:t.title,url:t.url}))}:undefined,tab:s.tab?{title:s.tab.title,url:s.tab.url}:undefined}));
  if (name==='sessions_restore') { if(input.confirmed!==true||typeof input.sessionId!=='string') throw Error('confirmation_required'); const restored=await chrome.sessions.restore(input.sessionId); return {sessionId:restored.window?.sessionId||restored.tab?.sessionId,windowId:restored.window?.id,tabId:restored.tab?.id}; }
  if (name==='permissions_status') return {allSites:state.allowAll};
  if (name==='permissions_set') { if(input.confirmed!==true||typeof input.allSites!=='boolean') throw Error('confirmation_required'); state.allowAll=input.allSites; await save(); entry('permissions_set',state.allowAll?'all sites':'listed sites'); return {allSites:state.allowAll}; }
  if (name==='clipboard_write') return offscreen('write',String(input.text||''));
  if (name==='clipboard_read') return offscreen('read');
  if (name==='downloads_list') return (await chrome.downloads.search({})).filter(d=>state.downloadIds.has(d.id));
  if (name==='download_url') { if(input.confirmed!==true) throw Error('confirmation_required'); const site=origin(String(input.url)); if(!site||!state.allowAll&&!state.allowed.has(site)&&!state.once.has(site)) throw Error('origin_not_allowed'); const base=String(input.filename||new URL(String(input.url)).pathname.split('/').pop()||'download').split(/[\\/]/).pop()||'download'; const filename=`Codex Chrome/${base.replace(/[:*?"<>|]/g,'_')}`; const downloadId=await chrome.downloads.download({url:String(input.url),filename,saveAs:false}); if(downloadId!=null) state.downloadIds.add(downloadId); return {downloadId}; }
  if (name==='download_wait') { const deadline=Date.now()+Math.min(Number(input.timeoutMs||8000),9000); while(Date.now()<deadline) { const items=await chrome.downloads.search({orderBy:['-startTime'],limit:30}); const found=items.find(d=>state.downloadIds.has(d.id)&&d.state==='complete'&&(!input.filenameHint||d.filename.includes(input.filenameHint))); if(found) return {filename:found.filename,size:found.fileSize,url:found.url}; await wait(250); } throw Error('download_timeout'); }
  if (name === 'tabs_create') { const tab = await chrome.tabs.create({ url: 'about:blank', active: input.active !== false }); if (!tab.id) throw Error('tab_creation_failed'); state.owned.add(tab.id); await saveOwned(); try { await group(tab.id); await attached(tab.id); return { tabId:tab.id,groupId:(await chrome.tabs.get(tab.id)).groupId }; } catch(e) { await chrome.tabs.remove(tab.id).catch(()=>{}); state.owned.delete(tab.id); await saveOwned(); throw e; } }
  if (name === 'window_new') { const win = await chrome.windows.create({ url: 'about:blank', focused:false }); const tab=win?.tabs?.[0]; if(!tab?.id) throw Error('window_creation_failed'); state.owned.add(tab.id); await saveOwned(); try { await group(tab.id); return {windowId:win?.id,tabId:tab.id}; } catch(e) { await chrome.tabs.remove(tab.id).catch(()=>{}); state.owned.delete(tab.id); await saveOwned(); throw e; } }
  if (name === 'tabs_close') { const id=Number(input.tabId); if(!state.owned.has(id)) throw Error('cannot_close_user_tab'); await tabFor(input); await chrome.tabs.remove(id); state.owned.delete(id); await saveOwned(); return {closed:id}; }
  if (name === 'tabs_list_all') return (await chrome.tabs.query({})).filter(t=>!state.groups.has(t.windowId)||state.groups.get(t.windowId)!==t.groupId).map(t=>({tabId:t.id,title:t.title,url:t.url}));
  if (name === 'tabs_context') { const all=await chrome.tabs.query({}); const valid=new Set((await chrome.tabGroups.query({title:'Codex'})).filter(g=>g.color==='blue').map(g=>g.id)); const tabs=all.filter(t=>valid.has(t.groupId)).map(t=>({tabId:t.id,title:t.title,url:t.url,active:t.active,attached:t.id!=null&&state.active.has(t.id),groupId:t.groupId})); if(!tabs.length&&input.createIfEmpty) return run('tabs_create',{}); return tabs; }
  if (name === 'tabs_activate') { const t=await tabFor(input,true); if(state.groups.get(t.windowId)!==t.groupId&&input.confirmed!==true) throw Error('confirmation_required_for_user_tab'); await group(t.id!); await chrome.tabs.update(t.id!,{active:true}); await attached(t.id!); return {tabId:t.id,groupId:state.groups.get(t.windowId)}; }
  const tab=await tabFor(input); const id=tab.id!;
  if (name === 'navigate') { const started=Date.now(); await attached(id); const previous=tab.url; const dest=String(input.url || ''); if(['back','forward','reload'].includes(dest)) await cdp(id,`Page.${dest==='back'?'navigateToHistoryEntry':dest==='forward'?'navigateToHistoryEntry':'reload'}`,dest==='reload'?{}:{entryId: (await cdp(id,'Page.getNavigationHistory')).entries[(await cdp(id,'Page.getNavigationHistory')).currentIndex+(dest==='back'?-1:1)]?.id}); else { const site=origin(dest); if(!site||!state.allowAll&&!state.allowed.has(site)&&!state.once.has(site)) throw Error(`origin_not_allowed: ${site}`); await cdp(id,'Page.navigate',{url:dest}); } let final=await chrome.tabs.get(id); const deadline=Date.now()+8000; while(final.status!=='complete'&&Date.now()<deadline){await wait(100);final=await chrome.tabs.get(id);} await ensureContent(id); await wait(Math.max(0,1100-(Date.now()-started))); return {url:final.url,status:state.mainStatus.get(id),redirected:dest!==final.url&&dest!==previous}; }
  await permitted(tab,name,input); await attached(id); entry(name,origin(tab.url));
  if (name==='screenshot') return screenshot(id,input);
  if (name==='zoom') { const [x0,y0,x1,y1]=input.region as [number,number,number,number]; return screenshot(id,{clip:{x:x0,y:y0,w:x1-x0,h:y1-y0},scale:input.scale||2,format:'png',include_cursor:input.include_cursor}); }
  if (name==='computer') return computer(id,input);
  if (name==='read_page') return content(id,'read',{mode:input.filter,maxNodes:input.maxNodes});
  if (name==='get_page_text') return content(id,'text',{mode:input.mode});
  if (name==='get_html') return content(id,'html',{selector:input.selector,visible:input.outer});
  if (name==='get_element'||name==='measure') return content(id,'element',input);
  if (name==='highlight') return content(id,'highlight',input);
  if (name==='find') { const nodes=await content(id,'read',{mode:'all',maxNodes:1000}) as Candidate[]; return rankElements(String(input.query||''),nodes); }
  if (name==='scroll_into_view') return content(id,'scroll_ref',input);
  if (name==='focus'||name==='blur') return content(id,name,input);
  if (name==='form_input') {
    const results=[];
    for (const field of input.fields||[]) {
      await safeField(id,field);
      await confirmTarget(id,{...field,confirmed:input.confirmed});
      const target=await content(id,'element',field) as Data;
      const textField=target.tag==='textarea'||target.tag==='input'&&!['checkbox','radio','date','color','file','hidden'].includes(String(target.type));
      if (textField) {
        await click(id,{...field,confirmed:input.confirmed});
        await key(id,'ctrl+a');
        await computer(id,{action:'type',text:String(field.value)});
        results.push(await content(id,'element',field));
      } else {
        await move(id,await point(id,field));
        await wait(180);
        results.push(await content(id,'form',{...field,text:String(field.value)}));
        await wait(180);
      }
    }
    return results;
  }
  if (name==='clear_field') { await content(id,'focus',input); await key(id,'ctrl+a'); await key(id,'backspace'); return {ok:true}; }
  if (name==='insert_text') { await safeField(id,input); await cdp(id,'Input.insertText',{text:String(input.text||'')}); return {ok:true}; }
  if (name==='select_option'||name==='check'||name==='uncheck') return content(id,'form',{...input,text:name==='check'?'true':name==='uncheck'?'false':String(input.value||'')});
  if (name==='javascript') { if(input.confirmed!==true) throw Error('confirmation_required_for_javascript'); const result=await cdp(id,'Runtime.evaluate',{expression:String(input.code||''),awaitPromise:input.awaitPromise!==false,returnByValue:true,userGesture:false}); if(result.exceptionDetails) throw Error(result.exceptionDetails.text); return result.result?.value; }
  if (name==='console_read') return (state.console.get(id)||[]).slice(-Number(input.limit||100));
  if (name==='console_clear') { state.console.set(id,[]); return {ok:true}; }
  if (name==='network_read') return (state.network.get(id)||[]).slice(-Number(input.limit||100));
  if (name==='network_body') return cdp(id,'Network.getResponseBody',{requestId:input.requestId});
  if (name==='network_block') { if(input.confirmed!==true) throw Error('confirmation_required'); await cdp(id,'Network.setBlockedURLs',{urls:input.patterns||[]}); return {ok:true}; }
  if (name==='network_mock') { if(input.confirmed!==true) throw Error('confirmation_required'); state.mocks.set(id,input); await cdp(id,'Fetch.enable',{patterns:[{urlPattern:String(input.urlPattern||'*'),requestStage:'Request'}]}); return {ok:true}; }
  if (name==='storage_read') { if(input.kind==='cookies') return cdp(id,'Network.getCookies',{urls:[tab.url]}); const kind=input.kind==='session'?'sessionStorage':'localStorage'; return (await cdp(id,'Runtime.evaluate',{expression:`JSON.stringify(${kind})`,returnByValue:true})).result.value; }
  if (name==='cookies_clear') { if(input.confirmed!==true) throw Error('confirmation_required'); const cookies=(await cdp(id,'Network.getCookies',{urls:[tab.url]})).cookies as Data[]; for(const cookie of cookies) await cdp(id,'Network.deleteCookies',{name:cookie.name,url:tab.url,domain:cookie.domain,path:cookie.path}); return {cleared:cookies.length}; }
  if (name==='cookies_set') { if(input.confirmed!==true) throw Error('confirmation_required'); const url=String(input.url||tab.url); if(origin(url)!==origin(tab.url)||input.domain&&String(input.domain)!==new URL(tab.url!).hostname) throw Error('cookie_origin_mismatch'); await cdp(id,'Network.setCookie',{...input,url}); return {ok:true}; }
  if (name==='dialog_policy') { state.dialog.set(id,String(input.mode)); return {ok:true}; }
  if (name==='dialog_respond') { await cdp(id,'Page.handleJavaScriptDialog',{accept:!!input.accept,promptText:input.promptText}); return {ok:true}; }
  if (name==='tab_recover') { await chrome.debugger.detach({tabId:id}); state.active.delete(id); await attached(id); return {ok:true}; }
  if (name==='set_offline') { await cdp(id,'Network.emulateNetworkConditions',{offline:!!input.offline,latency:0,downloadThroughput:-1,uploadThroughput:-1}); return {ok:true}; }
  if (name==='set_user_agent') { await cdp(id,'Network.setUserAgentOverride',{userAgent:String(input.userAgent)}); return {ok:true}; }
  if (name==='set_geolocation') { await cdp(id,'Emulation.setGeolocationOverride',{latitude:input.latitude,longitude:input.longitude,accuracy:input.accuracy||100}); return {ok:true}; }
  if (name==='set_timezone') { await cdp(id,'Emulation.setTimezoneOverride',{timezoneId:input.timezoneId}); return {ok:true}; }
  if (name==='set_locale') { await cdp(id,'Emulation.setLocaleOverride',{locale:input.locale}); return {ok:true}; }
  if (name==='set_color_scheme') { await cdp(id,'Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:input.scheme}]}); return {ok:true}; }
  if (name==='viewport_emulate') { await cdp(id,'Emulation.setDeviceMetricsOverride',{width:input.width,height:input.height,deviceScaleFactor:input.dpr||1,mobile:!!input.mobile}); return {ok:true}; }
  if (name==='window_resize') { await chrome.windows.update(tab.windowId,{width:Number(input.width),height:Number(input.height)}); return {ok:true}; }
  if (name==='throttle_network') { const presets:Data={slow3g:{latency:400,downloadThroughput:50000,uploadThroughput:20000},fast3g:{latency:150,downloadThroughput:200000,uploadThroughput:100000},offline:{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0}}; await cdp(id,'Network.emulateNetworkConditions',{offline:false,...(presets[input.profile]||input)}); return {ok:true}; }
  if (name==='file_upload'||name==='upload_image') { const selector=input.selector || (input.ref ? `[data-codex-ref="${input.ref}"]` : null); if(!selector) throw Error('file_input_required'); const document=await cdp(id,'DOM.getDocument'); const node=await cdp(id,'DOM.querySelector',{nodeId:document.root.nodeId,selector}); if(!node.nodeId) throw Error('file_input_not_found'); await cdp(id,'DOM.setFileInputFiles',{nodeId:node.nodeId,files:input.paths || [input.path]}); return {uploaded:input.paths||[input.path]}; }
  if (name==='paste') { await key(id,'ctrl+v'); return {ok:true}; }
  if (name==='copy'||name==='copy_selection') { await key(id,'ctrl+c'); await wait(100); return offscreen('read'); }
  if (name==='print_to_pdf') { const result=await cdp(id,'Page.printToPDF',{printBackground:true}); return {pdf:result.data}; }
  if (name==='save_page') { const result=await cdp(id,'Page.captureSnapshot',{format:'mhtml'}); return {mhtml:result.data}; }
  if (name==='scroll_until') { for(let n=0;n<Math.min(30,Number(input.maxScrolls||10));n++) { const nodes=await content(id,'read',{mode:'all',maxNodes:1000}) as Data[]; if(nodes.some(node=>input.text&&String(node.name).includes(input.text))) return {found:true,scrolls:n}; await computer(id,{action:'scroll',amount:600}); await wait(200); } throw Error('scroll_target_not_found'); }
  if (name==='drag_and_drop') { const from=Array.isArray(input.from)?input.from:await point(id,{ref:input.from}); const to=Array.isArray(input.to)?input.to:await point(id,{ref:input.to}); return computer(id,{action:'left_click_drag',start:from,end:to}); }
  if (name==='press_and_hold') { const k=String(input.key||''); await cdp(id,'Input.dispatchKeyEvent',{type:'keyDown',key:k,code:k}); await wait(Math.min(8000,Number(input.ms||500))); await cdp(id,'Input.dispatchKeyEvent',{type:'keyUp',key:k,code:k}); return {ok:true}; }
  if (name==='scroll_page') { const expression=input.to==='top'?'scrollTo(0,0)':input.to==='bottom'?'scrollTo(0,document.body.scrollHeight)':`scrollTo(0,document.body.scrollHeight*${Number(input.percent||0)/100})`; await cdp(id,'Runtime.evaluate',{expression}); return {ok:true}; }
  if (name==='wait_for') { const until=Date.now()+Math.min(9000,Number(input.timeoutMs||8000)); while(Date.now()<until) { if(input.url_pattern && String((await chrome.tabs.get(id)).url).includes(String(input.url_pattern))) return {found:true,kind:'url'}; if(input.selector) { try { return {found:true,kind:'selector',element:await content(id,'element',{selector:input.selector})}; } catch { /* keep waiting */ } } if(input.network_idle) { const events=state.network.get(id)||[]; const last=events.at(-1); if(!last||Date.now()-last.time>500) return {found:true,kind:'network_idle'}; } if(input.text||input.ref) { const result=await content(id,'read',{mode:'all',maxNodes:1000}); if((result as Data[]).some(n=>input.text&&String(n.name).includes(input.text)||input.ref&&n.ref===input.ref)) return {found:true,kind:'element'}; } await wait(200); } throw Error('wait_timeout'); }
  if (name==='batch') { const results=[]; const started=Date.now(); for(const item of input.actions||[]) { if(Date.now()-started>24000) return {partial:true,results}; try { results.push({name:item.name,result:await run(item.name,item.input||{})}); } catch(e) { results.push({name:item.name,error:(e as Error).message}); if(!input.continueOnError) break; } } return {results}; }
  throw Error(`tool_not_implemented: ${name}`);
}
chrome.runtime.onMessage.addListener((m: Data, _sender, send) => { if(m.target==='offscreen') return; void (async()=>{
  if(m.type==='panel_state') { const [tab]=await chrome.tabs.query({active:true,currentWindow:true}); const site=origin(tab?.url); return {connected:state.connected,paired:state.paired,code:state.code,deviceId:state.device?.deviceId,name:state.device?.name,paused:state.paused,allowAll:state.allowAll,selectSession:state.selectSession,origin:site,allowed:!!site&&(state.allowAll||state.allowed.has(site)||state.once.has(site)),credential:state.credentials.has(site),log:state.log}; }
  if(m.type==='select_this') { if(!state.selectSession) throw Error('no_pending_selection'); state.ws?.send(JSON.stringify({type:'select_choice',sessionId:state.selectSession})); state.selectSession=''; return {ok:true}; }
  if(m.type==='allow'||m.type==='credential') { const [tab]=await chrome.tabs.query({active:true,currentWindow:true}); const site=origin(tab?.url); if(!site) throw Error('no_site'); if(m.type==='allow') { if(m.persistent) state.allowed.add(site); else state.once.add(site); } else { if(m.enabled) state.credentials.add(site); else state.credentials.delete(site); } await save(); return {ok:true}; }
  if(m.type==='allow_origin') { const site=origin(String(m.url||'')); if(!site) throw Error('invalid_origin'); state.allowed.add(site); await save(); return {ok:true,origin:site}; }
  if(m.type==='allow_all') { state.allowAll=m.enabled===true; await save(); entry('permissions_set',state.allowAll?'all sites':'listed sites'); return {allSites:state.allowAll}; }
  if(m.type==='pause_toggle') { state.paused=!state.paused; return {paused:state.paused}; }
  if(m.type==='stop') { state.paused=true; for(const id of [...state.active]) { await chrome.debugger.detach({tabId:id}).catch(()=>{}); await chrome.tabs.sendMessage(id,{type:'detach'},{frameId:0}).catch(()=>{}); } state.active.clear(); return {ok:true}; }
  return {ok:false};
})().then(send,e=>send({error:String(e)})); return true; });
void init();
