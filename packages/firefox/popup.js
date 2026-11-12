/* global browser, document */
const $=id=>document.getElementById(id);
async function refresh(){const s=await browser.runtime.sendMessage({type:'state'});$('status').textContent=s.connected?(s.paired?'Connected':'Pair this browser'):'Bridge offline';$('code').textContent=s.connected&&!s.paired?s.code:'';$('allow').checked=s.allow;$('pause').textContent=s.paused?'Resume':'Pause';}
$('allow').onchange=async()=>{await browser.runtime.sendMessage({type:'allow',enabled:$('allow').checked});refresh();};
$('pause').onclick=async()=>{await browser.runtime.sendMessage({type:'pause'});refresh();};
refresh();
