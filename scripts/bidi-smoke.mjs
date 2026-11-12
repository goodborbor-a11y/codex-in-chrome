/* global process, console */
import { FirefoxBidi } from '../packages/bridge/src/firefox-bidi.ts';

const port=Number(process.argv[2]||19222);
const bidi=await FirefoxBidi.connect(port);
let context;
try{
  const created=await bidi.call('browsingContext.create',{type:'tab'});
  context=created.context;
  const html='<input id="x"><output id="o"></output><div style="height:4000px"></div><script>document.querySelector("#x").addEventListener("input",e=>document.querySelector("#o").textContent=String(e.isTrusted))</script>';
  await bidi.call('browsingContext.navigate',{context,url:'data:text/html,'+encodeURIComponent(html),wait:'complete'});
  await bidi.call('script.evaluate',{expression:'document.documentElement.setAttribute("data-saint-tab-id","123")',target:{context},awaitPromise:false,resultOwnership:'none'});
  if(await bidi.contextForTab(123)!==context)throw Error('BiDi did not match the marked tab');
  const rect=await bidi.call('script.evaluate',{expression:'(()=>{const r=document.querySelector("#x").getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2})})()',target:{context},awaitPromise:false,resultOwnership:'none'});
  await bidi.pointer(context,JSON.parse(rect.result.value),'left_click');
  await bidi.type(context,'AB');
  const result=await bidi.call('script.evaluate',{expression:'JSON.stringify({value:document.querySelector("#x").value,trusted:document.querySelector("#o").textContent})',target:{context},awaitPromise:false,resultOwnership:'none'});
  const parsed=JSON.parse(result.result.value);
  if(parsed.value!=='AB'||parsed.trusted!=='true')throw Error(`BiDi trusted input failed: ${JSON.stringify(parsed)}`);
  await bidi.call('script.evaluate',{expression:'window.__saintScrollPositions=[];addEventListener("scroll",()=>window.__saintScrollPositions.push(scrollY))',target:{context},awaitPromise:false,resultOwnership:'none'});
  await bidi.scroll(context,{x:200,y:200},'down',500);
  const scroll=await bidi.call('script.evaluate',{expression:'scrollY',target:{context},awaitPromise:false,resultOwnership:'none'});
  if(Number(scroll.result.value)<100)throw Error('BiDi wheel did not scroll the page');
  const steps=await bidi.call('script.evaluate',{expression:'new Set(window.__saintScrollPositions).size',target:{context},awaitPromise:false,resultOwnership:'none'});
  if(Number(steps.result.value)<2)throw Error('BiDi wheel jumped instead of animating');
  console.log('Firefox BiDi PASS: marked tab, trusted click, trusted typing, smooth wheel');
}finally{
  if(context)await bidi.call('browsingContext.close',{context}).catch(()=>{});
  await bidi.close();
}
