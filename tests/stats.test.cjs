// 1.8.1: regression expectations calculated independently, not merely Java/JS agreement.
// 用法：node --test tests/stats.test.cjs（run-tests.ps1 会跑）
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'assets', 'app.js'), 'utf8');
const core = src.match(/\/\/ <stats-core>[\s\S]*?\/\/ <\/stats-core>/)[0];
const { rateDetail, estimate, overlap } = new Function('DAY', 'HOUR', core + '\nreturn { rateDetail, estimate, overlap };')(864e5, 36e5);
const D = 864e5, H = 36e5, now = 1_792_650_000_000;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' ≠ ' + b);

test('近两周有足够读数：按近两周算', () => {
  const r = rateDetail([[now - 3 * D, 30], [now - D, 26]], now, []);
  near(r.v, 2); assert.strictEqual(r.all, false); assert.strictEqual(r.away, false);
});

test('只有老读数：改用全部记录，并标出来', () => {
  const r = rateDetail([[now - 30 * D, 80], [now - 25 * D, 72]], now, []);
  near(r.v, 1.6); assert.strictEqual(r.all, true);
});

test('混合假期段无法区分耗费：不把10元除以4天', () => {
  const r = rateDetail([[now - 10 * D, 50], [now - D, 40]], now, [[now - 8 * D, now - 3 * D]]);
  assert.strictEqual(r.v, null); assert.strictEqual(r.away, true);
});

test('读数不够：算不出', () => {
  assert.strictEqual(rateDetail([[now - H, 50]], now, []).v, null);
});
test('四位小数的有效下降不会被旧的0.0005阈值吞掉', () => {
  near(rateDetail([[now-D,1.0001],[now,1]],now,[]).v,0.0001);
});

test('每天一元，八天假期：剩余明确在校日仍为一元/天', () => {
  const h = Array.from({length:11}, (_,i)=>[now-(10-i)*D, 20-i]);
  const r = rateDetail(h, now, [[now-9*D, now-D]]);
  near(r.v, 1); near(r.span, 2*D); assert.strictEqual(r.away, true);
});

test('假期并集不重复扣除乱序/嵌套区间', () => {
  near(overlap([[3*D,7*D],[D,5*D],[2*D,3*D]], 0,10*D), 6*D);
});

test('23小时12元不触发按估算9.125元的低余额告警', () => {
  const r=estimate([[now-47*H,15],[now-23*H,12]],now,[]);
  near(r.perDay,3); near(r.est,12); assert.strictEqual(r.stale,false);
});
test('超过一天分开估算，并保留负值，不把欠费变成零', () => {
  const r=estimate([[now-5*D,8],[now-3*D,4]],now,[]);
  near(r.cur,4); near(r.est,-2); assert.strictEqual(r.stale,true);
});
test('没有速率时不伪造可用天数，实测欠费原样保留', () => {
  const r=estimate([[now-2*D,-12.5]],now,[]);
  near(r.cur,-12.5); near(r.est,-12.5); assert.strictEqual(r.daysLeft,null);
});
