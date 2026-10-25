// 对拍：assets/app.js 里的 rate() 与 Core.java 的 rate() 在同一批数据上结果一致。
// 用法：node rate.test.cjs <app.js> <cases.txt> <java输出文件>
const fs = require('fs');
const [appJs, casesFile, javaOut] = process.argv.slice(2);
const src = fs.readFileSync(appJs, 'utf8');
const m = src.match(/const RATE_WINDOW[\s\S]*?\n  function rate\(h, now\) \{[\s\S]*?\n  \}\n/);
if (!m) { console.error('没在 app.js 里找到 rate()'); process.exit(2); }
const rate = new Function('DAY', 'HOUR', m[0] + '\nreturn rate;')(864e5, 36e5);

const blocks = fs.readFileSync(casesFile, 'utf8').split(/\r?\n\s*\r?\n/).map(b => b.trim()).filter(Boolean);
const java = fs.readFileSync(javaOut, 'utf8').trim().split(/\r?\n/);
let bad = 0;
blocks.forEach((b, i) => {
  const lines = b.split(/\r?\n/);
  const now = Number(lines[0]);
  const h = lines.slice(1).map(l => l.trim().split(' ').map(Number));
  const js = rate(h, now);
  const jv = java[i] === 'null' ? null : Number(java[i]);
  const ok = (js === null && jv === null) || (js !== null && jv !== null && Math.abs(js - jv) < 1e-6);
  if (!ok) { bad++; console.log('不一致 #' + i, 'js=', js, 'java=', jv); }
});
console.log(blocks.length + ' 组数据，' + (blocks.length - bad) + ' 组一致' + (bad ? '，' + bad + ' 组不一致' : ''));
process.exit(bad ? 1 : 0);
