const {chromium}=require('playwright-core');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'qa','1.9.1');
(async()=>{let browser;const results=[];const server=http.createServer((q,r)=>{const n=new URL(q.url,'http://local').pathname.slice(1)||'index.html';if(!/^[a-z.-]+$/.test(n))return r.writeHead(404).end();fs.readFile(path.join(root,'app/assets',n),(e,b)=>{if(e)return r.writeHead(404).end();r.setHeader('Content-Type',n.endsWith('.js')?'text/javascript':n.endsWith('.css')?'text/css':'text/html');r.end(b)})});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const c=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,reducedMotion:'no-preference'});await c.addInitScript(()=>{const n=Date.now();window.fixture={hist:[[n-864e5,20],[n,18]],room:'合成宿舍',lastFetch:n,storage:{activeKey:'a'},fetch:'idle',stateRevision:1,dataReady:true,prefs:{motion:'on',disclaimer:'2',notifyAsked:'1',badgesInit:'1',thanks:'{"never":true}'}};window.Native={getState:()=>JSON.stringify(fixture),setPref(k,v){fixture.prefs[k]=v},setBars(){},haptic(){},schedule(){},refresh(){}}});
const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:'+server.address().port+'/');await p.waitForTimeout(500);
const cdp=await c.newCDPSession(p);
const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1,radiusX:2,radiusY:2,force:1}]});
const center=async page=>{const b=await p.locator('#nav [data-page='+page+']').boundingBox();return{x:b.x+b.width/2,y:b.y+b.height/2}};
const check=(name,ok)=>{assert.ok(ok,name);results.push(name)};
const pos=await center('home');
await p.evaluate(()=>{window.samples=[];window.sampling=true;function frame(t){const pill=document.querySelector('.nav-pill');const m=new DOMMatrix(getComputedStyle(pill).transform);samples.push({t,w:pill.getBoundingClientRect().width,h:pill.getBoundingClientRect().height,x:m.e,drag:document.querySelector('#nav').classList.contains('dragging')});if(sampling)requestAnimationFrame(frame)}requestAnimationFrame(frame)});
await touch('touchStart',pos.x,pos.y);await p.waitForTimeout(510);
const samples=await p.evaluate(()=>samples);
const drag=samples.filter(s=>s.drag),base=samples.find(s=>!s.drag).w;
check('长按能够进入拖动',drag.length>5);
check('长按至少三个不同尺寸的过渡帧',new Set(drag.map(s=>s.w.toFixed(1))).size>=3);
check('长按首帧不直接跳到最终放大尺寸',drag[0].w<base*1.07);
check('长按最终尺寸明显放大',drag.at(-1).w>base*1.09);
const before=await p.evaluate(()=>{const el=document.querySelector('.nav-pill');return getComputedStyle(el).transform});
await p.evaluate(()=>{fixture.stateRevision++;fixture.fetch='working';fixture.fetchStep='campus';DF.onState(structuredClone(fixture))});
check('状态推送不抢占长按滑块',before===await p.evaluate(()=>getComputedStyle(document.querySelector('.nav-pill')).transform));
const target=await center('stats');await touch('touchMove',target.x,target.y);await p.waitForTimeout(50);await touch('touchEnd');await p.waitForTimeout(50);
check('松手切换到指尖目标',await p.locator('#nav [aria-current=page]').getAttribute('data-page')==='stats');
check('松手有尺寸回落中间帧',await p.locator('.nav-pill').evaluate(e=>e.getAnimations().some(a=>a.playState==='running')));
await p.waitForTimeout(450);check('松手最终回到正常高度',await p.locator('.nav-pill').evaluate(e=>Math.abs(e.getBoundingClientRect().height-(document.querySelector('#nav').clientHeight-12))<1));
// Touch jitter, cancellation and repeated same-page holds.
for(const jitter of [0,10,14]){const t=await center('stats');await touch('touchStart',t.x,t.y);if(jitter)await touch('touchMove',t.x+1,t.y+jitter);await p.waitForTimeout(330);check('纵向抖动'+jitter+'px仍能长按',await p.locator('#nav').evaluate(e=>e.classList.contains('dragging')));await touch('touchCancel');await p.waitForTimeout(410);check('取消'+jitter+'px长按后正确清理',await p.locator('#nav').evaluate(e=>!e.classList.contains('dragging')&&!e.querySelector('.lens')));}
// A regular touch remains a normal click target after gesture capture is added.
const me=await center('me');await touch('touchStart',me.x,me.y);await p.waitForTimeout(50);await touch('touchEnd');await p.waitForTimeout(420);check('普通短按仍可切换页面',await p.locator('#nav [aria-current=page]').getAttribute('data-page')==='me');
await p.evaluate(()=>{sampling=false});check('无脚本异常',errors.length===0);fs.writeFileSync(path.join(out,'touch-results.json'),JSON.stringify({results,samples,errors},null,2));console.log(results.length+' real-touch assertions passed');
}finally{if(browser)await browser.close();server.close();}})().catch(e=>{console.error(e);process.exitCode=1});
