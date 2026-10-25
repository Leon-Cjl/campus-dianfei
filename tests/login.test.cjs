'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app/assets/login.js'), 'utf8');
const driver = fs.readFileSync(path.join(__dirname, '../app/assets/driver.js'), 'utf8');

function page(options = {}) {
  let now = 100000, next = 1, form = [], handlers = new Set(), clicks = new Set();
  const tasks = new Map(), events = [], inputs = [];
  class Input {
    constructor(id, type, placeholder = '') { Object.assign(this, { id, type, placeholder, name:'', raw:'', events:[], isConnected:true }); }
    get value() { return this.raw; }
    set value(v) { this.raw = v; }
    getClientRects() { return this.hidden ? [] : [{}]; }
    dispatchEvent(e) { e.target = this; this.events.push(e.type); for (const handler of handlers) handler(e); }
  }
  function newForm() { form.forEach(e => e.isConnected = false); form = [new Input('userName','text'),new Input('pwd','password')]; }
  newForm();
  const button = {textContent:'登 录',disabled:!!options.disabled,isConnected:true,clicks:0,
    getClientRects(){return [{}];},getAttribute(){return null;},click(){this.clicks++;if(options.success)location.pathname='/SL300000';}};
  const pay = {textContent:'立即支付',getClientRects(){return [{}];},click(){throw new Error('Payment clicked');}};
  const location = Object.assign({protocol:'https:',hostname:'qlgydx.mp.sinojy.cn',host:'qlgydx.mp.sinojy.cn',port:'',pathname:'/SL200000',href:'https://qlgydx.mp.sinojy.cn/SL200000'},options.location);
  const credentials = {username:'TEST_ACCOUNT',password:'p\'"\\\n<&/__DF_CREDENTIALS__',token:'QUERY:PAGE'};
  const errorElements = [];
  const ready = () => now - 100000 >= (options.formDelay || 0);
  const document = {
    getElementById(id){return ready() ? form.find(e=>e.id===id) : null;},
    querySelectorAll(selector){
      if(selector==='input')return ready() ? form.concat(inputs) : inputs;
      if(selector==='button')return ready() ? [pay,button] : [];
      if(selector.startsWith('.za-alert'))return errorElements;
      return [];
    },querySelector(){return null;},
    addEventListener(type,handler){if(type==='input')handlers.add(handler);else if(type==='click')clicks.add(handler);},
    removeEventListener(type,handler){if(type==='input')handlers.delete(handler);else clicks.delete(handler);}
  };
  const schedule = (fn,ms,interval=0) => {const id=next++;tasks.set(id,{fn,due:now+ms,interval});return id;};
  const context = {document,location,HTMLInputElement:Input,Event:class{constructor(type){this.type=type;this.isTrusted=false;}},
    Date:class extends Date{static now(){return now;}},
    setTimeout:(fn,ms)=>schedule(fn,ms),clearTimeout:id=>tasks.delete(id),
    setInterval:(fn,ms)=>schedule(fn,ms,ms),clearInterval:id=>tasks.delete(id),
    sessionStorage:{getItem(){return options.session ? '{}' : null;}},
    DF:{login:(token,state)=>events.push({token,state}),state:(token,state)=>events.push({token,state}),result:()=>assert.fail('Unexpected balance result')}};
  context.window=context;
  vm.createContext(context);
  const run = (token=credentials.token) => vm.runInContext(source.replace('__DF_CREDENTIALS__',JSON.stringify({...credentials,token})),context);
  function advance(ms){
    const target=now+ms;
    for(let n=0;n<2000;n++){
      const entry=[...tasks.entries()].filter(([,v])=>v.due<=target).sort((a,b)=>a[1].due-b[1].due)[0];
      if(!entry){now=target;return;}
      const [id,task]=entry;now=task.due;tasks.delete(id);if(task.interval)tasks.set(id,{...task,due:now+task.interval});task.fn();
    }
    throw new Error('Unbounded scheduling');
  }
  return {run,advance,context,events,button,location,credentials,tasks,newForm,
    get user(){return form[0];},get pass(){return form[1];},state:()=>context.__DF_LOGIN__?.state,
    captcha(){inputs.push(new Input('captcha','text','验证码'));},
    error(text){errorElements.push({textContent:text,getClientRects(){return [{}];}});},
    edit(){form[1].value='MANUAL_EDIT';for(const handler of [...handlers])handler({target:form[1],isTrusted:true});},
    matchingAutofill(){for(const handler of [...handlers])handler({target:form[1],isTrusted:true});},
    manualClick(){for(const handler of [...clicks])handler({target:{closest:()=>button},isTrusted:true});},
    runDriver(token){context.__DF_RUN__=token;return vm.runInContext(driver,context);}};
}

