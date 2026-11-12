/* global process, console, fetch, crypto, AbortSignal */
import { readFileSync, mkdtempSync, writeFileSync, rmSync, realpathSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { createServer } from 'node:http';

const config = JSON.parse(readFileSync(join(process.env.CODEX_CHROME_CONFIG_DIR || join(homedir(), '.codex-chrome'), 'config.json'), 'utf8'));
const sessionId = crypto.randomUUID();
async function tool(name, input = {}) {
  const response = await fetch(`http://127.0.0.1:${config.port}/rpc`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiToken}` },
    body: JSON.stringify({ sessionId, name, input }), signal: AbortSignal.timeout(30000)
  });
  const body = await response.json();
  if (!response.ok) throw Error(`${name}: ${body.error}`);
  return body.result;
}
let tabId;
let uploadDir;
let downloadedFile;
const server = createServer((request, response) => {
  if(request.url==='/download'){
    response.writeHead(200,{'content-type':'text/plain','content-disposition':'attachment; filename="saint-smoke.txt"'});
    response.end('download works');return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(`<!doctype html><title>Saint Firefox input test</title><h1>Saint Firefox input test</h1>
    <input id="first"><textarea id="second"></textarea>
    <select id="category"><option value="a">A</option><option value="b">B</option></select>
    <input id="agree" type="checkbox"><output id="result"></output>
    <input id="upload" type="file"><output id="uploaded"></output>
    <button id="action">Action</button><output id="action-result"></output>
    <div class="anonymous"><input aria-label="Unlabeled test input"></div>
    <div style="height:7000px">Long page for scroll testing</div>
    <script>
      const first = document.querySelector('#first'), second = document.querySelector('#second');
      const update = () => document.querySelector('#result').textContent = first.value + '|' + second.value;
      first.addEventListener('input', update); second.addEventListener('input', update); update();
      document.querySelector('#upload').addEventListener('change', async event => {
        const file=event.target.files[0];
        document.querySelector('#uploaded').textContent=file.name+':'+await file.text();
      });
      document.querySelector('#action').addEventListener('mouseover',()=>document.querySelector('#action-result').textContent='hovered');
      document.querySelector('#action').addEventListener('click',()=>document.querySelector('#action-result').textContent='clicked');
    </script>`);
});
try {
  const firefox = (await tool('browsers_list')).filter(b => b.platform === 'Firefox');
  if (firefox.length !== 1) throw Error(`Expected one Firefox browser, found ${firefox.length}`);
  await tool('browser_select', { deviceId: firefox[0].deviceId });
  const capabilities=await tool('browser_capabilities');
  if(capabilities.platform!=='Firefox'||!capabilities.tools?.includes('file_upload'))throw Error('Firefox capability listing is missing upload support');
  const tab = await tool('tabs_create'); tabId = tab.tabId;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const navigation = await tool('navigate', { tabId, url: `http://127.0.0.1:${address.port}/` });
  console.log('Navigation:', navigation);
  const page = await tool('get_page_text', { tabId });
  if (String(page).length < 20) throw Error(`Unexpected page text: ${String(page).slice(0, 120)}`);
  const shot = await tool('screenshot', { tabId });
  if (String(shot.image || '').length < 1000) throw Error('Screenshot missing');
  await tool('form_input', { tabId, fields: [{ selector: '#first', value: 'alpha' }, { selector: '#second', value: 'beta' }] });
  if (!(await tool('get_page_text', { tabId })).includes('alpha|beta')) throw Error('Firefox form_input did not update both fields');
  await tool('computer', { tabId, action: 'left_click', selector: '#first' });
  await tool('clear_field', { tabId, selector: '#first' });
  await tool('insert_text', { tabId, text: 'gamma' });
  if (!(await tool('get_page_text', { tabId })).includes('gamma|beta')) throw Error('Firefox click, clear_field, or insert_text failed');
  await tool('computer', { tabId, action: 'type', selector: '#second', text: '!' });
  if (!(await tool('get_page_text', { tabId })).includes('gamma|beta!')) throw Error('Firefox computer type failed');
  const interactive = await tool('read_page', { tabId, filter: 'interactive' });
  if (!interactive.nodes?.some(node => node.selector === '#first')) throw Error('Firefox interactive page reading failed');
  const anonymous = interactive.nodes?.find(node => node.name === 'Unlabeled test input');
  if (!anonymous?.selector) throw Error('Firefox did not give an anonymous field a reusable selector');
  await tool('form_input', { tabId, fields: [{ selector: anonymous.selector, value: 'discovered' }] });
  if ((await tool('get_element', { tabId, selector: anonymous.selector })).value !== 'discovered') throw Error('Firefox selector did not target the discovered field');
  await tool('wait_for', { tabId, selector: '#category' });
  await tool('select_option', { tabId, selector: '#category', value: 'b' });
  await tool('check', { tabId, selector: '#agree' });
  if ((await tool('get_element', { tabId, selector: '#category' })).value !== 'b') throw Error('Firefox select_option failed');
  if ((await tool('get_element', { tabId, selector: '#agree' })).checked !== true) throw Error('Firefox check failed');
  await tool('focus', { tabId, selector: '#first' });
  await tool('computer', { tabId, action: 'key', text: 'Ctrl+A' });
  await tool('computer', { tabId, action: 'key', text: 'Backspace' });
  await tool('insert_text', { tabId, text: 'omega' });
  if (!(await tool('get_page_text', { tabId })).includes('omega|beta!')) throw Error('Firefox focus or keyboard editing failed');
  await tool('scroll_into_view', { tabId, selector: '#second' });
  await tool('scroll_page', { tabId, to: 'top' });
  uploadDir=mkdtempSync(join(homedir(),'saint-upload-test-'));
  const uploadPath=join(uploadDir,'sample.txt');
  writeFileSync(uploadPath,'hello upload');
  await tool('file_upload',{tabId,selector:'#upload',paths:[uploadPath],confirmed:true});
  await tool('wait_for',{tabId,text:'sample.txt:hello upload',timeoutMs:5000});
  const measured=await tool('measure',{tabId,ref:'#first'});
  if(measured.box?.w<=0)throw Error('Firefox measure failed');
  await tool('highlight',{tabId,selector:'#first',label:'test'});
  if((await tool('javascript',{tabId,code:'document.title',confirmed:true}))!=='Saint Firefox input test')throw Error('Firefox javascript failed');
  await tool('javascript',{tabId,code:'localStorage.setItem("saint_smoke","ok")',confirmed:true});
  if((await tool('storage_read',{tabId,kind:'local'})).saint_smoke!=='ok')throw Error('Firefox storage_read failed');
  await tool('javascript',{tabId,code:'localStorage.removeItem("saint_smoke")',confirmed:true});
  const cookieName='saint_smoke_'+Date.now();
  await tool('cookies_set',{tabId,name:cookieName,value:'ok',confirmed:true});
  if(!(await tool('storage_read',{tabId,kind:'cookies'})).some(cookie=>cookie.name===cookieName))throw Error('Firefox cookie tools failed');
  await tool('javascript',{tabId,code:`document.cookie=${JSON.stringify(cookieName+'=; Max-Age=0; Path=/')}`,confirmed:true});
  if(!Array.isArray(await tool('downloads_list'))||!Array.isArray(await tool('sessions_list')))throw Error('Firefox downloads or sessions listing failed');
  const downloadName=`saint-smoke-${Date.now()}.txt`;
  await tool('download_url',{url:`http://127.0.0.1:${address.port}/download`,filename:`Saint/${downloadName}`,confirmed:true});
  const download=await tool('download_wait',{filenameHint:downloadName,timeoutMs:5000});
  downloadedFile=realpathSync(download.filename);
  if(readFileSync(downloadedFile,'utf8')!=='download works')throw Error('Firefox downloaded file content differs');
  const batch=await tool('batch',{actions:[{name:'get_element',input:{tabId,selector:'#first'}},{name:'scroll_until',input:{tabId,text:'Long page for scroll testing',maxScrolls:1}}]});
  if(batch.results?.length!==2||batch.results.some(item=>item.error))throw Error('Firefox batch or scroll_until failed');
  await tool('computer',{tabId,action:'hover',selector:'#action'});
  if(!(await tool('get_page_text',{tabId})).includes('hovered'))throw Error('Firefox hover failed');
  await tool('computer',{tabId,action:'key',selector:'#action',text:'Enter',confirmed:true});
  if(!(await tool('get_page_text',{tabId})).includes('clicked'))throw Error('Firefox confirmed Enter failed');
  await tool('computer',{tabId,action:'scroll_to',selector:'#first'});
  const before=(await tool('measure',{tabId,ref:'#first'})).box.y;
  const scrolled = await tool('computer', { tabId, action: 'scroll', direction: 'down', amount: 500 });
  const after=(await tool('measure',{tabId,ref:'#first'})).box.y;
  if (scrolled.target !== 'page'||after>=before) throw Error('Firefox page did not move on scroll');
  console.log('Firefox LIVE PASS: navigation, screenshot, form, typing, reusable selectors, file upload, measure, script, batch, scroll');
} finally {
  if (tabId) await tool('tabs_close', { tabId }).catch(e => console.error('Could not close test tab:', e.message));
  if (server.listening) server.close();
  if(uploadDir)rmSync(uploadDir,{recursive:true,force:true});
  if(downloadedFile){const rel=relative(homedir(),downloadedFile);if(rel&&!rel.startsWith('..')&&!isAbsolute(rel))unlinkSync(downloadedFile)}
}
