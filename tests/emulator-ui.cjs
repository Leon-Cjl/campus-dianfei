// Android WebView acceptance with synthetic UI state. No school/account values are read.
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'D:/AI/_tools/mcp/rea/node_modules/playwright-core');
const {execFileSync} = require('node:child_process');
const path = require('node:path'), fs = require('node:fs'), assert = require('node:assert/strict');
const adbPath = 'C:/Users/cui/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const adb = (...args) => execFileSync(adbPath, ['-s','emulator-5554',...args], {encoding:'utf8',timeout:10000});
const pause = ms=>new Promise(r=>setTimeout(r,ms));
const output = path.resolve(__dirname,'../qa/1.8.1');
(async()=>{
  let browser;
  const checks=[];
  const check=(name,ok)=>{assert.ok(ok,name);checks.push(name)};
  try {
    adb('shell','am','start','-n','com.qlu.dianfei.debug/com.qlu.dianfei.MainActivity');
    await pause(2000);
    const pid=adb('shell','pidof','com.qlu.dianfei.debug').trim();
    adb('forward','tcp:9337','localabstract:webview_devtools_remote_'+pid);
    browser=await chromium.connectOverCDP('http://127.0.0.1:9337');
    const page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().startsWith('https://dianfei.local/'));
    if(!page)throw Error('local UI target unavailable');
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.evaluate(()=>Native.cancel()); await pause(500);
    await page.evaluate(()=>{
      const n=Date.now(),D=864e5;
      DF.onState({hist:[[n-3*D,15],[n-D,13],[n-1000,12]],room:'合成验收宿舍',campus:'离线测试校区',meter:'QA-METER',lastFetch:n-1000,
        version:'1.8.1 合成数据验收',fetch:'idle',storage:{legacyCount:6,archiveCount:2,activeKey:'fixture'},prefs:{disclaimer:'2',motion:'off',notifyAsked:'1',donateHidden:'1'}});
      if(document.getElementById('sheet').open)DF.back();
    });
    await pause(700);
    check('实测余额可见',await page.locator('#bigNum').textContent()==='12.00');
    check('首页显示旧记录待确认',await page.locator('[data-act=claim-legacy]').isVisible());
    const shot=name=>fs.writeFileSync(path.join(output,name),execFileSync(adbPath,['-s','emulator-5554','exec-out','screencap','-p']));
    shot('emulator-home.png');
    await page.locator('[data-page=me]').click();
    check('合并设置卡可见',(await page.locator('#content').innerText()).includes('提醒与每日查询'));
    await page.locator('[data-act=backup]').scrollIntoViewIfNeeded();
    const resultPromise=page.evaluate(()=>new Promise(resolve=>{
      const original=DF.onOperation;
      DF.onOperation=(kind,ok,msg)=>{original(kind,ok,msg);if(kind==='backup')resolve({ok,msg});};
      setTimeout(()=>resolve({ok:false,msg:'callback timeout'}),6000);
    }));
    await page.locator('[data-act=backup]').click();
    const backup=await resultPromise;
    check('真实异步JSON导出回调成功',backup.ok);
    shot('emulator-data.png');
    await page.locator('[data-act=claim-legacy]').click();
    check('长确认面板位于屏内',await page.locator('#sheet').evaluate(e=>{const r=e.getBoundingClientRect();return e.open&&r.top>=0&&r.bottom<=innerHeight;}));
    await page.locator('[data-sheet=cancel]').click(); await pause(100);
    await page.locator('[data-page=home]').click();
    await page.locator('[data-act=share]').click();
    check('分享卡片生成',await page.locator('.share-preview').evaluate(e=>e.complete&&e.naturalWidth===1080));
    shot('emulator-share.png');
    check('本地WebView无脚本异常',errors.length===0);
    fs.writeFileSync(path.join(output,'emulator-ui-results.json'),JSON.stringify({checks,errors,backup},null,2));
    console.log(`${checks.length} emulator WebView assertions passed`);
  } finally {
    if(browser)await browser.close();
    try{adb('forward','--remove','tcp:9337')}catch{}
  }
})().catch(e=>{console.error(e);process.exitCode=1});
