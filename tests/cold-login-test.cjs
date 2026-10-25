// 真机完整进程重启测试。仅读取状态布尔值和查询结果；不读取凭据值。
const { execFileSync } = require('node:child_process');
const { evaluate, getPages } = require('./diagnose-login.cjs');
const ADB = 'C:\\Users\\cui\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const adb = (...args) => execFileSync(ADB, args, {encoding:'utf8', timeout:12000});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  for (let cycle = 1; cycle <= Number(process.argv[2] || 2); cycle++) {
    adb('shell','am','force-stop','com.qlu.dianfei');
    adb('shell','am','start','-n','com.qlu.dianfei/.MainActivity');
    const pid = adb('shell','pidof','com.qlu.dianfei').trim();
    adb('forward','tcp:9333','localabstract:webview_devtools_remote_' + pid);
    let passed = false, last = '';
    for (let n = 0; n < 95; n++) {
      try {
        const ui = (await getPages()).find(page => /dianfei\.local/.test(page.url));
        if (ui) {
          const state = JSON.parse(await evaluate(ui, `(() => {
            const s=JSON.parse(Native.getState());return JSON.stringify({fetch:s.fetch,saved:s.login.saved,auto:s.login.auto,unavailable:!!s.login.unavailable,submitted:s.login.submitted,queryMs:s.queryMs});
          })()`));
          if (state.fetch !== last) { console.log('cycle',cycle,'state',JSON.stringify(state)); last = state.fetch; }
          if (state.fetch === 'ok') {
            if (!state.saved || !state.auto || state.unavailable) throw new Error('Saved login state not available');
            console.log('PASS: cold launch',cycle,'automatic query complete;',state.queryMs,'ms;',state.submitted,'password submissions.');
            passed = true;
            break;
          }
          if (['error','timeout'].includes(state.fetch)) throw new Error('query ended with ' + state.fetch);
        }
      } catch (error) {
        if (/query ended|without exercising/.test(error.message)) throw error;
      }
      await sleep(1000);
    }
    if (!passed) throw new Error('Cold launch ' + cycle + ' did not complete');
  }
})().catch(error => { console.error('FAIL:',error.message); process.exitCode = 1; });
