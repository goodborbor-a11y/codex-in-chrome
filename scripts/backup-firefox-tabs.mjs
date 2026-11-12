/* global process, fetch, crypto, AbortSignal, console */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const directory=process.env.CODEX_CHROME_CONFIG_DIR||join(homedir(),'.codex-chrome');
const config=JSON.parse(readFileSync(join(directory,'config.json'),'utf8'));
const sessionId=crypto.randomUUID();
async function tool(name,input={}){
  const response=await fetch(`http://127.0.0.1:${config.port}/rpc`,{
    method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${config.apiToken}`},
    body:JSON.stringify({sessionId,name,input}),signal:AbortSignal.timeout(15000)
  });
  const body=await response.json();
  if(!response.ok)throw Error(`${name}: ${body.error}`);
  return body.result;
}
const firefox=(await tool('browsers_list')).filter(browser=>browser.platform==='Firefox');
if(firefox.length!==1)throw Error(`Expected one connected Firefox, found ${firefox.length}`);
await tool('browser_select',{deviceId:firefox[0].deviceId});
const tabs=await tool('tabs_list_all');
mkdirSync(directory,{recursive:true});
const path=join(directory,`firefox-tabs-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
writeFileSync(path,JSON.stringify({savedAt:new Date().toISOString(),browser:firefox[0].name,tabs},null,2),{mode:0o600});
console.log(`Saved ${Array.isArray(tabs)?tabs.length:tabs.tabs?.length??0} Firefox tabs to ${path}`);
