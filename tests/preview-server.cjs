// 预览用：把 app/assets 当静态网站开在 http://localhost:8765/ （没有 Native 时界面自动用演示数据）。
// 加 ?empty 看空状态，加 ?thanks 看第 100 次打开的感谢弹窗。
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..', 'app', 'assets');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.join(root, name);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' }).end(data);
  });
}).listen(+process.env.PORT || 8765, '127.0.0.1', function () { console.log('preview on http://localhost:' + this.address().port + '/'); });
