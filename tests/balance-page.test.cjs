// Real browser runs the production driver against synthetic data in the current school DOM.
const {chromium}=require('playwright-core');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=process.env.QA_OUTPUT||path.join(root,'qa/1.9.3');
const driver=fs.readFileSync(process.env.DRIVER_FILE||path.join(root,'app/assets/driver.js'),'utf8');
const fixture=fs.readFileSync(path.join(__dirname,'fixtures/recharge-page.html'),'utf8');
const checks=[],errors=[];
function check(name,value){assert.ok(value,name);checks.push(name);}
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<html><body>'+fixture+'</body></html>')});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 async function scene(html=fixture,options={}){
  const context=await browser.newContext(),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(o=>{
   window.__results=[];window.__states=[];window.__payClicks=0;
   window.DF={state(t,s){__states.push({t,s})},result(t,j){__results.push({t,data:JSON.parse(j)})}};
   window.__DF_RUN__=o.run||'1:1';window.__DF_CAMPUS__=o.campus||'';window.__DF_ROOM__=o.room||'';
   sessionStorage.setItem('loginData','{}');
   document.addEventListener('click',e=>{if(e.target.id==='pay')__payClicks++},true);
  },options);
  await page.goto(origin+'/SL321110');
  await page.evaluate(h=>{document.body.innerHTML=h},html);
  const inject=()=>page.evaluate(s=>{window.__DF_EXPECTED_URL__=location.href;(0,eval)(s)},driver);
  return {context,page,inject};
 }
 try{
  let s=await scene();await s.inject();
  let rows=await s.page.evaluate(()=>__results);
  check('当前模板可提取余额和完整归属',rows.length===1);
  check('四位小数及负号原样交给原生校验',rows[0].data.balance==='−12.5001 元');
  check('表具状态不会覆盖电表编号',rows[0].data.meter==='QA-METER-ONLY'&&rows[0].data.status==='正常');
  check('从校区机构标题与充值编号读取首次档案',rows[0].data.campus==='合成验收校区（电费）'&&rows[0].data.room==='99#909');
  await s.page.waitForTimeout(800);
  check('同一结果仅回传一次且不触碰支付',await s.page.evaluate(()=>__results.length===1&&__payClicks===0));await s.context.close();

  s=await scene(fixture.replace('表具编号','表具通讯地址').replace('QA-METER-ONLY','DEMO-METER-001').replace('−12.5001','55.636137'));
  await s.inject();
  check('学校真实字段“表具通讯地址”和六位余额可读取',await s.page.evaluate(()=>__results[0]?.data.meter==='DEMO-METER-001'&&__results[0]?.data.balance==='55.636137 元'));
  await s.context.close();

  s=await scene(fixture.replace('−12.5001','0').replace('剩余量（元）','余额：'));
  await s.inject();check('零余额及明确余额标签可读取',await s.page.evaluate(()=>__results[0]?.data.balance==='0 元'));await s.context.close();

  const noMeter=fixture.replace(/<div class="ant-row"><div class="name-title">表具编号<\/div>.*?<\/div><\/div>/,'');
  s=await scene(noMeter);await s.inject();
  check('缺电表编号不发送不完整档案',await s.page.evaluate(()=>__results.length===0&&__states.some(e=>e.s==='balance-incomplete')&&__DF_READ_STATUS__.missing.join(',')==='meter'));
  await s.page.evaluate(()=>document.querySelector('.recharge-page').insertAdjacentHTML('beforeend','<div class="ant-row"><div class="name-title">电表编号：</div><div class="name-value">LATE-METER</div></div>'));
  await s.page.waitForFunction(()=>__results.length===1);
  check('异步补齐电表编号后继续完成查询',await s.page.evaluate(()=>__results[0].data.meter==='LATE-METER'));await s.context.close();

  s=await scene(fixture.replace('剩余量（元）','剩余量（kWh）'));
  await s.inject();check('不把电量或充值输入框当成人民币余额',await s.page.evaluate(()=>__results.length===0&&!__DF_READ_STATUS__.balanceFound));await s.context.close();

  const hidden='<div class="recharge-page" style="display:none"><div class="ant-row"><div class="name-title">余额</div><div class="name-value">777</div></div></div>';
  s=await scene(hidden+fixture);await s.inject();check('不读取隐藏的旧余额模板',await s.page.evaluate(()=>__results[0]?.data.balance==='−12.5001 元'));await s.context.close();

  const generic=fixture.replace('合成验收校区（电费）','电费');
  s=await scene(generic);await s.inject();check('充值机构泛称不能冒充校区',await s.page.evaluate(()=>__results.length===0&&__DF_READ_STATUS__.missing.includes('campus')));await s.context.close();

  s=await scene('<button id="campus"><span>首次选择合成校区</span></button>');
  await s.page.evaluate(()=>history.replaceState(null,'','/SL320000'));await s.inject();
  await s.page.locator('#campus').click();
  await s.page.evaluate(()=>{history.pushState(null,'','/SL321100');document.body.innerHTML='<input class="recharge-num-page-list-title-input"><button id="next">下一步</button>'});
  await s.page.locator('input').fill('98#808');
  check('首次点击校区及输入宿舍即时保留',await s.page.evaluate(()=>{const c=JSON.parse(sessionStorage.getItem('df.query-context.v1'));return c.campus==='首次选择合成校区'&&c.room==='98#808'}));
  await s.page.goto(origin+'/SL321110');
  await s.page.evaluate(h=>{document.body.innerHTML=h.replace('<span>99#909</span>','<span>98#808</span>')},generic);
  await s.inject();
  check('新文档沿用本次选择，不要求余额页重复校区',await s.page.evaluate(()=>__results[0]?.data.campus==='首次选择合成校区'&&__results[0]?.data.room==='98#808'));await s.context.close();

  s=await scene(generic);
  await s.page.evaluate(()=>sessionStorage.setItem('df.query-context.v1',JSON.stringify({query:'old-query',campus:'过期校区',room:'1#1'})));
  await s.inject();check('另一查询的临时归属不会被套用',await s.page.evaluate(()=>__results.length===0&&__DF_READ_STATUS__.missing.includes('campus')));await s.context.close();
  check('浏览器无脚本异常',errors.length===0);
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'balance-page-results.json'),JSON.stringify({checks,errors,synthetic:true,schoolAccountUsed:false},null,2));
  console.log(checks.length+' balance-page assertions passed');
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
