// Real Chromium + synthetic Native adapter. Does not connect to school or inspect device data.
const {chromium}=require('playwright-core');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT||path.join(root,'qa','1.9.1');
const checks=[],errors=[];
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name)};
(async()=>{
 const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!/^[a-z.-]+$/.test(name))return res.writeHead(404).end();
  fs.readFile(path.join(root,'app/assets',name),(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(b)});
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 async function scene(extra={}){
  const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
  const now=Date.now(),hour=36e5;
  const state={hist:Array.from({length:130},(_,i)=>[now-(130-i)*hour,150-i*.1]),room:'合成验收宿舍',campus:'离线校区',lastFetch:now-hour,storage:{activeKey:'fixture-A',legacyCount:0,archiveCount:1},version:'1.9.1-test',login:{saved:true,auto:true,account:'测试账号',submitted:0},notifyAllowed:true,fetch:'idle',queryId:0,dataReady:true,stateRevision:1,prefs:{disclaimer:'2',motion:'off',notifyAsked:'1',thanks:'{"never":true}',badgesInit:'1',opens:JSON.stringify({n:50,first:now-20*864e5})},...extra};
  await context.addInitScript(s=>{
   window.fixture=s;window.calls=[];
   window.Native={getState:()=>JSON.stringify(s),setPref(k,v){s.prefs[k]=v;calls.push(['pref',k,v]);},setBars(){},haptic(k){calls.push(['haptic',k])},refresh(){calls.push(['refresh'])},showSchool(){calls.push(['school'])},cancel(){calls.push(['cancel'])},schedule(){},requestNotify(){},openAppSettings(){}};
  },state);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  return {context,page};
 }
 const send=(page,patch)=>page.evaluate(p=>{Object.assign(fixture,p);fixture.stateRevision++;DF.onState(structuredClone(fixture));},patch);
 try{
  let {context,page}=await scene();
  await send(page,{});
  await page.locator('[data-page=stats]').click();
  await page.evaluate(()=>{window.chartBefore=document.querySelector('#chart');window.contentChanges=0;window.mutations=new MutationObserver(rows=>{contentChanges+=rows.filter(r=>r.target.id==='content').length});mutations.observe(document.querySelector('#content'),{childList:true});});
  await page.evaluate(()=>{
   for(let i=0;i<200;i++){
    fixture.stateRevision++;fixture.fetch='working';fixture.queryId=1;fixture.fetchStep=i%2?'balance':'campus';fixture.queryMs=i;fixture.queryRetries=i%2;fixture.login.submitted=i;
    DF.onState(structuredClone(fixture));
   }
  });
  check('200次进度变化保留同一图表节点',await page.evaluate(()=>chartBefore===document.querySelector('#chart')));
  check('200次进度没有重建统计页',await page.evaluate(()=>contentChanges===0));
  check('查询时刷新按钮禁用且有忙碌语义',await page.locator('#refreshBtn').evaluate(e=>e.disabled&&e.getAttribute('aria-busy')==='true'));
  await send(page,{fetch:'offline'});
  check('断网仍可查看历史图表',await page.evaluate(()=>chartBefore===document.querySelector('#chart')));
  await send(page,{fetch:'ok'});await send(page,{fetch:'ok'});
  check('恢复成功后刷新按钮可用',await page.locator('#refreshBtn').isEnabled());
  await send(page,{fetch:'error',fetchReason:'timeout'});await send(page,{fetch:'error'});
  check('重复终态不重复触发失败反馈',await page.evaluate(()=>calls.filter(c=>c[0]==='haptic'&&c[1]==='reject').length===1));
  const before=await page.locator('#historyRecords .rec').count();
  await page.locator('[data-act=history-more]').click();
  check('加载更多后130条记录可见',before===80&&(await page.locator('#historyRecords .rec').count())===130);
  await page.evaluate(()=>{window.scrollTo(0,500);window.scrollBefore=scrollY;});
  await send(page,{lastFetch:Date.now()});
  check('新快照保留已展开的记录数量',(await page.locator('#historyRecords .rec').count())===130);
  check('新快照保留滚动位置',await page.evaluate(()=>Math.abs(scrollY-scrollBefore)<2));
  await page.evaluate(()=>{const old=structuredClone(fixture);old.stateRevision=0;old.hist=[[Date.now(),999]];DF.onState(old);});
  await page.locator('[data-page=home]').click();
  check('过期快照不能覆盖当前余额',(await page.locator('#bigNum').textContent())==='137.10');
  await page.screenshot({path:path.join(out,'home.png'),fullPage:true});
  await send(page,{fetch:'working',fetchStep:'balance',queryId:2});
  check('首页显示具体查询进度',(await page.locator('#fetchLine').innerText()).includes('余额'));
  await page.locator('[data-act=school]').click();
  check('连接过程中能打开学校页面',await page.evaluate(()=>calls.some(c=>c[0]==='school')));
  await page.locator('[data-act=cancel-query]').click();
  check('连接过程中能取消查询',await page.evaluate(()=>calls.some(c=>c[0]==='cancel')));
  await send(page,{fetch:'ok',hist:[[Date.now()-864e5,20],[Date.now(),19]],lastFetch:Date.now()});
  check('成功状态和新余额一起呈现',(await page.locator('#bigNum').textContent())==='19.00');
  await page.locator('[data-page=me]').click();
  await page.locator('[data-act=thr-custom]').click();
  await page.locator('#sheet input').fill('27');
  await send(page,{lastFetch:Date.now()+1});
  check('快照变化不清空正在填写的弹窗',(await page.locator('#sheet input').inputValue())==='27');
  await page.locator('[data-sheet=cancel]').click();
  await send(page,{storage:{activeKey:'fixture-B',legacyCount:0,archiveCount:2},room:'另一测试宿舍',hist:[[Date.now(),8]]});
  await page.locator('[data-page=stats]').click();
  check('切换宿舍不混入上一宿舍记录',(await page.locator('#historyRecords .rec').count())===1);
  await context.close();
  ({context,page}=await scene({hist:[],prefs:{},storage:{},dataReady:false,fetch:'idle'}));
  await page.waitForTimeout(150);
  check('本机读取完成前不覆盖设置',await page.evaluate(()=>calls.filter(c=>c[0]==='pref').length===0));
  check('本机加载和无记录状态有区分',(await page.locator('#content').innerText()).includes('正在读取本机记录'));
  await send(page,{hist:[[Date.now(),12]],storage:{activeKey:'cold'},dataReady:true,prefs:{disclaimer:'2',motion:'off',notifyAsked:'1',thanks:'{"never":true}',badgesInit:'1',opens:JSON.stringify({n:50,first:Date.now()-20*864e5})}});
  check('首个快照保留旧设置并只加一次打开计数',await page.evaluate(()=>JSON.parse(fixture.prefs.opens).n===51));
  await send(page,{});
  check('重复快照不重复增加打开计数',await page.evaluate(()=>JSON.parse(fixture.prefs.opens).n===51));
  await context.close();
  context=await browser.newContext({viewport:{width:393,height:852}});
  await context.addInitScript(()=>{localStorage.setItem('df_disclaimer','2');localStorage.setItem('df_motion','off');});
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  await page.locator('#refreshBtn').click();
  check('无Native预览也显示刷新忙碌状态',await page.locator('#refreshBtn').isDisabled());
  await page.waitForFunction(()=>!document.querySelector('#refreshBtn').disabled);
  check('无Native预览刷新成功提示正常',(await page.locator('#toast').innerText()).includes('已更新'));
  await context.close();
  check('浏览器没有脚本异常',errors.length===0);
  fs.writeFileSync(path.join(out,'state-ui-results.json'),JSON.stringify({checks,errors},null,2));
  console.log(checks.length+' state/UI assertions passed');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
