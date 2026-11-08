chrome.runtime.onMessage.addListener((message, _sender, send) => {
  if (message.target !== 'offscreen') return;
  void (async () => {
    if (message.action === 'write') {
      const value = String(message.text || '');
      try { await navigator.clipboard.writeText(value); }
      catch {
        const field = document.createElement('textarea');
        field.value = value;
        document.body.append(field);
        field.focus(); field.select();
        const copied = document.execCommand('copy');
        field.remove();
        if (!copied) throw Error('clipboard_write_failed');
      }
      return { ok: true };
    }
    if (message.action === 'read') return { text: await navigator.clipboard.readText() };
    throw Error('unknown_clipboard_action');
  })().then(send, e => send({ error: (e as Error).message }));
  return true;
});
