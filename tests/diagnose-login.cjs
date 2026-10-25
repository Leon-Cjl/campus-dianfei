// 只输出保存标志、流程状态和表单结构，不输出账号密码或 sessionStorage 值。
const http = 'http://127.0.0.1:9333';
async function evaluate(page, expression) {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.close(); reject(new Error('debug timeout')); }, 8000);
    ws.onopen = () => ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,returnByValue:true}}));
    ws.onmessage = event => { const data = JSON.parse(event.data); if (data.id === 1) {
      clearTimeout(timer); ws.close();
      if (data.result.exceptionDetails) reject(new Error('page evaluation failed'));
      else resolve(data.result.result.value);
    }};
    ws.onerror = reject;
  });
}
async function getPages() {
  return new Promise((resolve, reject) => {
    require('node:http').get(http + '/json', {timeout:5000}, response => {
      let text = ''; response.on('data', chunk => text += chunk); response.on('end', () => resolve(JSON.parse(text)));
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('forward timeout')); });
  });
}
if (require.main === module) (async () => {
  const pages = await getPages();
  for (const page of pages) {
    if (/dianfei\.local/.test(page.url)) {
      if (process.argv[2] === 'refresh') await evaluate(page, "document.getElementById('refreshBtn').click(); true");
      console.log('local', await evaluate(page, `(() => {
      const s = JSON.parse(Native.getState());
      return JSON.stringify({version:s.version,fetch:s.fetch,login:{saved:s.login.saved,auto:s.login.auto,unavailable:!!s.login.unavailable},records:s.hist.length,roomSaved:!!s.room});
    })()`)); }
    else if (/qlgydx\.mp\.sinojy\.cn/.test(page.url)) console.log('school', await evaluate(page, `JSON.stringify({path:location.pathname,ready:document.readyState,driver:!!window.__DF_DRIVER__,trace:(window.__DF_TRACE||[]).slice(-12),inputs:[...document.querySelectorAll('input')].map(e=>({id:e.id,type:e.type,visible:!!e.getClientRects().length,filled:!!e.value})),buttons:[...document.querySelectorAll('button')].map(e=>({text:e.textContent,disabled:e.disabled})),hasSession:!!sessionStorage.getItem('loginData'),popup:[...document.querySelectorAll('.za-alert__body,.za-toast__text,.ant-message-notice-content')].map(e=>e.textContent)})`));
    else console.log('page', new URL(page.url).pathname);
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { evaluate, getPages };
