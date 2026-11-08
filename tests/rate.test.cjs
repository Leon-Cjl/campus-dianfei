// 对拍：assets/app.js 里的 rate() / spike() 与 Core.java 的同名函数在同一批数据上结果一致。
// 用法：node rate.test.cjs <app.js> <cases.txt> <java输出文件>
const fs = require('fs');
const [appJs, casesFile, javaOut] = process.argv.slice(2);
const src = fs.readFileSync(appJs, 'utf8');
const m = src.match(/\/\/ <stats-core>[\s\S]*?\/\/ <\/stats-core>/);
if (!m) { console.error('没在 app.js 里找到 <stats-core> 段'); process.exit(2); }
const { rate, spike } = new Function('DAY', 'HOUR', m[0] + '\nreturn { rate, spike };')(864e5, 36e5);

const blocks = fs.readFileSync(casesFile, 'utf8').split(/\r?\n\s*\r?\n/).map(b => b.trim()).filter(Boolean);
const java = fs.readFileSync(javaOut, 'utf8').trim().split(/\r?\n/);
const close = (a, b) => (a === null && b === null) || (a !== null && b !== null && Math.abs(a - b) < 1e-6);
let bad = 0, spikes = 0, withAway = 0;
blocks.forEach((b, i) => {
  const lines = b.split(/\r?\n/).map(l => l.trim());
  const now = Number(lines[0]);
  let aw = [], k = 1;
  if (lines[1] && lines[1].startsWith('away')) {
    const p = lines[1].split(' ').slice(1).map(Number);
    for (let j = 0; j + 1 < p.length; j += 2) aw.push([p[j], p[j + 1]]);
    k = 2; withAway++;
  }
  const h = lines.slice(k).map(l => l.split(' ').map(Number));
  const r = rate(h, now, aw), s = spike(h, aw);
  const [jr, js] = (java[i] || '').split(' ');
  const jv = jr === 'null' ? null : Number(jr);
  const jsp = js === 'null' ? null : js.split('/').map(Number);
  const okS = (s === null && jsp === null) || (s !== null && jsp !== null && Math.abs(s.use - jsp[0]) < 1e-6 && Math.abs(s.ratio - jsp[1]) < 1e-6 && s.t === jsp[2]);
  if (s) spikes++;
  if (!close(r, jv) || !okS) { bad++; console.log('不一致 #' + i, 'js=', r, s, 'java=', java[i]); }
});
console.log(blocks.length + ' 组数据（含假期 ' + withAway + ' 组、用电异常 ' + spikes + ' 组），' + (blocks.length - bad) + ' 组一致' + (bad ? '，' + bad + ' 组不一致' : ''));
process.exit(bad ? 1 : 0);
