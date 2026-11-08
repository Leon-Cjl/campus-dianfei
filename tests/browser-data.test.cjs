// Offline real-Chromium acceptance. Native is a synthetic fixture, never a school account.
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'D:/AI/_tools/mcp/rea/node_modules/playwright-core');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'qa', '1.8.1');
const D = 864e5, H = 36e5;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
    if (!/^[a-z.-]+$/.test(name)) return res.writeHead(404).end();
    const f = path.join(root, 'app', 'assets', name);
    fs.readFile(f, (e, b) => { if (e) return res.writeHead(404).end(); res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html'); res.end(b); });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const checks = [], errors = [];
  const check = (name, ok) => { assert.ok(ok, name); checks.push(name); };
  async function scene(hist, extra = {}) {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true });
    const state = { hist, room: '20#340', campus: '测试校区', meter: 'fixture-meter', version: '1.8.1-test', lastFetch: hist.at(-1)?.[0] || 0, notifyAllowed: true, login: {}, fetch: 'idle', storage: { legacyCount: 0, archiveCount: 1 }, prefs: { disclaimer: '2', motion: 'off', thanks: '{"never":true}', notifyAsked: '1' }, ...extra };
    await context.addInitScript(s => {
      window.fixture = s;
      const calls = window.nativeCalls = [];
      window.Native = { getState: () => JSON.stringify(s), setPref: (k, v) => { s.prefs[k] = v; }, setBars() {}, haptic() {}, refresh() {}, schedule() {}, openAppSettings() {}, requestNotify() {}, claimLegacy() { calls.push('claim'); },
        exportCsvAsync() { calls.push('csv'); return true; }, exportBackup() { calls.push('backup'); return true; },
        saveImageAsync() { calls.push('save-image'); return true; }, shareImageAsync() { calls.push('share-image'); return true; }
      };
    }, state);
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    return { context, page };
  }
  try {
    let now = Date.now();
    let { context, page } = await scene([[now - 47 * H, 15], [now - 23 * H, 12]]);
    check('23小时12元不会同时宣称已低于10元', !(await page.locator('#content').innerText()).includes('已低于提醒线'));
    await page.screenshot({ path: path.join(out, 'browser-recent.png'), fullPage: true });
    await context.close();
    ({ context, page } = await scene([[now - D, -12.5]]));
    check('负余额如实显示', (await page.locator('#bigNum').textContent()).includes('-12.50'));
    check('无速度不显示充足', !(await page.locator('.page-head').innerText()).includes('电量充足'));
    await context.close();
    const many = Array.from({length:130}, (_,i) => [now - (130-i)*H, 150 - i*.1]);
    ({ context, page } = await scene(many, { storage: { legacyCount: 6, archiveCount: 2 } }));
    await page.locator('[data-page=stats]').click();
    const before = await page.locator('#historyRecords .rec').count();
    await page.locator('[data-act=history-more]').click();
    check('历史可以加载80条之后的记录', before === 80 && (await page.locator('#historyRecords .rec').count()) === 130);
    await page.locator('[data-page=me]').click();
    check('旧记录等待明确认领', await page.locator('[data-act=claim-legacy]').isVisible());
    check('开关有选中语义', (await page.locator('[role=switch][aria-checked]').count()) > 0);
    await page.locator('[data-act=export]').click();
    await page.locator('[data-act=export]').evaluate(e => e.click());
    check('CSV进行中重复点击只调用一次', await page.evaluate(() => nativeCalls.filter(x=>x==='csv').length) === 1);
    await page.evaluate(() => DF.onOperation('csv', true, 'CSV测试完成'));
    await page.locator('[data-act=backup]').click();
    check('JSON备份走异步接口', await page.evaluate(() => nativeCalls.includes('backup')));
    await page.evaluate(() => DF.onOperation('backup', true, '备份测试完成'));
    await page.screenshot({ path: path.join(out, 'browser-settings.png'), fullPage: true });
    await page.locator('[data-act=claim-legacy]').click();
    check('认领前需要确认', await page.locator('#sheet').evaluate(e => e.open));
    check('打开确认不会自动认领', !await page.evaluate(() => nativeCalls.includes('claim')));
    await context.close();
    check('没有页面脚本异常', errors.length === 0);
    fs.writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log(`${checks.length} browser data-boundary assertions passed`);
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
