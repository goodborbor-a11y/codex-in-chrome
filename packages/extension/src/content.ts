const codexContentGlobal = globalThis as typeof globalThis & { __codexContentLoaded?: boolean };
if (!codexContentGlobal.__codexContentLoaded) {
codexContentGlobal.__codexContentLoaded = true;
const generationAttribute = 'data-codex-overlay-generation';
const generation = `${Date.now()}-${Math.random()}`;
document.documentElement?.setAttribute(generationAttribute, generation);
type OverlayMessage = { type: string; x?: number; y?: number; label?: string; action?: string; visible?: boolean; selector?: string; ref?: string; query?: string; maxNodes?: number; mode?: string; text?: string; fn?: string };
let host: HTMLDivElement | undefined;
let root: ShadowRoot | undefined;
let cursor: HTMLElement | undefined;
let trails: HTMLElement[] = [];
let pill: HTMLElement | undefined;
let statusPill: HTMLElement | undefined;
let stopButton: HTMLButtonElement | undefined;
let ripple: HTMLElement | undefined;
let cursorPosition: [number, number] | undefined;
let pressTimer: number | undefined;
let attached = false;
let hidden = false;
const refs = new Map<string, Element>();
const fallback = new Map<string, { selector: string; name: string }>();
let nextRef = 1;
function cssPath(e: Element): string {
  if (e.id) return `#${CSS.escape(e.id)}`;
  const parts: string[] = [];
  for (let cur: Element | null = e; cur && cur !== document.documentElement; cur = cur.parentElement) {
    if (cur.id) { parts.unshift(`#${CSS.escape(cur.id)}`); break; }
    const tag = cur.tagName.toLowerCase(); const siblings = cur.parentElement ? [...cur.parentElement.children].filter(x => x.tagName === cur!.tagName) : [];
    parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(cur) + 1})`);
  }
  return parts.join(' > ');
}
function ensure(): void {
  if (!attached || hidden) return;
  if (document.documentElement?.getAttribute(generationAttribute) !== generation) {
    attached = false;
    observer.disconnect();
    host?.remove();
    return;
  }
  for (const previous of document.querySelectorAll<HTMLElement>('[data-codex-overlay]')) {
    if (previous !== host) previous.style.display = 'none';
  }
  if (!host || !host.isConnected) {
    host = document.createElement('div'); host.setAttribute('data-codex-overlay', '');
    host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>
      .frame{position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse 380px 340px at 0 0,#00f7f630,transparent 74%),radial-gradient(ellipse 380px 340px at 100% 100%,#f708f72b,transparent 74%);box-shadow:inset 0 0 12px #00f7f699,inset 0 0 30px #f708f74d,inset 0 0 56px #00f7f629;animation:frame-breathe 3.6s ease-in-out infinite;transition:background 140ms,box-shadow 140ms}
      .frame:before{content:'';position:absolute;inset:0;border:2px solid transparent;border-image:linear-gradient(135deg,#00f7f6,#f708f7) 1;box-shadow:inset 0 0 18px #00f7f633;pointer-events:none}
      .frame:after{content:'';position:absolute;top:0;left:0;width:100%;height:3px;background:linear-gradient(90deg,transparent 0%,#00f7f6 28%,#f708f7 50%,#00f7f6 72%,transparent 100%);background-size:200% 100%;animation:edge-flow 6s linear infinite;opacity:.78}
      @keyframes frame-breathe{50%{box-shadow:inset 0 0 20px #00f7f64d,inset 0 0 38px #f708f788,inset 0 0 64px #f708f733}}
      @keyframes edge-flow{to{background-position:200% 0}}
      .trail{position:fixed;left:0;top:0;width:14px;height:14px;border-radius:50%;pointer-events:none;background:radial-gradient(circle,#00f7f6bb 0%,#7c80f799 32%,#f708f744 55%,transparent 72%);filter:blur(2px);transform:translate3d(-100px,-100px,0);opacity:0}
      .trail.one{transition:transform 85ms linear,opacity 120ms}.trail.two{width:18px;height:18px;transition:transform 140ms linear,opacity 160ms;filter:blur(3px)}.trail.three{width:24px;height:24px;transition:transform 205ms linear,opacity 200ms;filter:blur(5px)}
      .pointer{position:fixed;left:0;top:0;width:22px;height:27px;pointer-events:none;transform:translate3d(-100px,-100px,0);opacity:0;filter:drop-shadow(0 1px 1px #201124) drop-shadow(0 0 3px #00f7f6) drop-shadow(0 0 7px #7c80f7) drop-shadow(0 0 12px #f708f7a6);transition:transform 18ms linear,opacity 100ms}
      .pointer .aura{position:absolute;left:-10px;top:-10px;width:32px;height:32px;border-radius:50%;background:radial-gradient(circle,#00f7f699 0%,#7c80f777 32%,#f708f744 48%,transparent 70%);filter:blur(4px);animation:aura-breathe 1.9s ease-in-out infinite}
      .pointer svg{position:relative;display:block;width:22px;height:27px;overflow:visible}
      @keyframes aura-breathe{50%{opacity:.58;transform:scale(1.2)}}
      .ripple{position:fixed;left:-100px;top:-100px;width:10px;height:10px;border-radius:50%;background:#f708f7;box-shadow:0 0 10px #f708f7,0 0 22px #00f7f6;opacity:0;pointer-events:none;transform:translate(-50%,-50%)}
      .ripple:before,.ripple:after{content:'';position:absolute;inset:-12px;border:2px solid #f708f7;border-radius:50%;box-shadow:0 0 12px #00f7f6;opacity:0}
      .ripple:after{inset:-21px;border-color:#00f7f6}
      .ripple.show{animation:click-core .45s ease-out}.ripple.show:before{animation:click-ring .48s ease-out}.ripple.show:after{animation:click-ring .62s .07s ease-out}
      @keyframes click-core{20%{opacity:1}100%{opacity:0}}@keyframes click-ring{12%{opacity:.9;transform:scale(.45)}100%{opacity:0;transform:scale(1.8)}}
      .pill{position:fixed;right:14px;top:14px;display:flex;align-items:center;gap:9px;max-width:min(360px,calc(100vw - 28px));padding:7px 8px 7px 12px;border:1px solid transparent;border-radius:999px;background:linear-gradient(135deg,#1b1729ed,#24152bed) padding-box,linear-gradient(110deg,#00f7f6,#f708f7) border-box;color:#f9f6ff;font:600 12px/1.25 system-ui,sans-serif;letter-spacing:.01em;box-shadow:0 5px 22px #190e2c99,0 0 16px #00f7f64d,0 0 20px #f708f74d;backdrop-filter:blur(12px);pointer-events:none;transition:opacity 140ms ease}
      .status-dot{flex:none;width:9px;height:9px;border-radius:50%;background:#00f7f6;box-shadow:0 0 0 3px #00f7f631,0 0 10px #00f7f6,0 0 18px #f708f7;animation:status-pulse 2s ease-in-out infinite}
      .pill-label{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.pill button{flex:none;border:1px solid #00f7f699;border-radius:999px;background:linear-gradient(110deg,#00f7f6,#f708f7);color:#171023;padding:5px 11px;font:700 11px system-ui,sans-serif;cursor:pointer;pointer-events:auto}.pill button:hover{filter:brightness(1.15)}
      @keyframes status-pulse{50%{box-shadow:0 0 0 5px #f708f722,0 0 15px #f708f7,0 0 25px #00f7f6}}
      :host(.pressed) .pointer{filter:drop-shadow(0 0 3px #00f7f6) drop-shadow(0 0 8px #f708f7) drop-shadow(0 0 16px #f708f7)}
      :host(.pressed) .pointer-body{fill:url(#pointer-press)}
      :host(.pressed) .pointer .aura{background:radial-gradient(circle,#f708f7bb 0%,#f708f788 28%,#00f7f644 48%,transparent 70%)}
      :host(.pressed) .ripple{background:#f708f7;box-shadow:0 0 10px #f708f7,0 0 22px #00f7f6}
      :host(.pressed) .ripple:before,:host(.pressed) .ripple:after{box-shadow:0 0 12px #f708f7}
      @media (prefers-reduced-motion:reduce){.frame,.frame:after,.pointer .aura,.status-dot{animation:none}.trail{display:none}.pointer{transition:none}}
    </style><div class="frame"></div><div class="trail three"></div><div class="trail two"></div><div class="trail one"></div><div class="pointer"><div class="aura"></div><svg viewBox="0 0 40 48" aria-hidden="true"><defs><linearGradient id="pointer-fill" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#00f7f6"/><stop offset=".5" stop-color="#7c80f7"/><stop offset="1" stop-color="#f708f7"/></linearGradient><linearGradient id="pointer-press" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f708f7"/><stop offset=".7" stop-color="#f708f7"/><stop offset="1" stop-color="#00f7f6"/></linearGradient></defs><path class="pointer-body" d="M5 4v31l8-7 7 15 8-4-7-15h12z" fill="url(#pointer-fill)" stroke="#eafcff" stroke-width="3.4" stroke-linejoin="round"/><path d="M8.5 12v16l4.8-4.2" fill="none" stroke="#eaffff" stroke-width="1.3" stroke-linecap="round" opacity=".9"/></svg></div><div class="ripple"></div><div class="pill"><i class="status-dot"></i><span class="pill-label">Codex is working</span><button type="button" aria-label="Stop Codex browser control">Stop</button></div>`;
    cursor = root.querySelector('.pointer') as HTMLElement;
    trails = [...root.querySelectorAll<HTMLElement>('.trail')];
    pill = root.querySelector('.pill-label') as HTMLElement;
    statusPill = root.querySelector('.pill') as HTMLElement;
    stopButton = root.querySelector('.pill button') as HTMLButtonElement;
    ripple = root.querySelector('.ripple') as HTMLElement;
    stopButton.title = 'Stop browser control (Ctrl+Alt+Shift+X)';
    stopButton.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'stop' }));
    (document.documentElement || document.body)?.appendChild(host);
    if (cursorPosition) positionCursor(...cursorPosition);
  }
  host.style.display = 'block';
}
function positionCursor(x: number, y: number): void {
  cursorPosition = [x, y];
  if (!cursor) return;
  cursor.style.transform = `translate3d(${x - 3}px,${y - 2}px,0)`;
  cursor.style.opacity = '1';
  trails.forEach((trail, index) => {
    const radius = [12, 9, 7][index] ?? 7;
    trail.style.transform = `translate3d(${x - radius}px,${y - radius}px,0)`;
    trail.style.opacity = ['.2','.3','.45'][index] ?? '.2';
  });
}
const observer = new MutationObserver(() => { if (attached && !hidden) ensure(); });
observer.observe(document, { childList: true, subtree: true });
document.addEventListener('pointermove', event => {
  if (!statusPill || !stopButton || !host || !attached || hidden) return;
  const box = statusPill.getBoundingClientRect();
  const stop = stopButton.getBoundingClientRect();
  const nearPill = event.clientX >= box.left - 20 && event.clientX <= box.right + 20 && event.clientY >= box.top - 20 && event.clientY <= box.bottom + 20;
  const overStop = event.clientX >= stop.left && event.clientX <= stop.right && event.clientY >= stop.top && event.clientY <= stop.bottom;
  const beneath = overStop ? document.elementsFromPoint(event.clientX, event.clientY).find(e => e !== host && !e.closest('[data-codex-overlay]')) : null;
  const pageControl = !!beneath && (!!beneath.closest('a[href],button,input,select,textarea,iframe,summary,[onclick],[role="button"],[role="link"],[role="menuitem"],[role="tab"],[role="checkbox"],[role="switch"],[role="textbox"],[role="combobox"],[contenteditable="true"],[tabindex]:not([tabindex="-1"])') || getComputedStyle(beneath).cursor === 'pointer');
  stopButton.style.pointerEvents = pageControl ? 'none' : 'auto';
  statusPill.style.opacity = nearPill && (!overStop || pageControl) ? '.18' : '1';
}, { capture: true, passive: true });
document.addEventListener('pointerleave', () => { if (statusPill) statusPill.style.opacity = '1'; });
document.addEventListener('keydown', event => {
  if (!attached || hidden || event.code !== 'KeyX' || !event.ctrlKey || !event.altKey || !event.shiftKey) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  chrome.runtime.sendMessage({ type: 'stop' });
}, { capture: true });
function walk(rootNode: ParentNode, out: Element[], limit: number): void {
  for (const e of rootNode.querySelectorAll('*')) {
    if (out.length >= limit) return;
    if (e.hasAttribute('data-codex-overlay')) continue;
    out.push(e); if (e.shadowRoot) walk(e.shadowRoot, out, limit);
  }
}
function describe(e: Element): Record<string, unknown> {
  let ref = [...refs].find(([, value]) => value === e)?.[0]; if (!ref) { ref = `ref_${nextRef++}`; refs.set(ref, e); fallback.set(ref, { selector: cssPath(e), name: e.getAttribute('aria-label') || (e.textContent || '').trim().slice(0,120) }); e.setAttribute('data-codex-ref', ref); }
  const box = e.getBoundingClientRect(); const input = e as HTMLInputElement;
  return { ref, tag: e.tagName.toLowerCase(), type: input.type, id: e.id, fieldName: e.getAttribute('name'), attributes: Object.fromEntries([...e.attributes].map(a => [a.name,a.value])), role: e.getAttribute('role') || ({ BUTTON: 'button', A: 'link', INPUT: input.type || 'input', TEXTAREA: 'textbox', SELECT: 'combobox' } as Record<string,string>)[e.tagName] || e.tagName.toLowerCase(), name: e.getAttribute('aria-label') || e.getAttribute('title') || (e.textContent || '').trim().slice(0, 120), text: (e.textContent || '').trim().slice(0,500), value: input.value || '', disabled: input.disabled || e.getAttribute('aria-disabled') === 'true', checked: input.checked || e.getAttribute('aria-checked') === 'true', expanded: e.getAttribute('aria-expanded'), focused: e === document.activeElement, box: { x: box.x, y: box.y, w: box.width, h: box.height }, inViewport: box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth };
}
function element(m: OverlayMessage): Element { let e = m.ref ? refs.get(m.ref) : m.selector ? document.querySelector(m.selector) || undefined : undefined; if(m.ref && (!e || !e.isConnected)) { const backup=fallback.get(m.ref); const candidate=backup ? document.querySelector(backup.selector) : null; if(candidate && (candidate.getAttribute('aria-label') || (candidate.textContent || '').trim().slice(0,120)) === backup?.name) { e=candidate; refs.set(m.ref,e); e.setAttribute('data-codex-ref',m.ref); } } if (!e || !e.isConnected) throw Error('element_not_found'); return e; }
chrome.runtime.onMessage.addListener((m: OverlayMessage, _sender, send) => {
  if (!['attach','detach','hide','show','cursor','action','press','release','ripple','read','element','scroll_ref','html','text','focus','blur','highlight','form'].includes(m.type)) return;
  try {
    let result: unknown = true;
    if (m.type === 'attach') { attached = true; ensure(); }
    else if (m.type === 'detach') { attached = false; host?.remove(); }
    else if (m.type === 'hide') { hidden = true; host?.remove(); }
    else if (m.type === 'show') { hidden = false; ensure(); }
    else if (m.type === 'cursor') { ensure(); positionCursor(m.x || 0, m.y || 0); }
    else if (m.type === 'action') { ensure(); if (pill) { const verbs: Record<string, string> = { mouse_move:'moving', left_click:'clicking', right_click:'clicking', middle_click:'clicking', double_click:'double-clicking', triple_click:'clicking', hover:'hovering', type:'typing', key:'typing', scroll:'scrolling', scroll_to:'scrolling', left_click_drag:'dragging', screenshot:'capturing' }; pill.textContent = `Codex is ${verbs[m.action || ''] || 'working'}`; } }
    else if (m.type === 'press') { ensure(); if (pressTimer) window.clearTimeout(pressTimer); host?.classList.add('pressed'); if (ripple) { ripple.style.left = `${m.x}px`; ripple.style.top = `${m.y}px`; ripple.classList.remove('show'); void ripple.offsetWidth; ripple.classList.add('show'); } }
    else if (m.type === 'release') { if (pressTimer) window.clearTimeout(pressTimer); pressTimer = window.setTimeout(() => host?.classList.remove('pressed'), 260); }
    else if (m.type === 'ripple') { ensure(); if (ripple) { ripple.style.left = `${m.x}px`; ripple.style.top = `${m.y}px`; ripple.classList.remove('show'); void ripple.offsetWidth; ripple.classList.add('show'); } }
    else if (m.type === 'read') { const nodes: Element[] = []; walk(document, nodes, m.maxNodes || 500); result = nodes.filter(e => m.mode !== 'interactive' || e.matches('a,button,input,select,textarea,[role],[tabindex],[contenteditable]')).map(describe); }
    else if (m.type === 'element') result = describe(element(m));
    else if (m.type === 'scroll_ref') { const e = element(m); const box = e.getBoundingClientRect(); if (box.top < 90 || box.bottom > innerHeight - 90) { e.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }); window.setTimeout(() => { try { send({ ok: true, result: describe(e) }); } catch (error) { send({ ok: false, error: (error as Error).message }); } }, 540); return true; } result = describe(e); }
    else if (m.type === 'html') result = m.selector ? (m.visible ? element(m).outerHTML : element(m).innerHTML) : document.documentElement.outerHTML;
    else if (m.type === 'text') result = m.mode === 'selection' ? String(getSelection() || '') : m.mode === 'article' ? ((document.querySelector('article,main') as HTMLElement | null) || document.body).innerText : document.body.innerText;
    else if (m.type === 'focus') (element(m) as HTMLElement).focus();
    else if (m.type === 'blur') (element(m) as HTMLElement).blur();
    else if (m.type === 'highlight') { const e = element(m) as HTMLElement; e.style.outline = '3px solid #00f7f6'; e.style.boxShadow = '0 0 12px #f708f788'; e.setAttribute('data-codex-highlight', m.label || ''); result = describe(e); }
    else if (m.type === 'form') { const e = element(m) as HTMLInputElement; if (e.type === 'checkbox' || e.type === 'radio') e.checked = m.text === 'true'; else if (e.tagName === 'SELECT') e.value = m.text || ''; else e.value = m.text || ''; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); result = describe(e); }
    send({ ok: true, result });
  } catch (e) { send({ ok: false, error: (e as Error).message }); }
});
}
