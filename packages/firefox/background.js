/* global browser, crypto, WebSocket, setTimeout, URL, fetch */
const S={ws:null,port:17345,device:null,code:'',connected:false,allow:false,paused:false,owned:new Set(),controlled:new Set(),selected:'',retry:null};
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
S.code=Array.from(crypto.getRandomValues(new Uint8Array(6)),x=>alphabet[x%alphabet.length]).join('');
const send=o=>{if(S.ws?.readyState===WebSocket.OPEN)S.ws.send(JSON.stringify(o));};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const site=url=>{try{let u=new URL(url);return ['http:','https:'].includes(u.protocol)?u.origin:''}catch{return ''}};
async function connect(){if(S.ws||S.retry)return;let port=S.port;try{const r=await fetch(`http://127.0.0.1:${port}/health`);if(!r.ok)throw Error('bridge offline');}catch{S.retry=setTimeout(()=>{S.retry=null;connect()},3000);return}
const ws=new WebSocket(`ws://127.0.0.1:${port}/extension`);S.ws=ws;
ws.onopen=()=>{S.connected=true;send({type:'hello',deviceId:S.device?.deviceId,token:S.device?.token,pairCode:S.code,platform:'Firefox',buildId:'firefox-0.1.0'})};
ws.onmessage=e=>{void incoming(JSON.parse(e.data))};
ws.onclose=()=>{S.connected=false;S.ws=null;S.retry=setTimeout(()=>{S.retry=null;connect()},1000)};
ws.onerror=()=>ws.close();}
async function incoming(m){if(m.type==='paired'){S.device={deviceId:m.deviceId,token:m.token,name:m.name};await browser.storage.local.set({device:S.device});send({type:'hello',...S.device,platform:'Firefox',buildId:'firefox-0.1.0'});return}
if(m.type==='pair_required'){S.device=null;await browser.storage.local.remove('device');return}
if(m.type==='heartbeat'){send({type:'heartbeat'});return}
if(m.type==='select_prompt'){S.selected=m.sessionId;return}
if(m.type==='tool'){try{send({type:'result',id:m.id,result:await run(m.name,m.input||{})})}catch(e){send({type:'result',id:m.id,error:e.message})}}}
async function detachAll(){for(const id of S.controlled)await browser.tabs.sendMessage(id,{type:'overlay_detach'}).catch(()=>{});S.controlled.clear()}
browser.runtime.onMessage.addListener(async m=>{if(m.type==='state')return{connected:S.connected,paired:!!S.device,code:S.code,allow:S.allow,paused:S.paused};if(m.type==='allow'){S.allow=!!m.enabled;await browser.storage.local.set({allow:S.allow});return{ok:true}}if(m.type==='pause'||m.type==='stop'){S.paused=m.type==='stop'?true:!S.paused;if(S.paused)await detachAll();return{ok:true}}});
async function tab(input){const t=await browser.tabs.get(Number(input.tabId));if(!t)throw Error('tab_not_found');return t}
async function saintGroups(){return(await browser.tabGroups.query({})).filter(g=>g.title==='Saint'&&g.color==='blue')}
async function group(tabId){const t=await browser.tabs.get(tabId);const old=(await saintGroups()).find(g=>g.windowId===t.windowId);const groupId=await browser.tabs.group(old?{groupId:old.id,tabIds:[tabId]}:{tabIds:[tabId]});await browser.tabGroups.update(groupId,{title:'Saint',color:'blue'});return groupId}
function permitted(t){if(!S.allow||!site(t.url))throw Error('website_permission_needed: enable Allow tab actions in Firefox extension popup')}
async function overlay(t,type='overlay_attach',extra={}){if(!site(t.url)||S.paused)return;try{await browser.tabs.sendMessage(t.id,{type,...extra})}catch{await browser.tabs.executeScript(t.id,{file:'content.js'});await browser.tabs.sendMessage(t.id,{type,...extra})}S.controlled.add(t.id)}
async function script(t,code){permitted(t);await overlay(t);const out=await browser.tabs.executeScript(t.id,{code,runAt:'document_idle'});return out[0]}
async function computer(t,input){
  if(input.action==='screenshot')return run('screenshot',input);
  if(input.action==='wait'){await sleep(Math.min(9000,1000*Number(input.seconds||1)));return{ok:true}}
  if(!['left_click','type','scroll','key'].includes(input.action))throw Error('Firefox action not yet supported: '+input.action);
  const sel=JSON.stringify(input.selector||'');
  const xy=JSON.stringify(input.coordinate||null);
  const value=JSON.stringify(String(input.text||''));
  const target=`(${sel}?document.querySelector(${sel}):(${xy}?document.elementFromPoint(${xy}[0]/devicePixelRatio,${xy}[1]/devicePixelRatio):document.activeElement))`;
  const point=await script(t,`(()=>{let e=${target};if(!e)throw Error('element_not_found');let r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  await overlay(t,'overlay_move',{x:point.x,y:point.y,action:input.action==='type'?'typing':input.action==='scroll'?'scrolling':'moving'});
  await sleep(190);
  if(input.action==='left_click')await overlay(t,'overlay_click',{x:point.x,y:point.y});
  const action=JSON.stringify(input.action);
  return script(t,`(()=>{let e=${target};if(!e)throw Error('element_not_found');if(${action}==='left_click')e.click();if(${action}==='type'){if(e.matches('input[type=password],input[autocomplete*=cc-],input[autocomplete*=password]'))throw Error('sensitive_field_blocked');e.focus();if('value'in e){e.value+=${value};e.dispatchEvent(new Event('input',{bubbles:true}))}else if(e.isContentEditable){e.textContent+=${value};e.dispatchEvent(new InputEvent('input',{bubbles:true}))}else throw Error('not_editable')}if(${action}==='scroll')e.scrollBy?.(0,${Number(input.amount||400)});if(${action}==='key')e.dispatchEvent(new KeyboardEvent('keydown',{key:${value},bubbles:true}));return{ok:true,action:${action},tag:e.tagName}})()`);
}
async function run(name,input){if(name==='browser_status')return{connected:S.connected,paired:!!S.device,paused:S.paused};if(name==='browser_resume'){if(input.confirmed!==true)throw Error('confirmation_required');S.paused=false;return{paused:false}}if(S.paused)throw Error('browser_paused');
if(name==='computer')return computer(await tab(input),input);
if(name==='permissions_status')return{allSites:S.allow};
if(name==='permissions_set'){if(input.confirmed!==true)throw Error('confirmation_required');S.allow=!!input.allSites;await browser.storage.local.set({allow:S.allow});return{allSites:S.allow}}
if(name==='tabs_list_all'||name==='tabs_context'){const ids=new Set((await saintGroups()).map(g=>g.id));let tabs=(await browser.tabs.query({})).filter(t=>name==='tabs_context'?ids.has(t.groupId):!ids.has(t.groupId)).map(t=>({tabId:t.id,title:t.title,url:t.url,active:t.active,owned:S.owned.has(t.id),groupId:t.groupId}));if(name==='tabs_context'&&!tabs.length&&input.createIfEmpty)return run('tabs_create',{});return tabs}
if(name==='tabs_create'){let t=await browser.tabs.create({url:'about:blank',active:input.active!==false});try{const groupId=await group(t.id);S.owned.add(t.id);await browser.storage.local.set({owned:[...S.owned]});return{tabId:t.id,url:t.url,groupId}}catch(e){await browser.tabs.remove(t.id).catch(()=>{});throw e}}
if(name==='tabs_close'){let t=await tab(input);if(!S.owned.has(t.id))throw Error('cannot_close_user_tab');await browser.tabs.remove(t.id);S.controlled.delete(t.id);S.owned.delete(t.id);await browser.storage.local.set({owned:[...S.owned]});return{closed:t.id}}
if(name==='tabs_activate'){let t=await tab(input);const inSaint=(await saintGroups()).some(g=>g.id===t.groupId);if(!S.owned.has(t.id)&&!inSaint&&input.confirmed!==true)throw Error('confirmation_required_for_user_tab');const groupId=await group(t.id);await browser.tabs.update(t.id,{active:true});await browser.windows.update(t.windowId,{focused:true});await overlay(t);return{tabId:t.id,groupId}}
if(name==='navigate'){let t=await tab(input);let u=input.url;if(['back','forward','reload'].includes(u)){await browser.tabs[u==='back'?'goBack':u==='forward'?'goForward':'reload'](t.id)}else{if(!S.allow||!site(u))throw Error('website_permission_needed');await browser.tabs.update(t.id,{url:u})}let next=await tab(input);for(let i=0;i<40&&next.status!=='complete';i++){await sleep(100);next=await tab(input)}await overlay(next);return{tabId:t.id,url:next.url}}
if(name==='screenshot'){let t=await tab(input);permitted(t);if(!t.active)throw Error('activate_tab_before_screenshot');await overlay(t,'overlay_attach',{action:'capturing'});let data=await browser.tabs.captureVisibleTab(t.windowId,{format:input.format||'png',quality:input.quality});let [viewport]=await browser.tabs.executeScript(t.id,{code:'({cssWidth:innerWidth,cssHeight:innerHeight,dpr:devicePixelRatio})'});return{image:data.split(',')[1],mimeType:`image/${input.format||'png'}`,tabId:t.id,viewport,coordinateNote:'computer.coordinate uses screenshot pixels'}}
if(name==='get_page_text'||name==='read_page'){let t=await tab(input);let content=await script(t,'document.body?.innerText?.slice(0,50000)||""');return name==='read_page'?{tabId:t.id,url:t.url,text:content}:content}
if(name==='get_html'){let t=await tab(input);let sel=JSON.stringify(input.selector||'html');return script(t,`document.querySelector(${sel})?.${input.outer===false?'innerHTML':'outerHTML'}||null`)}
if(name==='find'){let t=await tab(input);let q=JSON.stringify(String(input.query).toLowerCase());return script(t,`[...document.querySelectorAll('a,button,input,textarea,select,[role]')].filter(e=>(e.innerText||e.getAttribute('aria-label')||e.value||'').toLowerCase().includes(${q})).slice(0,30).map(e=>({tag:e.tagName,text:(e.innerText||e.value||'').slice(0,150),selector:e.id?'#'+CSS.escape(e.id):e.tagName.toLowerCase()}))`)}
throw Error('Firefox tool not yet supported: '+name)}
(async()=>{let o=await browser.storage.local.get(['device','allow','owned']);S.device=o.device||null;S.allow=o.allow===true;S.owned=new Set(o.owned||[]);for(const id of S.owned)await group(id).catch(()=>{});connect()})();
