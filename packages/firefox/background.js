/* global browser, crypto, WebSocket, setTimeout, URL, fetch, document, window, devicePixelRatio, HTMLInputElement, HTMLTextAreaElement, HTMLSelectElement, Event, InputEvent, MouseEvent, CSS */
const S={ws:null,port:17345,device:null,code:'',connected:false,allow:false,paused:false,owned:new Set(),controlled:new Set(),selected:'',retry:null,capabilities:null};
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
S.code=Array.from(crypto.getRandomValues(new Uint8Array(6)),x=>alphabet[x%alphabet.length]).join('');
const send=o=>{if(S.ws?.readyState===WebSocket.OPEN)S.ws.send(JSON.stringify(o));};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const site=url=>{try{let u=new URL(url);return ['http:','https:'].includes(u.protocol)?u.origin:''}catch{return ''}};
async function connect(){if(S.ws||S.retry)return;let port=S.port;try{const r=await fetch(`http://127.0.0.1:${port}/health`);if(!r.ok)throw Error('bridge offline');}catch{S.retry=setTimeout(()=>{S.retry=null;connect()},3000);return}
const ws=new WebSocket(`ws://127.0.0.1:${port}/extension`);S.ws=ws;
ws.onopen=()=>{S.connected=true;send({type:'hello',deviceId:S.device?.deviceId,token:S.device?.token,pairCode:S.code,platform:'Firefox',buildId:`firefox-${browser.runtime.getManifest().version}`,capabilities:S.capabilities})};
ws.onmessage=e=>{void incoming(JSON.parse(e.data))};
ws.onclose=()=>{S.connected=false;S.ws=null;S.retry=setTimeout(()=>{S.retry=null;connect()},1000)};
ws.onerror=()=>ws.close();}
async function incoming(m){if(m.type==='paired'){S.device={deviceId:m.deviceId,token:m.token,name:m.name};await browser.storage.local.set({device:S.device});send({type:'hello',...S.device,platform:'Firefox',buildId:`firefox-${browser.runtime.getManifest().version}`,capabilities:S.capabilities});return}
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
function cssPath(e){
  if(e.id)return '#'+CSS.escape(e.id);
  const parts=[];
  for(let n=e;n&&n.nodeType===1;n=n.parentElement){
    if(n.id){parts.unshift('#'+CSS.escape(n.id));break}
    let part=n.localName;
    if(n.parentElement){const siblings=[...n.parentElement.children].filter(x=>x.localName===n.localName);if(siblings.length>1)part+=`:nth-of-type(${siblings.indexOf(n)+1})`}
    parts.unshift(part);
  }
  return parts.join(' > ');
}
function domAction(input){
  const at=input.coordinate;
  let e=input.selector?document.querySelector(input.selector):at?document.elementFromPoint(at[0]/devicePixelRatio,at[1]/devicePixelRatio):document.activeElement;
  if(!e)throw Error('element_not_found');
  if(input.action==='inspect'){
    const r=e.getBoundingClientRect(),field=[e.getAttribute('type'),e.getAttribute('name'),e.id,e.getAttribute('autocomplete')].join(' '),isSecret=/password|card.?number|\bcc-?\b|\bcvv\b|\bcvc\b|\bssn\b/i.test(field);
    return{tag:e.tagName.toLowerCase(),type:e.getAttribute('type'),role:e.getAttribute('role'),name:e.getAttribute('aria-label')||e.getAttribute('name')||'',text:(e.innerText||'').slice(0,300),value:isSecret?'[redacted]':'value'in e?e.value:undefined,focused:document.activeElement===e,disabled:!!e.disabled,checked:e.checked,selector:e.id?'#'+CSS.escape(e.id):input.selector||null,box:{x:r.x,y:r.y,w:r.width,h:r.height}};
  }
  if(input.action==='focus'){e.focus();return{ok:true,focused:document.activeElement===e}}
  if(input.action==='blur'){e.blur();return{ok:true,focused:document.activeElement===e}}
  if(input.action==='scroll_into_view'){e.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});return{ok:true}}
  if(input.action==='left_click'){
    e.click();
    const focus=e.matches('input,textarea,select,[contenteditable]')?e:e.control||null;
    focus?.focus();
    return{ok:true,action:'left_click',tag:e.tagName,focused:document.activeElement?.tagName};
  }
  if(input.action==='scroll'){
    const amount=Number(input.amount||400),direction=input.direction||'down';
    const dx=direction==='left'?-amount:direction==='right'?amount:0,dy=direction==='up'?-amount:direction==='down'?amount:0;
    const target=e.scrollHeight>e.clientHeight||e.scrollWidth>e.clientWidth?e:window;
    target.scrollBy({left:dx,top:dy,behavior:'smooth'});return{ok:true,action:'scroll',tag:e.tagName,target:target===window?'page':'element'};
  }
  if(input.action==='hover'||input.action==='mouse_move'){
    const r=e.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
    e.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:x,clientY:y}));
    e.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:x,clientY:y}));
    return{ok:true,action:input.action,tag:e.tagName};
  }
  if(input.action==='key'){
    const key=String(input.text||''),lower=key.toLowerCase();
    if((lower==='ctrl+a'||lower==='control+a')&&typeof e.select==='function'){e.select();return{ok:true,key,selected:true}}
    if((lower==='backspace'||lower==='delete')&&typeof e.selectionStart==='number'){
      const start=e.selectionStart,end=e.selectionEnd,from=start===end&&lower==='backspace'?Math.max(0,start-1):start,to=start===end&&lower==='delete'?Math.min(e.value.length,end+1):end;
      e.value=e.value.slice(0,from)+e.value.slice(to);e.setSelectionRange(from,from);
      e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:lower==='backspace'?'deleteContentBackward':'deleteContentForward'}));
      return{ok:true,key,tag:e.tagName};
    }
    if(lower==='tab'){
      const nodes=[...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(n=>!n.disabled&&n.getBoundingClientRect().width>0);
      nodes[(nodes.indexOf(e)+1)%nodes.length]?.focus();return{ok:true,key,focused:document.activeElement?.tagName};
    }
    if(lower==='enter'){
      if(input.confirmed!==true)throw Error('confirmation_required');
      if(e instanceof HTMLTextAreaElement){e.value+="\n";e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertLineBreak'}));return{ok:true,key}}
      if(e.form?.requestSubmit)e.form.requestSubmit();else e.click();
      return{ok:true,key};
    }
    throw Error('firefox_key_not_supported: '+key);
  }
  if(input.action!=='type'&&input.action!=='replace'&&input.action!=='clear')throw Error('Firefox action not yet supported: '+input.action);
  if(e.matches('input,textarea,select')&&(e.disabled||e.readOnly))throw Error('not_editable');
  const kind=(e.getAttribute('type')||'').toLowerCase();
  const details=[kind,e.getAttribute('name'),e.id,e.getAttribute('autocomplete')].join(' ');
  if(/password|card.?number|\bcc-?\b|\bcvv\b|\bcvc\b|\bssn\b/i.test(details))throw Error('sensitive_field_blocked');
  e.focus();
  const text=String(input.text??'');
  if(e instanceof HTMLInputElement){
    if(['file','hidden','button','submit','reset','image'].includes(kind))throw Error('not_editable');
    if(kind==='checkbox'||kind==='radio'){
      if(input.action==='type')throw Error('not_editable');
      e.checked=text==='true'||text==='1';
      e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));
      return{ok:true,tag:e.tagName,checked:e.checked};
    }
    if(input.action==='type'&&!['text','search','email','url','tel','password','number',''].includes(kind))throw Error('not_editable');
  }else if(!(e instanceof HTMLTextAreaElement)&&!(e instanceof HTMLSelectElement)&&!e.isContentEditable)throw Error('not_editable');
  if(e instanceof HTMLSelectElement){
    if(input.action==='type')throw Error('not_editable');
    e.value=text;
  }else if(e.isContentEditable){
    if(input.action==='type'){
      if(!document.execCommand('insertText',false,text))e.textContent=(e.textContent||'')+text;
    }else e.textContent=text;
  }else if(input.action==='type'&&typeof e.selectionStart==='number'){
    const start=e.selectionStart,end=e.selectionEnd;
    e.value=e.value.slice(0,start)+text+e.value.slice(end);
    e.setSelectionRange(start+text.length,start+text.length);
  }else e.value=input.action==='type'?e.value+text:text;
  e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:input.action==='type'?'insertText':'insertReplacementText',data:text}));
  if(input.action!=='type')e.dispatchEvent(new Event('change',{bubbles:true}));
  return{ok:true,tag:e.tagName,typed:text.length,focused:document.activeElement===e};
}
async function edit(t,input){return script(t,`(${domAction.toString()})(${JSON.stringify(input)})`)}
async function pointFor(t,input,mark=false){
  const selector=JSON.stringify(input.selector||input.ref||''),xy=JSON.stringify(input.coordinate||null);
  const marker=mark?`document.documentElement.setAttribute('data-saint-tab-id',${JSON.stringify(String(t.id))});`:'';
  return script(t,`(()=>{${marker}const at=${xy},sel=${selector},scroll=${JSON.stringify(input.action==='scroll')};const e=at?document.elementFromPoint(at[0]/devicePixelRatio,at[1]/devicePixelRatio):sel?document.querySelector(sel):scroll?document.elementFromPoint(innerWidth/2,innerHeight/2):document.activeElement;if(!e)throw Error('element_not_found');if(${JSON.stringify(['type','key'].includes(input.action))}){const details=[e.getAttribute('type'),e.getAttribute('name'),e.id,e.getAttribute('autocomplete')].join(' ');if(/password|card.?number|\\bcc-?\\b|\\bcvv\\b|\\bcvc\\b|\\bssn\\b/i.test(details))throw Error('sensitive_field_blocked');if(e.matches('input[type=file],input[type=hidden],input[type=checkbox],input[type=radio]'))throw Error('not_editable')}const r=e.getBoundingClientRect();return{x:at?at[0]/devicePixelRatio:scroll&&!sel?innerWidth/2:r.left+r.width/2,y:at?at[1]/devicePixelRatio:scroll&&!sel?innerHeight/2:r.top+r.height/2,dpr:devicePixelRatio}})()`);
}
async function computer(t,input){
  if(input.action==='screenshot')return run('screenshot',input);
  if(input.action==='wait'){await sleep(Math.min(9000,1000*Number(input.seconds||1)));return{ok:true}}
  if(!['left_click','type','scroll','key','hover','mouse_move','scroll_to'].includes(input.action))throw Error('Firefox action not yet supported: '+input.action);
  if(input.action==='scroll_to'){const result=await edit(t,{action:'scroll_into_view',selector:input.selector||input.ref});await sleep(450);return result}
  const point=await pointFor(t,input);
  await overlay(t,'overlay_move',{x:point.x,y:point.y,action:input.action==='type'?'typing':input.action==='scroll'?'scrolling':'moving'});
  await sleep(190);
  if(input.action==='left_click')await overlay(t,'overlay_click',{x:point.x,y:point.y});
  const result=await edit(t,input);if(input.action==='scroll')await sleep(450);return result;
}
async function run(name,input){if(name==='browser_status')return{connected:S.connected,paired:!!S.device,paused:S.paused};if(name==='browser_resume'){if(input.confirmed!==true)throw Error('confirmation_required');S.paused=false;return{paused:false}}if(name==='extension_reload'){setTimeout(()=>browser.runtime.reload(),500);return{reloading:true}}if(S.paused)throw Error('browser_paused');
if(name==='computer')return computer(await tab(input),input);
if(name==='bidi_target'){
  const t=await tab(input);if(!t.active)throw Error('activate_tab_before_bidi_action');
  const point=await pointFor(t,input,true);
  await overlay(t,'overlay_move',{x:point.x,y:point.y,action:input.action==='type'?'typing':input.action==='scroll'?'scrolling':'moving'});
  if(['left_click','double_click','triple_click','right_click','middle_click'].includes(input.action))await overlay(t,'overlay_click',{x:point.x,y:point.y});
  return point;
}
if(name==='batch'){
  const results=[],started=Date.now();
  for(const item of (input.actions||[]).slice(0,50)){
    if(Date.now()-started>24000)return{partial:true,results};
    try{if(item.name==='batch')throw Error('nested_batch_not_allowed');results.push({name:item.name,result:await run(item.name,item.input||{})})}
    catch(e){results.push({name:item.name,error:e.message});if(!input.continueOnError)break}
  }
  return{results};
}
if(name==='file_upload'||name==='upload_image'){
  if(input.confirmed!==true)throw Error('confirmation_required');
  const t=await tab(input),selector=input.selector||input.ref;
  if(!selector)throw Error('file_input_selector_required');
  permitted(t);await overlay(t);
  return browser.tabs.sendMessage(t.id,{type:'set_files',selector,files:input.filesData||[]});
}
if(name==='permissions_status')return{allSites:S.allow};
if(name==='permissions_set'){if(input.confirmed!==true)throw Error('confirmation_required');S.allow=!!input.allSites;await browser.storage.local.set({allow:S.allow});return{allSites:S.allow}}
if(name==='sessions_list')return browser.sessions.getRecentlyClosed({maxResults:25});
if(name==='sessions_restore'){if(input.confirmed!==true)throw Error('confirmation_required');return browser.sessions.restore(input.sessionId)}
if(name==='downloads_list')return(await browser.downloads.search({})).sort((a,b)=>String(b.startTime).localeCompare(String(a.startTime))).slice(0,100).map(d=>({id:d.id,filename:d.filename,url:d.url,state:d.state,startTime:d.startTime}));
if(name==='download_url'){if(input.confirmed!==true)throw Error('confirmation_required');if(!site(input.url))throw Error('invalid_download_url');const details={url:input.url,saveAs:false};if(input.filename)details.filename=input.filename;const id=await browser.downloads.download(details);return{id}}
if(name==='download_wait'){
  const deadline=Date.now()+Math.min(120000,Number(input.timeoutMs||10000));
  while(Date.now()<deadline){const list=(await browser.downloads.search({})).sort((a,b)=>String(b.startTime).localeCompare(String(a.startTime)));const match=list.find(d=>!input.filenameHint||d.filename?.includes(input.filenameHint));if(match?.state==='complete')return{id:match.id,filename:match.filename,state:match.state};if(match?.state==='interrupted')throw Error('download_interrupted');await sleep(500)}
  throw Error('download_wait_timed_out');
}
if(name==='tabs_list_all'||name==='tabs_context'){const ids=new Set((await saintGroups()).map(g=>g.id));let tabs=(await browser.tabs.query({})).filter(t=>name==='tabs_context'?ids.has(t.groupId):!ids.has(t.groupId)).map(t=>({tabId:t.id,title:t.title,url:t.url,active:t.active,owned:S.owned.has(t.id),groupId:t.groupId}));if(name==='tabs_context'&&!tabs.length&&input.createIfEmpty)return run('tabs_create',{});return tabs}
if(name==='tabs_create'){let t=await browser.tabs.create({url:'about:blank',active:input.active!==false});try{const groupId=await group(t.id);S.owned.add(t.id);await browser.storage.local.set({owned:[...S.owned]});return{tabId:t.id,url:t.url,groupId}}catch(e){await browser.tabs.remove(t.id).catch(()=>{});throw e}}
if(name==='window_new'){const w=await browser.windows.create({url:'about:blank'}),t=w.tabs?.[0];if(!t?.id)throw Error('window_tab_missing');const groupId=await group(t.id);S.owned.add(t.id);await browser.storage.local.set({owned:[...S.owned]});return{windowId:w.id,tabId:t.id,groupId}}
if(name==='window_resize'){const t=await tab(input);await browser.windows.update(t.windowId,{width:Number(input.width),height:Number(input.height)});return{ok:true,width:input.width,height:input.height}}
if(name==='tabs_close'){let t=await tab(input);if(!S.owned.has(t.id))throw Error('cannot_close_user_tab');await browser.tabs.remove(t.id);S.controlled.delete(t.id);S.owned.delete(t.id);await browser.storage.local.set({owned:[...S.owned]});return{closed:t.id}}
if(name==='tabs_activate'){let t=await tab(input);const inSaint=(await saintGroups()).some(g=>g.id===t.groupId);if(!S.owned.has(t.id)&&!inSaint&&input.confirmed!==true)throw Error('confirmation_required_for_user_tab');const groupId=await group(t.id);await browser.tabs.update(t.id,{active:true});await browser.windows.update(t.windowId,{focused:true});await overlay(t);return{tabId:t.id,groupId}}
if(name==='navigate'){let t=await tab(input);let u=input.url;if(['back','forward','reload'].includes(u)){await browser.tabs[u==='back'?'goBack':u==='forward'?'goForward':'reload'](t.id)}else{if(!S.allow||!site(u))throw Error('website_permission_needed');await browser.tabs.update(t.id,{url:u})}let next=await tab(input);for(let i=0;i<100;i++){next=await tab(input);if(next.status==='complete'&&(next.url===u||next.url?.startsWith(u)||next.url!==t.url&&site(next.url)))break;await sleep(100)}if(!site(next.url))throw Error('navigation_not_ready: '+next.url);await overlay(next);return{tabId:t.id,url:next.url}}
if(name==='screenshot'){let t=await tab(input);permitted(t);if(!t.active)throw Error('activate_tab_before_screenshot');await overlay(t,'overlay_attach',{action:'capturing'});let data=await browser.tabs.captureVisibleTab(t.windowId,{format:input.format||'png',quality:input.quality});let [viewport]=await browser.tabs.executeScript(t.id,{code:'({cssWidth:innerWidth,cssHeight:innerHeight,dpr:devicePixelRatio})'});return{image:data.split(',')[1],mimeType:`image/${input.format||'png'}`,tabId:t.id,viewport,coordinateNote:'computer.coordinate uses screenshot pixels'}}
if(name==='get_page_text'||name==='read_page'){
  const t=await tab(input);
  if(name==='read_page'&&input.filter==='interactive'){
    const max=Math.min(5000,Number(input.maxNodes||500));
    const nodes=await script(t,`(()=>{const cssPath=${cssPath.toString()};return[...document.querySelectorAll('a[href],button,input,textarea,select,[contenteditable],[role],[tabindex]')].slice(0,${max}).map(e=>{const r=e.getBoundingClientRect();return{tag:e.tagName.toLowerCase(),role:e.getAttribute('role'),name:e.getAttribute('aria-label')||e.getAttribute('name')||e.innerText?.slice(0,100)||'',type:e.getAttribute('type'),selector:cssPath(e),box:{x:r.x,y:r.y,w:r.width,h:r.height},focused:document.activeElement===e}})})()`);
    return{tabId:t.id,url:t.url,nodes};
  }
  const expression=input.mode==='selection'?'String(getSelection()||"")':input.mode==='article'?'(document.querySelector("article,main")||document.body)?.innerText?.slice(0,50000)||""':'document.body?.innerText?.slice(0,50000)||""';
  const content=await script(t,expression);
  return name==='read_page'?{tabId:t.id,url:t.url,text:content}:content;
}
if(name==='get_html'){let t=await tab(input);let sel=JSON.stringify(input.selector||'html');return script(t,`document.querySelector(${sel})?.${input.outer===false?'innerHTML':'outerHTML'}||null`)}
if(name==='storage_read'){
  const t=await tab(input);permitted(t);
  if(input.kind==='cookies')return browser.cookies.getAll({url:t.url});
  if(input.kind==='indexeddb_names')return script(t,'indexedDB.databases().then(items=>items.map(item=>item.name))');
  const kind=input.kind==='session'?'sessionStorage':'localStorage';
  return script(t,`Object.fromEntries(Object.entries(${kind}))`);
}
if(name==='cookies_set'){
  if(input.confirmed!==true)throw Error('confirmation_required');
  const t=await tab(input);permitted(t);const url=input.url||t.url;
  if(site(url)!==site(t.url))throw Error('cookie_origin_mismatch');
  if(input.domain&&input.domain!==new URL(t.url).hostname)throw Error('cookie_domain_mismatch');
  const details={url,name:input.name,value:input.value};for(const key of ['domain','path','secure','httpOnly'])if(input[key]!==undefined)details[key]=input[key];
  const cookie=await browser.cookies.set(details);
  return{name:cookie.name,domain:cookie.domain,path:cookie.path};
}
if(name==='cookies_clear'){
  if(input.confirmed!==true)throw Error('confirmation_required');
  const t=await tab(input);permitted(t);const cookies=await browser.cookies.getAll({url:t.url});
  for(const cookie of cookies){const url=`${cookie.secure?'https':'http'}://${cookie.domain.replace(/^\./,'')}${cookie.path}`;await browser.cookies.remove({url,name:cookie.name,storeId:cookie.storeId})}
  return{cleared:cookies.length};
}
if(name==='javascript'){if(input.confirmed!==true)throw Error('confirmation_required_for_javascript');if(input.world==='main')throw Error('firefox_main_world_not_supported');return script(await tab(input),String(input.code||''))}
if(name==='find'){let t=await tab(input);let q=JSON.stringify(String(input.query).toLowerCase());return script(t,`(()=>{const cssPath=${cssPath.toString()};return[...document.querySelectorAll('a,button,input,textarea,select,[role]')].filter(e=>(e.innerText||e.getAttribute('aria-label')||e.getAttribute('name')||'').toLowerCase().includes(${q})).slice(0,30).map(e=>({tag:e.tagName,text:(e.innerText||e.getAttribute('aria-label')||'').slice(0,150),selector:cssPath(e)}))})()`)}
if(name==='measure')return edit(await tab(input),{action:'inspect',selector:input.ref});
if(name==='highlight'){
  const t=await tab(input),selector=input.selector||input.ref;
  return script(t,`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('element_not_found');e.style.outline='3px solid #00f7f6';e.style.boxShadow='0 0 12px #f708f788';return{ok:true,selector:${JSON.stringify(selector)}}})()`);
}
if(['get_element','focus','blur','scroll_into_view'].includes(name)){const result=await edit(await tab(input),{action:name==='get_element'?'inspect':name,selector:input.selector||input.ref});if(name==='scroll_into_view')await sleep(450);return result}
if(['select_option','check','uncheck'].includes(name))return edit(await tab(input),{action:'replace',selector:input.selector||input.ref,text:name==='check'?'true':name==='uncheck'?'false':input.value});
if(name==='wait_for'){
  const deadline=Date.now()+Math.min(30000,Number(input.timeoutMs||10000));
  while(Date.now()<deadline){
    const current=await tab(input);
    if(input.url_pattern&&current.url?.includes(input.url_pattern))return{ok:true,url:current.url};
    if(input.selector||input.ref){const found=await script(current,`!!document.querySelector(${JSON.stringify(input.selector||input.ref)})`).catch(()=>false);if(found)return{ok:true,selector:input.selector||input.ref}}
    if(input.text){const found=await script(current,`document.body?.innerText?.includes(${JSON.stringify(input.text)})||false`).catch(()=>false);if(found)return{ok:true,text:input.text}}
    await sleep(250);
  }
  throw Error('wait_for_timed_out');
}
if(name==='scroll_page'){
  const t=await tab(input),to=input.to,percent=Math.max(0,Math.min(100,Number(input.percent||0)));
  const result=await script(t,`(()=>{const y=${JSON.stringify(to)}==='top'?0:${JSON.stringify(to)}==='bottom'?document.documentElement.scrollHeight:document.documentElement.scrollHeight*${percent}/100;window.scrollTo({top:y,behavior:'smooth'});return{ok:true,targetY:y}})()`);await sleep(450);return result;
}
if(name==='scroll_until'){
  const t=await tab(input),max=Math.min(30,Number(input.maxScrolls||10));
  for(let i=0;i<max;i++){
    if(input.selector&&await script(t,`!!document.querySelector(${JSON.stringify(input.selector)})`))return{found:true,scrolls:i};
    if(input.text&&await script(t,`document.body?.innerText?.includes(${JSON.stringify(input.text)})||false`))return{found:true,scrolls:i};
    await script(t,'window.scrollBy({top:600,behavior:"smooth"});true');await sleep(500);
  }
  throw Error('scroll_target_not_found');
}
if(name==='insert_text')return edit(await tab(input),{action:'type',text:input.text});
if(name==='clear_field')return edit(await tab(input),{action:'clear',selector:input.selector||input.ref,text:''});
if(name==='form_input'){
  const t=await tab(input),results=[];
  for(const field of input.fields||[]){
    if(!field.selector&&!field.ref)throw Error('field_selector_required');
    results.push(await edit(t,{action:'replace',selector:field.selector||field.ref,text:String(field.value)}));
  }
  return results;
}
throw Error('Firefox tool not yet supported: '+name)}
(async()=>{let o=await browser.storage.local.get(['device','allow','owned']);S.device=o.device||null;S.allow=o.allow===true;S.owned=new Set(o.owned||[]);S.capabilities=await(await fetch(browser.runtime.getURL('capabilities.json'))).json();for(const id of S.owned)await group(id).catch(()=>{});connect()})();
