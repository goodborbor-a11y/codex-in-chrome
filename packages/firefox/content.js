/* global browser, document, window */
if (!globalThis.__codexFirefoxOverlay) {
  globalThis.__codexFirefoxOverlay = true;
  let host, root, pointer, ripple, label, trails = [], active = false;
  const style = `
    .frame{position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse 380px 340px at 0 0,#00f7f630,transparent 74%),radial-gradient(ellipse 380px 340px at 100% 100%,#f708f72b,transparent 74%);box-shadow:inset 0 0 12px #00f7f699,inset 0 0 30px #f708f74d,inset 0 0 56px #00f7f629;animation:breathe 3.6s ease-in-out infinite}
    .frame:before{content:'';position:absolute;inset:0;border:2px solid transparent;border-image:linear-gradient(135deg,#00f7f6,#f708f7) 1;pointer-events:none}
    .frame:after{content:'';position:absolute;top:0;left:0;width:100%;height:3px;background:linear-gradient(90deg,transparent,#00f7f6,#f708f7,#00f7f6,transparent);background-size:200% 100%;animation:flow 6s linear infinite}
    @keyframes breathe{50%{box-shadow:inset 0 0 20px #00f7f64d,inset 0 0 38px #f708f788,inset 0 0 64px #f708f733}}@keyframes flow{to{background-position:200% 0}}
    .trail{position:fixed;left:0;top:0;width:16px;height:16px;border-radius:50%;background:radial-gradient(circle,#00f7f6bb,#7c80f799 35%,#f708f744 60%,transparent 75%);filter:blur(3px);opacity:0;transform:translate3d(-100px,-100px,0);transition:transform 180ms,opacity 130ms;pointer-events:none}
    .trail.two{width:24px;height:24px;filter:blur(5px);transition-duration:260ms}
    .pointer{position:fixed;left:0;top:0;width:22px;height:27px;opacity:0;transform:translate3d(-100px,-100px,0);transition:transform 180ms ease-out,opacity 100ms;filter:drop-shadow(0 0 4px #00f7f6) drop-shadow(0 0 9px #f708f7);pointer-events:none}
    .pointer svg{width:22px;height:27px;display:block}.pointer.pressed{filter:drop-shadow(0 0 8px #f708f7) drop-shadow(0 0 16px #f708f7)}
    .ripple{position:fixed;width:12px;height:12px;border:2px solid #f708f7;border-radius:50%;box-shadow:0 0 12px #00f7f6;opacity:0;pointer-events:none;transform:translate(-50%,-50%)}.ripple.go{animation:ripple .55s ease-out}@keyframes ripple{10%{opacity:1;scale:.4}100%{opacity:0;scale:3}}
    .pill{position:fixed;right:14px;top:14px;display:flex;align-items:center;gap:9px;padding:7px 8px 7px 12px;border:1px solid transparent;border-radius:999px;background:linear-gradient(135deg,#1b1729ed,#24152bed) padding-box,linear-gradient(110deg,#00f7f6,#f708f7) border-box;color:#f9f6ff;font:600 12px/1.25 system-ui,sans-serif;box-shadow:0 5px 22px #190e2c99,0 0 16px #00f7f64d,0 0 20px #f708f74d;backdrop-filter:blur(12px);pointer-events:none}
    .dot{width:9px;height:9px;border-radius:50%;background:#00f7f6;box-shadow:0 0 0 3px #00f7f631,0 0 10px #00f7f6;animation:pulse 2s infinite}@keyframes pulse{50%{box-shadow:0 0 0 5px #f708f722,0 0 15px #f708f7}}
    .pill button{border:1px solid #00f7f699;border-radius:999px;background:linear-gradient(110deg,#00f7f6,#f708f7);color:#171023;padding:5px 11px;font:700 11px system-ui,sans-serif;cursor:pointer;pointer-events:auto}
    @media(prefers-reduced-motion:reduce){.frame,.frame:after,.dot{animation:none}.trail{display:none}}
  `;
  function ensure() {
    if (!active || !document.documentElement) return;
    if (host?.isConnected) return;
    host = document.createElement('div');
    host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<div class="frame"></div><div class="trail two"></div><div class="trail"></div><div class="pointer"><svg viewBox="0 0 40 48" aria-hidden="true"><defs><linearGradient id="fill" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#00f7f6"/><stop offset=".5" stop-color="#7c80f7"/><stop offset="1" stop-color="#f708f7"/></linearGradient></defs><path d="M5 4v31l8-7 7 15 8-4-7-15h12z" fill="url(#fill)" stroke="#eafcff" stroke-width="3.4" stroke-linejoin="round"/></svg></div><div class="ripple"></div><div class="pill"><i class="dot"></i><span class="label">Saint is working</span><button type="button" aria-label="Stop browser control">Stop</button></div>`;
    const css = document.createElement('style'); css.textContent = style; root.prepend(css);
    pointer = root.querySelector('.pointer'); ripple = root.querySelector('.ripple'); label = root.querySelector('.label'); trails = [...root.querySelectorAll('.trail')];
    root.querySelector('button').onclick = () => browser.runtime.sendMessage({ type: 'stop' });
    document.documentElement.appendChild(host);
  }
  function move(x,y) {
    ensure(); if (!pointer) return;
    pointer.style.transform = `translate3d(${x-3}px,${y-2}px,0)`; pointer.style.opacity = '1';
    trails.forEach((e,i)=>{e.style.transform=`translate3d(${x-(i?7:12)}px,${y-(i?7:12)}px,0)`;e.style.opacity=i?'.42':'.24'});
  }
  browser.runtime.onMessage.addListener(m => {
    if (m.type === 'overlay_attach') { active=true; ensure(); if(m.action&&label)label.textContent=`Saint is ${m.action}`; return Promise.resolve({ok:true}); }
    if (m.type === 'overlay_move') { active=true; move(m.x,m.y); if(m.action&&label)label.textContent=`Saint is ${m.action}`; return Promise.resolve({ok:true}); }
    if (m.type === 'overlay_click') { active=true; move(m.x,m.y);pointer?.classList.add('pressed');ripple.style.left=`${m.x}px`;ripple.style.top=`${m.y}px`;ripple.classList.remove('go');void ripple.offsetWidth;ripple.classList.add('go');window.setTimeout(()=>pointer?.classList.remove('pressed'),260);return Promise.resolve({ok:true}); }
    if (m.type === 'overlay_detach') { active=false;host?.remove();host=null;pointer=null;ripple=null;return Promise.resolve({ok:true}); }
    return undefined;
  });
  document.addEventListener('keydown',e=>{if(e.ctrlKey&&e.altKey&&e.shiftKey&&e.key.toLowerCase()==='x')browser.runtime.sendMessage({type:'stop'})});
}
