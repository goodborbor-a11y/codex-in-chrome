export function browserToolTimeoutMs(name: string, input: Record<string, unknown>): number {
  if (name === 'batch') return 25_000;
  if(name==='form_input')return Math.min(180_000,Math.max(15_000,((input.fields as unknown[]|undefined)?.length||0)*4000+10_000));
  if(name==='insert_text')return Math.min(180_000,Math.max(12_000,String(input.text||'').length*250+8_000));
  if(name==='wait_for')return Math.min(33_000,Math.max(10_000,Number(input.timeoutMs||10_000)+3_000));
  if(name==='download_wait')return Math.min(123_000,Math.max(10_000,Number(input.timeoutMs||10_000)+3_000));
  if (name !== 'computer') return 10_000;
  const action = String(input.action || '');
  if (action === 'type') {
    const count = String(input.text || '').length;
    const delay = input.delayMs === undefined ? input.humanize === false ? 0 : 220 : Math.max(0, Number(input.delayMs));
    return Math.min(180_000, Math.max(12_000, Math.ceil(count * (delay + 30) + 8_000)));
  }
  if (action === 'left_click_drag') return 25_000;
  if (action === 'wait') return Math.min(14_000, Math.max(10_000, Number(input.seconds || 1) * 1_000 + 5_000));
  return 12_000;
}

export function rpcTimeoutMs(name: string, input: Record<string, unknown>): number {
  if (name === 'macro_replay') return 600_000;
  if (name === 'gif_record' && input.action === 'stop') return 300_000;
  return browserToolTimeoutMs(name, input) + 5_000;
}
