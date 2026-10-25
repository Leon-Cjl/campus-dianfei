// 仅在本应用的 WebView 内模拟短暂断网；不修改手机 Wi-Fi/移动数据，不读取账号密码。
const assert = require('node:assert/strict');
const {evaluate,getPages}=require('./diagnose-login.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function target(kind){const pages=await getPages();const page=pages.find(p=>kind==='ui'?/dianfei\.local/.test(p.url):/qlgydx\.mp\.sinojy\.cn/.test(p.url));if(!page)throw new Error('Missing '+kind+' WebView');return page;}
async function state(){return JSON.parse(await evaluate(await target('ui'),`(() => {const s=JSON.parse(Native.getState());return JSON.stringify({fetch:s.fetch,step:s.fetchStep,lastFetch:s.lastFetch,ms:s.queryMs,submitted:s.login.submitted,saved:s.login.saved,auto:s.login.auto,attention:s.login.attention,retries:s.queryRetries});})()`));}
async function refresh(){await evaluate(await target('ui'),'Native.refresh(); true');}
async function query(label,action,check){
  const before=await state();const begun=Date.now();await action();
  for(let n=0;n<180;n++){
    const s=await state();
    assert.ok(s.saved&&s.auto&&!s.attention,'Saved credentials unavailable');
    if(s.fetch==='ok'&&s.lastFetch>before.lastFetch){if(check)check(s);console.log('PASS:',label,JSON.stringify({ms:s.ms,submissions:s.submitted,retries:s.retries}));return s;}
    if(['login','timeout','error'].includes(s.fetch))throw new Error(label+' ended in '+s.fetch+' after '+(Date.now()-begun)+' ms');
    await sleep(500);
  }
  throw new Error(label+' timed out');
}
async function connection(page){
  const ws=new WebSocket(page.webSocketDebuggerUrl);let id=0;const pending=new Map();
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=event=>{const r=JSON.parse(event.data);if(pending.has(r.id)){const p=pending.get(r.id);clearTimeout(p.timer);pending.delete(r.id);r.error?p.reject(new Error(r.error.message)):p.resolve(r.result);}};
  return {send(method,params={}){return new Promise((resolve,reject)=>{const key=++id;const timer=setTimeout(()=>{pending.delete(key);reject(new Error('CDP timeout'));},10000);pending.set(key,{resolve,reject,timer});ws.send(JSON.stringify({id:key,method,params}));});},close(){ws.close();}};
}
(async()=>{
  await query('warm refresh reuses the existing session',refresh,s=>assert.equal(s.submitted,0));
  const oldPage=await target('school');const oldToken=await evaluate(oldPage,'window.__DF_RUN__');
  await query('old-page callbacks cannot force manual login',async()=>{await refresh();await evaluate(oldPage,'window.DF.state('+JSON.stringify(oldToken)+',"login"); true');},s=>assert.equal(s.submitted,0));
  await query('expired session automatically logs in again',async()=>{await evaluate(await target('school'),"sessionStorage.removeItem('loginData'); true");await refresh();},s=>assert.ok(s.submitted>=1));
  const net=await connection(await target('school'));
  const conditions=offline=>({offline,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  try{
    await net.send('Network.enable');
    await net.send('Network.emulateNetworkConditions',conditions(true));
    await query('temporary network failure automatically recovers',async()=>{await refresh();await sleep(650);await net.send('Network.emulateNetworkConditions',conditions(false));},s=>assert.ok(s.retries>=1));
  }finally{
    try{await net.send('Network.emulateNetworkConditions',conditions(false));}finally{net.close();}
  }
})().catch(error=>{console.error('FAIL:',error.message);process.exitCode=1;});
