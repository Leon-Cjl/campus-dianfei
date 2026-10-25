// 调试用：通过 adb 连到手机上「校园电费」里的 WebView（需 WEB_DEBUG=true 的版本），
// 读学校页面当前在哪一步、驱动脚本的步骤记录（window.__DF_TRACE）和关键元素是否存在。只读，不点任何东西。
// 用法：node inspect-webview.cjs [轮询秒数]
const { execFileSync } = require('child_process');
const ADB = 'C:\\Users\\cui\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const PORT = 9333;
const secs = Number(process.argv[2] || 0);
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8' });

const PROBE = `(() => {
  const leaf = t => [...document.querySelectorAll('*')].find(e => e.children.length === 0 && (e.textContent || '').trim() === t);
  return JSON.stringify({
    path: location.pathname,
    title: document.title,
    trace: (window.__DF_TRACE || []).slice(-15),
    roomVar: window.__DF_ROOM__, campusVar: window.__DF_CAMPUS__,
    campusLeaf: window.__DF_CAMPUS__ ? !!leaf(window.__DF_CAMPUS__) : null,
    input: (() => { const i = document.querySelector('input[type=text]'); return i ? { cls: i.className, filled: !!i.value, value: /SL321100/.test(location.pathname) ? i.value : undefined } : null; })(),
    buttons: [...document.querySelectorAll('button')].map(b => b.className + ' | ' + (b.textContent || '').trim()).slice(0, 5),
    popup: !!document.querySelector('.za-alert__button'),
    // 只列键名，不读值：用来判断学校网站把登录状态放在哪
    storage: { session: Object.keys(sessionStorage), local: Object.keys(localStorage), cookies: document.cookie.split(';').map(s => s.split('=')[0].trim()).filter(Boolean) },
    text: (document.body.innerText || '').slice(0, 160)
  });
})()`;

async function once() {
  const pid = adb('shell', 'pidof', 'com.qlu.dianfei').trim();
  if (!pid) return console.log('应用没在运行');
  adb('forward', 'tcp:' + PORT, 'localabstract:webview_devtools_remote_' + pid);
  const list = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
  const page = list.find(p => /qlgydx|sinojy/.test(p.url));
  if (!page) return console.log('学校页面没开着；当前页面：', list.map(p => p.url).join(' , '));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  const out = await new Promise((res, rej) => {
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: PROBE, returnByValue: true } }));
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id === 1) { ws.close(); res(d.result && d.result.result && d.result.result.value); } };
    ws.onerror = rej;
  });
  console.log(new Date().toLocaleTimeString(), JSON.stringify(JSON.parse(out), null, 1));
}

(async () => {
  if (!secs) return once();
  const end = Date.now() + secs * 1000;
  while (Date.now() < end) { try { await once(); } catch (e) { console.log('读取失败：', e.message); } await new Promise(r => setTimeout(r, 2000)); }
})();