test('fills React inputs, settles, submits exactly once and releases credentials',()=>{
  const p=page();assert.equal(p.run(),'active');assert.equal(p.pass.value,p.credentials.password);
  assert.deepEqual(p.pass.events,['input','change']);assert.equal(p.button.clicks,0);p.advance(200);assert.equal(p.button.clicks,1);
  p.advance(1000);assert.equal(p.button.clicks,1);assert.equal(p.state(),'submitted');
  assert.ok(!JSON.stringify(p.context.__DF_LOGIN__).includes(p.credentials.password));
});
test('waits for a login form arriving 10 seconds late',()=>{const p=page({formDelay:10000});p.run();p.advance(9800);assert.equal(p.button.clicks,0);p.advance(600);assert.equal(p.button.clicks,1);});
test('missing form stops after 15 seconds',()=>{const p=page({formDelay:30000});p.run();p.advance(20000);assert.equal(p.state(),'form-timeout');assert.equal(p.tasks.size,0);});
test('waits for disabled button to become enabled',()=>{const p=page({disabled:true});p.run();p.advance(5000);assert.equal(p.button.clicks,0);p.button.disabled=false;p.advance(200);assert.equal(p.button.clicks,1);});
test('rerendered input elements are refilled before submitting',()=>{const p=page();p.run();p.advance(100);p.newForm();p.advance(100);assert.equal(p.button.clicks,0);p.advance(200);assert.equal(p.button.clicks,1);assert.equal(p.pass.value,p.credentials.password);});
test('duplicate injection cannot submit twice',()=>{const p=page();p.run();p.run();p.advance(1000);assert.equal(p.button.clicks,1);});
test('a new query cancels the old controller',()=>{const p=page();p.run();p.run('QUERY2:PAGE');p.advance(1000);assert.equal(p.button.clicks,1);assert.equal(p.events.find(e=>e.state==='submitted').token,'QUERY2:PAGE');});
test('manual editing pauses automation without overwriting input',()=>{const p=page();p.run();p.edit();p.advance(1000);assert.equal(p.button.clicks,0);assert.equal(p.pass.value,'MANUAL_EDIT');assert.equal(p.state(),'cancelled');});
test('matching system autofill does not interrupt automation',()=>{const p=page();p.run();p.matchingAutofill();p.advance(200);assert.equal(p.button.clicks,1);});
test('manual login click cancels a pending automatic click',()=>{const p=page();p.run();p.manualClick();p.advance(200);assert.equal(p.button.clicks,0);assert.equal(p.state(),'cancelled');});
test('native cancellation prevents delayed submission',()=>{const p=page();p.run();p.context.__DF_LOGIN__.cancel();p.advance(1000);assert.equal(p.button.clicks,0);assert.equal(p.tasks.size,0);});
test('visible captcha never submits',()=>{const p=page();p.captcha();p.run();p.advance(1000);assert.equal(p.state(),'challenge');assert.equal(p.pass.value,'');assert.equal(p.button.clicks,0);});
test('captcha appearing after submission is handed off without retry',()=>{const p=page();p.run();p.advance(200);p.captcha();p.advance(200);assert.equal(p.state(),'challenge');assert.equal(p.button.clicks,1);});
test('rejected password stops automatic attempts',()=>{const p=page();p.run();p.advance(200);p.error('账号或密码错误');p.advance(1000);assert.equal(p.state(),'rejected');assert.equal(p.button.clicks,1);assert.equal(p.tasks.size,0);});
test('network failure is classified separately from password rejection',()=>{const p=page();p.run();p.advance(200);p.error('网络连接异常，请稍后重试');p.advance(200);assert.equal(p.state(),'network');});
test('slow successful response is allowed for 20 seconds',()=>{const p=page();p.run();p.advance(20000);assert.equal(p.state(),'submitted');p.location.pathname='/SL300000';p.advance(200);assert.equal(p.state(),'success');});
test('no response times out without resubmission',()=>{const p=page();p.run();p.advance(26000);assert.equal(p.state(),'timeout');assert.equal(p.button.clicks,1);assert.equal(p.tasks.size,0);});
for(const location of [{protocol:'http:'},{hostname:'evil.example'},{hostname:'qlgydx.mp.sinojy.cn.evil.example'},{port:'8443'},{pathname:'/SL321110'},{pathname:'/other/SL200000'}])
  test('untrusted page is never filled '+JSON.stringify(location),()=>{const p=page({location});assert.equal(p.run(),'untrusted');assert.equal(p.pass.value,'');assert.equal(p.tasks.size,0);});
test('navigation cancels a pending submit',()=>{const p=page();p.run();p.location.hostname='evil.example';p.advance(200);assert.equal(p.button.clicks,0);assert.equal(p.state(),'cancelled');});
test('driver requests relogin for an expired session without home-page throttling',()=>{const p=page({location:{pathname:'/SL320000'}});p.runDriver('Q1');assert.equal(p.events[0].state,'need-login');p.runDriver('Q2');p.advance(600);assert.ok(p.events.some(e=>e.token==='Q2'&&e.state==='need-login'));});
test('driver reuses a session and tags callbacks with the current query',()=>{const p=page({session:true,location:{pathname:'/SL320000'}});p.runDriver('Q1');assert.deepEqual(p.events.map(e=>e.state),['authenticated','pick']);p.runDriver('Q2');const count=p.events.length;p.advance(600);assert.ok(p.events.slice(count).every(e=>e.token==='Q2'));});
test('stopping driver removes its polling task',()=>{const p=page();p.runDriver('Q');p.context.__DF_STOP_DRIVER__();const count=p.events.length;p.advance(5000);assert.equal(p.events.length,count);assert.equal(p.tasks.size,0);});
