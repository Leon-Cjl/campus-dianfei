// 调试用：冷启动一次，查到余额后读取学校页面的驱动步骤记录（__DF_TRACE）和各接口耗时，
// 用来找查询慢在哪。需 WEB_DEBUG=true 的版本；只读路径和耗时，不读账号、密码和接口返回内容。
// 用法：node profile-query.cjs [--warm]   --warm：不结束进程，直接点刷新（测有效会话复用）
// 诊断包（build.ps1 -WebDebug）包名是 com.qlu.dianfei.debug，和正式版并存，测它不影响正式版
const { execFileSync } = require('node:child_process');
const ADB = 'C:\\Users\\cui\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const PORT = 9333;
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8', timeout: 15000 });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const warm = process.argv.includes('--warm');
const PKG = 'com.qlu.dianfei.debug';

async function evaluate(page, expression) {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  return new Promise((res, rej) => {
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id === 1) { ws.close(); res(d.result && d.result.result && d.result.result.value); } };
    ws.onerror = rej;
  });
}
const pages = async () => (await fetch('http://127.0.0.1:' + PORT + '/json')).json();

const PROBE = `(() => {
  const t0 = performance.timeOrigin;
  const res = performance.getEntriesByType('resource')
    .filter(e => /xmlhttprequest|fetch/.test(e.initiatorType))
    .map(e => { const u = new URL(e.name); return [Math.round(e.startTime), Math.round(e.duration), u.pathname.split('/').slice(-2).join('/')]; });
  return JSON.stringify({ origin: Math.round(t0), path: location.pathname, trace: window.__DF_TRACE || [], api: res });
})()`;

(async () => {
  if (!warm) adb('shell', 'am', 'force-stop', PKG);
  const start = Date.now();
  adb('shell', 'am', 'start', '-n', PKG + '/com.qlu.dianfei.MainActivity');
  let pid = '';
  for (let i = 0; i < 40 && !pid; i++) { try { pid = adb('shell', 'pidof', PKG).trim(); } catch (e) {} if (!pid) await sleep(100); }
  adb('forward', 'tcp:' + PORT, 'localabstract:webview_devtools_remote_' + pid);
  let ui;
  for (let i = 0; i < 50 && !ui; i++) { try { ui = (await pages()).find(p => /dianfei\.local/.test(p.url)); } catch (e) {} if (!ui) await sleep(200); }
  if (warm) await evaluate(ui, `document.querySelector('[data-act=refresh]').click()`);
  let st = '';
  for (let i = 0; i < 120; i++) {
    st = JSON.parse(await evaluate(ui, `JSON.stringify((s=>({fetch:s.fetch,ms:s.queryMs,sub:s.login.submitted}))(JSON.parse(Native.getState())))`));
    if (['ok', 'error', 'timeout', 'login'].includes(st.fetch) && i > 2) break;
    await sleep(500);
  }
  console.log('结果', st.fetch, '查询', st.ms, 'ms；自启动起', Date.now() - start, 'ms；密码提交', st.sub, '次');
  const school = (await pages()).find(p => /qlgydx/.test(p.url));
  if (!school) return;
  const d = JSON.parse(await evaluate(school, PROBE));
  console.log('当前页', d.path);
  console.log('驱动记录（时间戳为 ms%100000）：\n  ' + d.trace.join('\n  '));
  console.log('接口（开始ms 耗时ms 路径）：');
  d.api.forEach(a => console.log('  ' + a.join('  ')));
  adb('forward', '--remove', 'tcp:' + PORT);
})().catch(e => { console.error('FAIL', e.message); process.exitCode = 1; });
