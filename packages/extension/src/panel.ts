type State = { connected: boolean; paired: boolean; code: string; deviceId?: string; name?: string; paused: boolean; allowAll?: boolean; origin?: string; allowed?: boolean; credential?: boolean; selectSession?: string; log: string[] };
const $ = (id: string) => document.getElementById(id)!;
async function call(type: string, extra: Record<string, unknown> = {}): Promise<unknown> { return chrome.runtime.sendMessage({ type, ...extra }); }
async function refresh(): Promise<void> {
  const s = await call('panel_state') as State;
  $('state').textContent = !s.connected ? 'Bridge offline' : s.paired ? 'Connected' : 'Pair this browser';
  $('code').textContent = s.connected && !s.paired ? s.code : '';
  $('device').textContent = s.name ? `${s.name} · ${s.deviceId}` : 'Pair this browser using the setup guide';
  $('selectPrompt').hidden = !s.selectSession;
  $('site').textContent = `${s.origin || 'No web page selected'} ${s.allowed ? '✓ allowed' : '· permission needed'}`;
  ($('allowAll') as HTMLInputElement).checked = !!s.allowAll;
  ($('credential') as HTMLInputElement).checked = !!s.credential;
  $('pause').textContent = s.paused ? 'Resume' : 'Pause';
  $('log').textContent = s.log.slice(-30).reverse().join('\n');
}
$('once').onclick = async () => { await call('allow', { persistent: false }); void refresh(); };
$('always').onclick = async () => { await call('allow', { persistent: true }); void refresh(); };
$('allowEntered').onclick = async () => { await call('allow_origin', { url: ($('allowUrl') as HTMLInputElement).value }); void refresh(); };
$('allowAll').onchange = async () => { await call('allow_all', { enabled: ($('allowAll') as HTMLInputElement).checked }); void refresh(); };
$('selectThis').onclick = async () => { await call('select_this'); void refresh(); };
$('credential').onchange = async () => { await call('credential', { enabled: ($('credential') as HTMLInputElement).checked }); void refresh(); };
$('pause').onclick = async () => { await call('pause_toggle'); void refresh(); };
$('stop').onclick = async () => { await call('stop'); void refresh(); };
setInterval(() => void refresh(), 1000); void refresh();
