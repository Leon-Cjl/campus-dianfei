/* 校园电费 · 界面逻辑。
   数据来自原生壳（window.Native）：余额读数历史 + 宿舍信息 + 设置。所有统计都在本机计算，
   不发任何网络请求。没有 Native 时（浏览器里预览）用一份固定的演示数据。 */
'use strict';
(function () {
  const H = typeof window.Native !== 'undefined' ? window.Native : null;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const DAY = 864e5, HOUR = 36e5;

  const ACCENTS = [['blue', '#3482FF', '澎湃蓝'], ['teal', '#00A1B5', '青碧'], ['green', '#18A957', '翠绿'], ['purple', '#7B5CF5', '星紫'], ['orange', '#FF7A1A', '活力橙'], ['pink', '#EE4C86', '樱粉'], ['red', '#E5484D', '朱红'], ['graphite', '#5B6573', '石墨']];
  const BADGES = [
    { id: 'first', icon: '⚡', name: '初次见面', desc: '第一次查到宿舍电费' },
    { id: 'days3', icon: '📅', name: '三日之约', desc: '攒下 3 个不同日子的读数' },
    { id: 'days7', icon: '🗓️', name: '一周不落', desc: '攒下 7 个不同日子的读数' },
    { id: 'days30', icon: '🏅', name: '月度常客', desc: '攒下 30 个不同日子的读数' },
    { id: 'thrifty', icon: '🌱', name: '精打细算', desc: '记录满 3 天，日均用电低于 ¥1' },
    { id: 'prepared', icon: '☂️', name: '未雨绸缪', desc: '余额还没低于提醒线就充了值' },
    { id: 'rich', icon: '💰', name: '余粮充足', desc: '余额达到 ¥100 以上' },
    { id: 'night', icon: '🌙', name: '夜猫子', desc: '凌晨 0–5 点查过一次电费' },
    { id: 'recharge3', icon: '🔋', name: '充电达人', desc: '记录到 3 次充值' },
    // 隐藏成就：拿到之前不显示，在「打开 100 次的感谢」时解锁
    { id: 'oldfriend', icon: '🤝', name: '老朋友', desc: '打开校园电费满 100 次', hidden: true }
  ];
  const I = {
    bolt: '<svg class="bolt" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.4 2.2 4.9 13.6h6.1l-1.3 8.2 8.6-11.6h-6.2l1.3-8Z"/></svg>',
    boltLine: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 2.8 5.6 13.2h5.6l-1.1 8 7.7-10.6h-5.7l1.1-7.8Z"/></svg>',
    chevR: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6"/></svg>',
    chevL: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6"/></svg>',
    warn: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.8 2.8 19.5h18.4L12 3.8Z"/><path d="M12 10v4.2M12 16.9v.2"/></svg>',
    chart: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5h16"/><path d="M5.5 15.5 10 10.5l3.2 3 5.3-6.5"/></svg>',
    home: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20H4z"/><path d="M9.5 20v-5.5h5V20"/></svg>',
    share: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14.5V4"/><path d="m7.8 8 4.2-4.2L16.2 8"/><path d="M5 12.5v7h14v-7"/></svg>'
  };

  let S = { hist: [], prefs: {} };
  let A = null;              // 本次渲染用的统计结果
  let page = 'home';
  let fetchSt = 'idle';
  let userRefresh = false;
  let shown = null;          // 首页大数字当前显示的值（用于滚动动画）
  let shownLv = null;        // 电池液面当前高度
  let range = '30';
  let historyLimit = 80;
  let cal = null;
  let quoteIdx = null, quoteTapped = false;

  // ---------------- 工具 ----------------
  const pad = n => String(n).padStart(2, '0');
  const f2 = v => (Math.round(v * 100) / 100).toFixed(2);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dayKey = t => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const monthKey = t => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
  const md = t => { const d = new Date(t); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; };
  const hm = t => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const mdhm = t => md(t) + ' ' + hm(t);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nextMidnight = t => { const d = new Date(t); d.setHours(24, 0, 0, 0); return d.getTime(); };
  function rel(t) {
    if (!t) return '还没更新过';
    const d = Date.now() - t;
    if (d < 60e3) return '刚刚更新';
    if (d < HOUR) return Math.floor(d / 60e3) + ' 分钟前更新';
    if (dayKey(t) === dayKey(Date.now())) return '今天 ' + hm(t) + ' 更新';
    return mdhm(t) + ' 更新';
  }
  const fmtDays = d => d <= 0 ? '已用完' : d >= 365 ? '一年以上' : d < 1 ? '不到 1 天' : Math.floor(d) + ' 天';
  function hexRgb(h) { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
  function mix(a, b, t) { const x = hexRgb(a), y = hexRgb(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
  function luminance(hex) { return hexRgb(hex).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0); }
  // 对实际 primary（包括深色主题混白后的颜色）选择对比度较高的一端，至少 4.5:1。
  const onPrimary = hex => luminance(hex) > Math.sqrt(.0525) - .05 ? '#000000' : '#ffffff';
  function maint() { const d = new Date(); return d.getHours() === 23 && d.getMinutes() >= 45; }

  // ---------------- 设置 ----------------
  const P = () => S.prefs || (S.prefs = {});
  function setPref(k, v) {
    if (H && S.dataReady === false) return; // Do not overwrite saved settings before first hydration.
    v = String(v); P()[k] = v;
    if (H) { try { H.setPref(k, v); } catch (e) {} } else { try { localStorage.setItem('df_' + k, v); } catch (e) {} }
  }
  const thr = () => { const v = parseFloat(P().thr); return isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : 10; };
  const theme = () => P().theme || 'system';
  const accent = () => P().accent || 'blue';
  const motionOn = () => P().motion !== 'off' && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const autoOn = () => P().auto !== '0';
  const autoTime = () => P().autoTime || '12:00';
  const notifyOn = () => P().notify !== '0';
  // 每日查询能不能在后台真查（和原生端 BgQuery.eligible 的条件一致，前台、假期另算）
  const bgReady = () => !!(S.login && S.login.auto && !S.login.attention && S.room);
  const alertDays = () => P().alertDays == null ? '3' : P().alertDays;
  const wxName = () => (P().wxName || '').trim();
  // 假期（离校）区间：[[离校, 返校], …] 毫秒，按时间排好；原生端的每日提醒和后台查询也读这一项
  function aways() {
    try {
      const a = JSON.parse(P().away || '[]');
      return Array.isArray(a) ? a.filter(x => Array.isArray(x) && isFinite(x[0]) && isFinite(x[1]) && x[1] > x[0]).sort((x, y) => x[0] - y[0]) : [];
    } catch (e) { return []; }
  }
  // 正在进行或还没开始的那一段（同时只有一段）
  const awayCur = () => aways().find(x => x[1] > Date.now()) || null;
  // 只留和记录有关的：记录本身只存 120 天
  function saveAways(list) {
    const keep = list.filter(x => x[1] > Date.now() - 125 * DAY).sort((x, y) => x[0] - y[0]);
    setPref('away', JSON.stringify(keep.map(x => [Math.round(x[0]), Math.round(x[1])])));
  }
  const toggle = (act, on, title, sub) => '<button role="switch" aria-checked="' + !!on + '" class="switch-row' + (on ? ' on' : '') + '" data-act="' + act + '"><span><b>' + title + '</b><span class="small muted">' + sub + '</span></span><i class="tgl" aria-hidden="true"></i></button>';
  function badges() { try { return JSON.parse(P().badges || '{}') || {}; } catch (e) { return {}; } }
  function haptic(k) { if (H) { try { H.haptic(k || 'tap'); } catch (e) {} } }

  function applyTheme() {
    const sysDark = H ? !!S.sysDark : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    const dark = theme() === 'dark' || (theme() === 'system' && sysDark);
    const root = document.documentElement, st = root.style;
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.motion = motionOn() ? 'on' : 'off';
    const ac = (ACCENTS.find(a => a[0] === accent()) || ACCENTS[0])[1];
    const bg = dark ? '#000000' : '#f7f7f7', base = dark ? '#1a1a1a' : '#ffffff';
    const pr = dark ? mix(ac, '#ffffff', .14) : ac;
    st.setProperty('--primary', pr);
    st.setProperty('--on-primary', onPrimary(pr));
    st.setProperty('--primary-soft', dark ? mix(ac, '#000000', .74) : mix(ac, '#ffffff', .88));
    st.setProperty('--on-primary-soft', dark ? mix(ac, '#ffffff', .5) : mix(ac, '#000000', .18));
    [.8, .58, .32, .06].forEach((t, i) => st.setProperty('--heat' + (i + 1), mix(pr, base, t)));
    if (H) { try { H.setBars(bg, dark); } catch (e) {} }
  }

  // ---------------- 统计 ----------------
  function spread(daily, t0, t1, d) {
    const tot = t1 - t0;
    if (tot <= 0) { daily[dayKey(t1)] = (daily[dayKey(t1)] || 0) + d; return; }
    let s = t0;
    while (s < t1) { const e = Math.min(t1, nextMidnight(s)); const k = dayKey(s); daily[k] = (daily[k] || 0) + d * (e - s) / tot; s = e; }
  }

  // <stats-core>：日均用电和用电异常，与 Core.java 的 rate() / spike() 保持一致（tests/rate.test.cjs 按这对注释截取后对拍）
  const RATE_WINDOW = 14 * DAY, RATE_MIN_SPAN = 12 * HOUR, SPIKE_MIN = 20 * HOUR, SPIKE_MAX = 84 * HOUR, SPIKE_BASE = 7 * DAY;
  // [a, b] 与假期并集的重叠时长；不重复扣除重叠、嵌套或乱序的假期。
  function overlap(aw, a, b) {
    let total = 0, end = a;
    const parts = (aw || []).filter(x => x && Number.isFinite(x[0]) && Number.isFinite(x[1]) && x[1] > x[0]).slice().sort((x, y) => x[0] - y[0]);
    for (const x of parts) { const lo = Math.max(a, end, x[0]), hi = Math.min(b, x[1]); if (hi > lo) { total += hi - lo; end = hi; } }
    return total;
  }
  // 日均用电：按实际经过的时间算。每次余额下降，这次的用电量算在「上次余额变化（或第一条读数）到这次」整段时间上，
  // 余额不变的时段也计入（学校余额可能攒一段才扣）。充值的区间不计入，从充值后重新起算；最后一次变化之后还没变的时段不计入。
  // 与假期重叠的扣费段整体排除：无法区分离校耗费和在校耗费，不把全部金额除以仅在校时长。
  // 优先用最近 14 天里结束的段；累计时长不足 12 小时就退回用全部记录，仍不足则算不出。
  // away = 有混合/离校段被排除；span 是真正参与该速度的时长。
  function rateDetail(h, now, aw) {
    aw = aw || [];
    let drop = 0, span = 0, dropAll = 0, spanAll = 0, from = 0, cut = 0, cutAll = 0;
    const start = now - RATE_WINDOW - overlap(aw, now - RATE_WINDOW, now);
    for (let i = 1; i < h.length; i++) {
      const d = h[i - 1][1] - h[i][1];
      if (d >= -0.00005 && d <= 0.00005) continue;
      if (d > 0) {
        const o = overlap(aw, h[from][0], h[i][0]), dt = h[i][0] - h[from][0];
        if (o > 0) { cutAll += o; if (h[i][0] >= start) cut += o; }
        else if (dt > 0) { dropAll += d; spanAll += dt; if (h[i][0] >= start) { drop += d; span += dt; } }
      }
      from = i;
    }
    if (span >= RATE_MIN_SPAN) return { v: drop / (span / DAY), all: false, away: cut > 0, span };
    if (spanAll >= RATE_MIN_SPAN) return { v: dropAll / (spanAll / DAY), all: true, away: cutAll > 0, span: spanAll };
    return { v: null, all: false, away: cutAll > 0, span: spanAll };
  }
  function rate(h, now, aw) { return rateDetail(h, now, aw).v; }
  function estimate(h, now, aw) {
    const cur = h.length ? h[h.length - 1][1] : null, last = h.length ? h[h.length - 1][0] : now;
    const perDay = rate(h, now, aw), since = Math.max(0, now - last) / DAY, stale = since >= 1;
    const used = Math.max(0, now - last - overlap(aw, last, now)) / DAY;
    const est = stale && cur != null && perDay != null ? cur - perDay * used : cur;
    const daysLeft = perDay != null && perDay > 0 && est != null ? est / perDay : null;
    return { cur, perDay, since, stale, est, daysLeft };
  }
  // 用电异常：最后一次余额下降往前凑够至少 20 小时（不跨充值），这段的用电速度和这段之前的日均比；
  // 达到平时 2 倍以上、且多用 ¥2 以上才算。跨度超过 3.5 天说明查得太稀，看不出是哪天用多的，不算；这段之前不满 7 天记录时「平时」还不准，也不算。
  function spike(h, aw) {
    aw = aw || [];
    const same = k => Math.abs(h[k][1] - h[k - 1][1]) <= 0.00005;
    let i = h.length - 1;
    while (i > 0 && same(i)) i--;
    if (i <= 0 || h[i][1] > h[i - 1][1]) return null;
    let s = i;
    while (s > 0) {
      let p = s - 1;
      while (p > 0 && same(p)) p--;
      if (s !== i && h[s][1] > h[s - 1][1]) break; // s 是充值点：从充值后算起
      s = p;
      if (h[i][0] - h[s][0] >= SPIKE_MIN) break;
    }
    if (overlap(aw, h[s][0], h[i][0]) > 0) return null;
    const dt = h[i][0] - h[s][0];
    if (h[i][0] - h[s][0] < SPIKE_MIN || dt < SPIKE_MIN || dt > SPIKE_MAX || h[s][0] - h[0][0] < SPIKE_BASE) return null;
    const baseline = rateDetail(h.slice(0, s + 1), h[s][0], aw), base = baseline.v;
    if (base == null || base <= 0.05 || baseline.span < SPIKE_BASE) return null;
    const use = h[s][1] - h[i][1], days = dt / DAY, ratio = use / days / base;
    if (ratio < 2 || use - base * days < 2) return null;
    return { use, days, ratio, t: h[i][0] };
  }
  // </stats-core>

  // 日历保留完整扣费段并按时间线性分配，离校耗费不转嫁到在校日。
  function spreadAway(daily, t0, t1, d, aw) {
    spread(daily, t0, t1, d);
  }

  function analyze() {
    const h = (S.hist || []).filter(x => Array.isArray(x) && isFinite(x[0]) && isFinite(x[1])).slice().sort((a, b) => a[0] - b[0]);
    const aw = aways();
    // 日历保留每段全部耗费，按完整时间线性分摊；速度只使用无假期重叠的整段。
    const n = h.length, daily = {}, rateDaily = {}, rateTime = {}, rech = [];
    let from = 0;
    for (let i = 1; i < n; i++) {
      const [, b0] = h[i - 1], [t1, b1] = h[i], d = b0 - b1;
      if (d > 0.00005) {
        spreadAway(daily, h[from][0], t1, d, aw);
        if (t1 > h[from][0] && overlap(aw, h[from][0], t1) === 0) {
          spread(rateDaily, h[from][0], t1, d);
          spread(rateTime, h[from][0], t1, (t1 - h[from][0]) / DAY);
        }
      }
      else if (d < -0.00005) rech.push({ t: t1, i, net: -d, before: b0 });
      else continue;
      from = i;
    }
    const now = Date.now();
    const ri = rateDetail(h, now, aw), perDay = ri.v;
    // 读数只能证明余额净增，不能用今天的日均反推过去的实付充值金额。
    rech.forEach(r => { r.amt = r.net; });
    // 上次读数离现在超过一天：按日均用电估算「现在」的余额，提醒和可用天数都按估算算（与小组件、每日提醒一致）；假期里不扣
    const { cur, since, stale, est, daysLeft } = estimate(h, now, aw);
    // 「近 7 天」含今天（今天还没过完）；做周对比时两边都用整天：昨天往前 7 天 vs 再往前 7 天，否则总显得「比之前少」
    let week = 0, lastWeek = 0, prevWeek = 0;
    for (let i = 0; i < 7; i++) {
      week += daily[dayKey(now - i * DAY)] || 0;
      lastWeek += daily[dayKey(now - (i + 1) * DAY)] || 0;
      prevWeek += daily[dayKey(now - (i + 8) * DAY)] || 0;
    }
    const mk = monthKey(now);
    let month = 0, total = 0;
    for (const k in daily) { total += daily[k]; if (k.startsWith(mk)) month += daily[k]; }
    return {
      h, n, aw, daily, rateDaily, rateTime, rech, cur, perDay, ri, daysLeft, week, lastWeek, prevWeek, month, total, since, stale, est,
      spike: spike(h, aw),
      // 估算余额降到提醒线的时间（已经低于提醒线时为 0）；用完的时间是 daysLeft
      daysToThr: perDay && est != null ? Math.max(0, (est - thr()) / perDay) : null,
      today: daily[dayKey(now)] || 0,
      days: new Set(h.map(x => dayKey(x[0]))).size,
      maxB: n ? Math.max.apply(null, h.map(x => x[1])) : 0,
      tracked: n ? (now - h[0][0]) / DAY : 0
    };
  }

  function level() {
    if (A.cur == null) return 0;
    // 封顶 0.9：留一截空，液面波纹始终看得见
    if (A.daysLeft != null) return clamp(A.daysLeft / 30 * .9, 0.05, .9);
    return clamp(A.cur / Math.max(100, A.maxB) * .9, 0.05, .9);
  }
  // 红色 = 满足提醒条件（和预警卡片、通知用同一个判断）；黄色 = 离提醒还有一段但不远
  function alerting() {
    if (A.cur == null) return { low: false, soon: false };
    const days = +alertDays();
    return { low: A.est <= thr(), soon: days > 0 && A.daysLeft != null && A.daysLeft <= days };
  }
  function tone() {
    if (A.cur == null) return 'unknown';
    const a = alerting();
    if (a.low || a.soon) return 'err';
    if (A.stale || A.perDay == null) return 'unknown';
    const near = A.daysLeft != null ? A.daysLeft <= Math.max(7, 2 * +alertDays()) : A.est <= thr() * 2;
    return near ? 'warn' : 'ok';
  }
  function balanceTag() {
    if (tone() === 'err') return A.est <= 0 ? (A.stale && A.perDay != null ? '估算已用完' : '余额已用完') : '该充电费了';
    if (A.stale) return A.perDay == null ? '余额已过期' : '估算余额';
    if (A.perDay == null) return '暂无用电速度';
    return tone() === 'warn' ? '有点少了' : '电量充足';
  }
  function balanceSub() {
    if (A.stale) return '实测余额已过期，' + (A.perDay == null ? '暂无可用速度，无法估算当前余额' : '估算现在约 ¥' + f2(A.est) + (A.daysLeft <= 0 ? '，估算已用完' : '，还能用 ' + fmtDays(A.daysLeft))) + '；请刷新核实';
    if (A.cur <= 0) return '实测余额已用完，请及时充值';
    if (A.daysLeft == null) return '暂无可用速度，继续积累不含假期的扣费记录后再预测';
    return '预计还能用 ' + fmtDays(A.daysLeft) + (A.daysToThr != null && thr() > 0 && A.daysToThr >= 1 ? '，建议 ' + md(Date.now() + A.daysToThr * DAY) + '前充值' : '，请留意余额并及时充值');
  }

  // 一句话：只用真实读数和推算结果
  function lines() {
    const L = [];
    if (maint()) L.push(['🛠️', '23:45–00:00 学校系统维护，这段时间查不到是正常的', true]);
    if (A.cur == null) { L.push(['👋', '第一次用？点「查询电费」，登录一次就能记住宿舍']); return L; }
    const away = awayCur();
    if (away && away[0] <= Date.now()) L.push(['🏖️', '假期模式中，' + md(away[1]) + '返校；这段时间不提醒，也不算进日均', true]);
    else if (A.stale) L.push(['🕰️', '已经 ' + Math.floor(A.since) + ' 天没查了，下拉刷新看看准数', true]);
    const sp = A.spike;
    if (sp && Date.now() - sp.t < 2 * DAY) L.push(['⚠️', spikeText(sp), true]);
    if (A.daysLeft != null) {
      L.push(['⏳', A.daysLeft <= 0 ? (A.stale ? '按估算已用完，请刷新核实并及时充值' : '余额已用完，请及时充值') : '按最近的用电速度，还能用 ' + fmtDays(A.daysLeft)]);
      L.push(['📆', rechargeHint()]);
    } else L.push(['🌱', '暂无可用速度；需要至少半天不含假期的扣费区间才能预测']);
    // 好几天没查时，「今天用了多少」「近 7 天对比」缺最近的读数，算出来会偏小，不说
    if (!A.stale && A.today > 0.005) L.push(['🔌', '今天已经用了约 ¥' + f2(A.today)]);
    if (!A.stale && A.tracked >= 15 && A.prevWeek > 0.01) {
      const p = (A.lastWeek - A.prevWeek) / A.prevWeek * 100;
      if (Math.abs(p) >= 3) L.push([p < 0 ? '📉' : '📈', '近 7 天比之前 7 天' + (p < 0 ? '少' : '多') + '用了 ' + Math.abs(p).toFixed(0) + '%']);
    }
    if (A.rech.length) L.push(['🔋', '已记录 ' + A.rech.length + ' 次充值，最近一次' + rechText(A.rech[A.rech.length - 1])]);
    L.push(['🧾', '已经记了 ' + A.n + ' 次读数，横跨 ' + A.days + ' 天']);
    return L;
  }

  // 日均用电下面那行小字：说清是按什么算的（首页、统计页同一句）
  function rateBasis() {
    if (A.perDay == null) return A.ri.away ? '假期重叠段已排除，其他读数不足' : '有效扣费记录不足半天';
    return (A.ri.all ? '按全部有效记录' : '近两周有效记录') + (A.ri.away ? '，已排除假期重叠段' : '');
  }
  const rechText = r => '余额净增 ¥' + f2(r.net);

  // 和 Core.spikeNotice 的通知同一句话
  function spikeText(sp) {
    return (sp.days < 1.5 ? '最近一天' : '最近 ' + Math.round(sp.days) + ' 天') + '用了约 ¥' + f2(sp.use) + '，是平时的 ' + sp.ratio.toFixed(1) + ' 倍，看看空调、热水器是不是忘了关';
  }

  // 「什么时候该充」：按提醒线算，不按用到 0 算（用到 0 那天才充就停电了）
  function rechargeHint() {
    if (A.daysLeft <= 0) return A.stale ? '估算已用完，请刷新核实并及时充值' : '余额已用完，请及时充值';
    const out = md(Date.now() + A.daysLeft * DAY);
    if (A.daysToThr == null || thr() <= 0) return '大约 ' + out + '前后用完';
    if (A.daysToThr < 1) return '已接近提醒线 ¥' + thr() + '，大约 ' + out + '前后用完，尽快充值';
    return '大约 ' + md(Date.now() + A.daysToThr * DAY) + '降到提醒线 ¥' + thr() + '，' + out + '前后用完';
  }

  // ---------------- 勋章 ----------------
  function achieved() {
    const a = new Set();
    if (A.n >= 1) a.add('first');
    if (A.days >= 3) a.add('days3');
    if (A.days >= 7) a.add('days7');
    if (A.days >= 30) a.add('days30');
    if (A.perDay != null && A.tracked >= 3 && A.perDay < 1) a.add('thrifty');
    if (A.rech.some(r => r.before > thr())) a.add('prepared');
    if (A.maxB >= 100) a.add('rich');
    if (A.h.some(x => new Date(x[0]).getHours() < 5)) a.add('night');
    if (A.rech.length >= 3) a.add('recharge3');
    return a;
  }
  // 能量化的勋章给出进度：[已有, 目标, 单位]；拿不到具体进度的返回 null
  function badgeProg(id) {
    if (!A) return null;
    switch (id) {
      case 'days3': return [A.days, 3, '天'];
      case 'days7': return [A.days, 7, '天'];
      case 'days30': return [A.days, 30, '天'];
      case 'recharge3': return [A.rech.length, 3, '次'];
      case 'rich': return [Math.floor(A.maxB), 100, '元'];
      default: return null;
    }
  }
  function checkBadges() {
    const got = badges(), fresh = [];
    achieved().forEach(id => { if (!got[id]) { got[id] = Date.now(); fresh.push(id); } });
    const first = P().badgesInit !== '1';
    if (first) setPref('badgesInit', '1');
    if (!fresh.length) return;
    setPref('badges', JSON.stringify(got));
    if (first) return; // 第一次打开这一版：已达成的直接记上，不放礼花
    const b = BADGES.find(x => x.id === fresh[0]);
    confetti();
    haptic('confirm');
    toast('解锁勋章「' + b.name + '」' + (fresh.length > 1 ? '等 ' + fresh.length + ' 枚' : ''));
  }
  function confetti() {
    if (!motionOn()) return;
    const box = document.createElement('div');
    box.className = 'confetti';
    const colors = ['#3482FF', '#18A957', '#FFB020', '#EE4C86', '#7B5CF5', '#00A1B5', '#FF7A1A'];
    let html = '';
    for (let i = 0; i < 70; i++) {
      html += '<i style="--x:' + (Math.random() * 100).toFixed(1) + 'vw;--d:' + (Math.random() * .5).toFixed(2) + 's;--r:' + Math.floor(Math.random() * 720 - 360) + 'deg;--dx:' + Math.floor(Math.random() * 120 - 60) + 'px;background:' + colors[i % colors.length] + '"></i>';
    }
    box.innerHTML = html;
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3200);
  }

  // ---------------- 页面 ----------------
  const head = (title, extra) => '<div class="page-head"><h1>' + title + '</h1>' + (extra || '') + '</div>';

  function homeHTML() {
    if (A.cur == null) return head('电费') + (S.dataReady === false || fetchSt === 'working' ? skeletonHTML() : emptyHTML()) + legacyHTML();
    const t = tone(), lv = level();
    const daysTxt = A.daysLeft == null ? '暂无速度' : A.daysLeft <= 0 ? '已用完' : A.daysLeft >= 99 ? '99+ 天' : fmtDays(A.daysLeft);
    const tag = balanceTag(), sub = balanceSub();
    return head('电费', '<span class="head-actions"><span class="badge ' + t + '">' + tag + '</span><button class="icon-btn" data-act="share" aria-label="分享电费卡片">' + I.share + '</button></span>') +
      '<section class="card hero tone-' + t + '"><div class="hero-row"><div class="hero-main">' +
      '<div class="overline">实测余额' + (A.stale ? ' · 已过期 · ' + md(A.h[A.n - 1][0]) : '') + ' · 元</div>' +
      '<div class="big"><span class="yen">¥</span><span id="bigNum">' + f2(shown == null ? 0 : shown) + '</span></div>' +
      '<div class="hero-sub">' + sub + '</div></div>' +
      '<div class="battery" aria-hidden="true"><div class="cap"></div><div class="cell">' +
      '<div class="wave w1" style="--lv:' + (shownLv == null ? 0 : shownLv) + '"></div><div class="wave w2" style="--lv:' + (shownLv == null ? 0 : shownLv) + '"></div>' + I.bolt +
      '</div><div class="days">' + daysTxt + '</div></div></div>' +
      '<div class="hero-foot"><span class="fetch-line" id="fetchLine" role="status" aria-live="polite" aria-atomic="true">' + fetchLine() + '</span><button class="btn tonal sm" data-act="wechat">去充值</button></div></section>' +
      alertHTML() +
      legacyHTML() +
      alarmCardHTML() +
      monthCardHTML() +
      '<div class="tiles">' +
      tile('日均用电', A.perDay != null ? '¥' + f2(A.perDay) : '积累中', rateBasis()) +
      // 还没有任何「余额下降」的区间时，用电量是算不出来，不是 0
      (Object.keys(A.daily).length
        ? tile('近 7 天', '¥' + f2(A.week), A.stale ? '截至 ' + md(A.h[A.n - 1][0]) : A.tracked < 7 ? '记录不满 7 天' : '估算') +
          tile('本月', '¥' + f2(A.month), A.stale ? '截至 ' + md(A.h[A.n - 1][0]) : (new Date().getMonth() + 1) + ' 月累计')
        : tile('近 7 天', '—', '读数还不够') + tile('本月', '—', '读数还不够')) + '</div>' +
      quoteHTML() +
      '<div class="section-head"><h2>最近记录</h2>' + (A.n > 5 ? '<button class="btn text sm" data-go="stats">查看全部</button>' : '') + '</div>' +
      '<section class="card list">' + recordsHTML(5) + '</section>';
  }
  function alertHTML() {
    const { low, soon } = alerting();
    if (!low && !soon) return '';
    const msg = (A.stale ? A.perDay == null ? '上次实测余额已过期，' : '按估算现在约 ¥' + f2(A.est) + '，' : '') +
      (A.est <= 0 ? '余额已用完，请及时充值' : low ? '已低于提醒线 ¥' + thr() + (A.daysLeft != null ? '，大约还能用 ' + fmtDays(A.daysLeft) : '') : '按最近的用电速度，大约还能用 ' + fmtDays(A.daysLeft)) +
      (A.stale ? '。先下拉刷新看看准数' : '');
    return '<section class="card alert' + firstShow('alert:' + (low ? 'low' : 'soon')) + '">' + I.warn + '<div class="alert-body"><b>' + (low ? '余额不多了' : '电费快用完了') + '</b><div class="small">' + msg + '</div></div>' +
      '<button class="btn danger-filled sm" data-act="wechat">去充值</button></section>';
  }
  const tile = (label, val, sub) => '<div class="tile"><div class="tile-label">' + label + '</div><div class="tile-val">' + val + '</div><div class="tile-sub">' + sub + '</div></div>';

  function skeletonHTML() {
    return '<section class="card hero"><p class="muted small" id="fetchLine" role="status" aria-live="polite" aria-atomic="true">' + fetchLine() + '</p><div class="sk" style="width:90px;height:14px"></div><div class="sk" style="width:190px;height:52px;margin:12px 0"></div><div class="sk" style="width:70%;height:14px"></div></section>' +
      '<div class="tiles"><div class="tile"><div class="sk" style="height:44px"></div></div><div class="tile"><div class="sk" style="height:44px"></div></div><div class="tile"><div class="sk" style="height:44px"></div></div></div>';
  }
  function emptyHTML() {
    const msg = fetchSt === 'offline' ? '网络暂时不可用，恢复连接后会自动继续，无需重新输入账号密码。' : fetchSt === 'timeout' || fetchSt === 'error' ? failToast(fetchReason) + '。' : '登录一次学校账号、选一次宿舍，以后打开就能直接看到余额。';
    return '<section class="card empty"><div class="empty-art">' + I.boltLine + '</div><h2>还没有电费数据</h2><p>' + msg + '</p><button class="btn filled wide" data-act="refresh">查询电费</button></section>' + quoteHTML();
  }

  function fetchLine() {
    if (S.dataError) return '本机记录暂时读取失败，请重新打开应用重试';
    if (S.dataReady === false) return '正在读取本机记录…';
    switch (fetchSt) {
      case 'offline': return '等待网络恢复，连接后自动继续';
      case 'working': return esc(({
        connect: '正在连接学校平台…', form: '正在等待登录页面…', signin: '正在自动登录…', query: '已连接，正在查询余额…',
        home: '已登录，正在进入校园充值…', campus: '正在选择校区…', room: '正在打开宿舍 ' + (S.room || '') + '…', balance: '马上就好，正在读取余额…',
        retry: '连接暂时异常，正在自动重试…'
      })[S.fetchStep] || (S.fetchStep === 'saving' ? '正在同步本机记录…' : '正在查询…')) + (S.fetchStep === 'saving' ? '' : ' · <button class="link" data-act="school">打开学校页面</button> · <button class="link" data-act="cancel-query">取消</button>');
      case 'login': return '等你登录学校账号…';
      case 'pick': case 'room': return '等你选择宿舍…';
      case 'incomplete': return '已读到学校余额，正在核对宿舍和电表信息…';
      case 'timeout': case 'error': return esc(maint() ? '学校系统维护中' : failText(fetchReason) || '没查到') + '，<button class="link" data-act="refresh">重试</button>';
      default: return rel(S.lastFetch);
    }
  }

  function quoteHTML() {
    const L = lines();
    // 要紧的一句（系统维护、好几天没查）优先显示，除非用户自己点着换过
    if (quoteIdx == null || (L[0][2] && !quoteTapped)) quoteIdx = L[0][2] ? 0 : Math.floor(Date.now() / DAY) % L.length;
    const q = L[quoteIdx % L.length];
    return '<button class="card quote" data-act="quote" id="quote"><span class="q-emoji">' + q[0] + '</span><span class="q-text">' + esc(q[1]) + '</span><span class="q-more">' + I.chevR + '</span></button>';
  }

  function recordsHTML(k) {
    if (!A.n) return '<div class="empty-mini">还没有记录</div>';
    const out = [];
    for (let i = A.n - 1; i >= 0 && out.length < k; i--) {
      const t = A.h[i][0], b = A.h[i][1];
      let chip;
      if (i === 0) chip = '<span class="badge">首条</span>';
      else {
        const d = b - A.h[i - 1][1];
        const rc = d > 0.005 ? A.rech.find(r => r.t === t) : null;
        chip = d > 0.005 ? '<span class="badge ok">' + (rc ? rechText(rc) : '余额净增 ¥' + f2(d)) + '</span>' : d < -0.005 ? '<span class="delta">−' + f2(-d) + '</span>' : '<span class="delta">持平</span>';
      }
      out.push('<div class="rec"><div class="rec-time">' + md(t) + '<div class="muted small">' + hm(t) + '</div></div><div class="rec-val">¥' + f2(b) + '</div><div class="rec-chip">' + chip + '</div></div>');
    }
    return out.join('');
  }
  function historyHTML() {
    const count = Math.min(historyLimit, A.n), remaining = A.n - count;
    return '<div class="section-head"><h2>全部记录</h2><span class="muted small" role="status">已显示 ' + count + ' / ' + A.n + ' 条</span></div>' +
      '<section class="card list">' + recordsHTML(count) + '</section>' +
      (remaining > 0 ? '<button class="btn tonal wide" data-act="history-more">加载更多（剩余 ' + remaining + ' 条）</button>' : '');
  }

  // ---------------- 月度小结（学伴 0.9.4 的做法）----------------
  // 按月汇总：用电（按相邻读数分摊估算）、有记录覆盖的天数、日均、充值次数和金额；记录不满整月的标出来
  function months() {
    if (!A.n) return [];
    // 用电只能算到最后一次读数为止：覆盖天数也截到那里，否则好几天没查时「本月日均」会被摊薄
    const first = A.h[0][0], now = A.h[A.n - 1][0], out = {};
    const get = k => out[k] || (out[k] = { k, use: 0, validUse: 0, covered: 0, rechN: 0, rechAmt: 0 });
    for (const d in A.daily) get(d.slice(0, 7)).use += A.daily[d];
    for (const d in A.rateDaily) get(d.slice(0, 7)).validUse += A.rateDaily[d];
    for (const d in A.rateTime) get(d.slice(0, 7)).covered += A.rateTime[d];
    A.rech.forEach(r => { const m = get(monthKey(r.t)); m.rechN++; m.rechAmt += r.amt; });
    return Object.values(out).map(m => {
      const [y, mo] = m.k.split('-').map(Number);
      const start = new Date(y, mo - 1, 1).getTime(), end = new Date(y, mo, 1).getTime();
      const from = Math.max(start, first), to = Math.min(end, now);
      // 月度速度也仅使用完整且无假期重叠的扣费段；累计耗费仍保留离校部分。
      m.partial = from > start + DAY || to < end - DAY;
      m.perDay = m.covered >= RATE_MIN_SPAN / DAY ? m.validUse / m.covered : null;
      m.label = mo + ' 月';
      return m;
    }).sort((a, b) => b.k < a.k ? -1 : 1);
  }
  // 每月 1–7 号在首页提示上个月的小结，收起后这个月不再出现
  function monthCardHTML() {
    const now = new Date();
    if (now.getDate() > 7) return '';
    const lm = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 15).getTime());
    if (P().monthSeen === lm) return '';
    const list = months(), m = list.find(x => x.k === lm);
    if (!m || (m.use < 0.01 && !m.rechN)) return '';
    const prev = list.find(x => x.k < lm);
    let cmp = '';
    if (prev && prev.perDay > 0.01 && m.perDay != null && !m.partial && !prev.partial) {
      const p = (m.perDay - prev.perDay) / prev.perDay * 100;
      cmp = Math.abs(p) < 3 ? '，和 ' + prev.label + '差不多' : '，日均比 ' + prev.label + (p < 0 ? '少' : '多') + ' ' + Math.abs(p).toFixed(0) + '%';
    }
    return '<section class="card month-card' + firstShow('month:' + lm) + '"><div class="card-head"><h2>📅 ' + m.label + '小结</h2><button class="btn text sm" data-act="month-seen" data-v="' + lm + '">收起</button></div>' +
      '<p class="month-line">用电约 <b>¥' + f2(m.use) + '</b>，有效日均 <b>' + (m.perDay == null ? '暂无速度' : '¥' + f2(m.perDay)) + '</b>' + cmp + '。' +
      (m.rechN ? '余额净增 ' + m.rechN + ' 次，共 ¥' + f2(m.rechAmt) + '。' : '') + (m.partial ? '<span class="muted">（这个月的记录不全，仅供参考）</span>' : '') + '</p></section>';
  }

  // 统计页：最近几个月（记录只留 120 天，最多 5 个月）的用电对比，日均最高的那个月条最长
  function monthTableHTML() {
    const list = months().filter(m => m.use > 0.01 || m.rechN);
    if (!list.length) return '';
    const max = Math.max.apply(null, list.map(m => m.perDay || 0)) || 1;
    return '<div class="section-head"><h2>月度对比</h2><span class="muted small">有效扣费日均</span></div><section class="card list">' +
      list.map(m => '<div class="rec month-row"><div class="rec-time">' + m.label + (m.partial ? '<div class="muted small">记录不全</div>' : '<div class="muted small">共 ¥' + f2(m.use) + '</div>') + '</div>' +
        '<div class="month-bar"><i style="width:' + (m.perDay == null ? 0 : Math.max(4, m.perDay / max * 100)).toFixed(0) + '%"></i></div>' +
        '<div class="rec-val">' + (m.perDay == null ? '暂无速度' : '¥' + f2(m.perDay)) + '</div>' +
        '<div class="rec-chip">' + (m.rechN ? '<span class="badge ok">净增 ' + m.rechN + ' 次</span>' : '') + '</div></div>').join('') +
      '</section>';
  }

  function statsHTML() {
    const top = Object.keys(A.daily).sort((a, b) => A.daily[b] - A.daily[a])[0];
    const rechSum = A.rech.reduce((s, r) => s + r.amt, 0);
    const item = (label, val, sub) => '<div><span>' + label + '</span><b>' + val + '</b>' + (sub ? '<em>' + sub + '</em>' : '') + '</div>';
    return head('统计') +
      '<section class="card"><div class="card-head"><h2>余额走势</h2><div class="seg" id="rangeSeg" role="group" aria-label="走势时间范围">' +
      [['7', '7 天'], ['30', '30 天'], ['all', '全部']].map(r => '<button aria-pressed="' + (r[0] === range) + '" data-act="range" data-v="' + r[0] + '" class="' + (r[0] === range ? 'on' : '') + '">' + r[1] + '</button>').join('') +
      '</div></div><div class="chart" id="chart"></div>' +
      '<div class="chart-legend"><span><i style="background:var(--primary)"></i>余额</span><span><i style="background:var(--ok)"></i>充值</span><span class="muted">每天一个点，按住左右滑动看每天</span></div></section>' +
      '<section class="card"><div class="card-head"><h2>用电日历</h2><div class="cal-nav"><button class="icon-btn" data-act="cal-prev" id="calPrev" aria-label="上个月">' + I.chevL + '</button><span id="calTitle"></span><button class="icon-btn" data-act="cal-next" id="calNext" aria-label="下个月">' + I.chevR + '</button></div></div>' +
      '<div class="cal" id="cal"></div><div class="legend">少<i style="background:var(--heat0)"></i><i style="background:var(--heat1)"></i><i style="background:var(--heat2)"></i><i style="background:var(--heat3)"></i><i style="background:var(--heat4)"></i>多</div>' +
      '<p class="note">扣费按完整区间线性分摊，离校耗费保留在离校日期；与假期重叠的整段不参与日均和异常基线。点格子看当天估算。</p></section>' +
      '<section class="card"><div class="card-head" style="margin-bottom:10px"><h2>汇总</h2></div><div class="sum-grid">' +
      item('累计用电', Object.keys(A.daily).length ? '¥' + f2(A.total) : '—', Object.keys(A.daily).length ? '自 ' + md(A.h[0][0]) + ' 起' : '读数还不够') +
      item('日均用电', A.perDay != null ? '¥' + f2(A.perDay) : '—', rateBasis()) +
      item('单日最多', top ? '¥' + f2(A.daily[top]) : '—', top ? md(new Date(top.replace(/-/g, '/')).getTime()) : '') +
      item('余额净增', A.rech.length + ' 次', A.rech.length ? '净增合计 ¥' + f2(rechSum) + '，非实付金额' : '还没记录到') +
      item('读数', A.n + ' 次', '横跨 ' + A.days + ' 天') +
      item('提醒线', '¥' + thr(), '在「我的」里修改') + '</div></section>' +
      monthTableHTML() +
      '<div id="historyRecords">' + historyHTML() + '</div>';
  }

  const legacyCount = () => Math.max(0, Math.floor(Number(S.storage && S.storage.legacyCount) || 0));
  function legacyHTML() {
    const n = legacyCount();
    return n ? '<div class="legacy-notice"><p class="hint">旧版有 ' + n + ' 条未归属记录，尚未计入当前宿舍。请确认确属当前宿舍后再导入；也可先导出备份。</p>' +
      '<button class="btn tonal wide" data-act="claim-legacy">确认旧记录归属</button></div>' : '';
  }

  function meHTML() {
    const got = badges(), shownBadges = BADGES.filter(b => !b.hidden || got[b.id]), n = shownBadges.filter(b => got[b.id]).length;
    const seg = (act, cur, opts) => '<div class="seg full" role="group" aria-label="' + ({ theme: '主题', motion: '动效' }[act] || act) + '">' + opts.map(o => '<button aria-pressed="' + (o[0] === cur) + '" data-act="' + act + '" data-v="' + o[0] + '" class="' + (o[0] === cur ? 'on' : '') + '">' + o[1] + '</button>').join('') + '</div>';
    const acName = (ACCENTS.find(a => a[0] === accent()) || ACCENTS[0])[2];
    const t = thr(), preset = [5, 10, 20, 30];
    return head('我的') +
      '<section class="card"><div class="dorm-top"><div class="dorm-ic">' + I.home + '</div><div><div class="dorm-room">' + esc(S.room || '还没选宿舍') + '</div><div class="muted small">' + esc(S.campus || '第一次查询时会自动记住') + '</div></div>' + (S.status ? '<span class="badge ok">' + esc(S.status) + '</span>' : '') + '</div>' +
      (S.addr ? '<dl class="kv"><dt>用户地址</dt><dd>' + esc(S.addr) + '</dd><dt>表具号</dt><dd>' + esc(S.meter || '—') + '</dd><dt>上次更新</dt><dd>' + (S.lastFetch ? mdhm(S.lastFetch) : '—') + '</dd></dl>' : '') +
      '<button class="btn tonal wide" data-act="reset-room">' + (S.room ? '换个宿舍' : '去选择宿舍') + '</button></section>' +
      '<div class="section-head"><h2>学校账号</h2></div>' +
      '<section class="card"><div class="wx-row"><div><div class="small muted">' + (S.login && S.login.saved ? '已加密保存在本机' : '保存后可自动登录学校平台') + '</div><div class="wx-name">' + esc(S.login && S.login.account || '还没保存账号') + '</div></div><button class="btn text sm" data-act="account">' + (S.login && S.login.saved ? '管理' : '添加') + '</button></div>' +
      (S.login && S.login.attention ? '<p class="hint warn-text">学校提示账号或密码有误，请点「管理」更新。更新前会暂停自动提交。</p>' : '') +
      (S.login && S.login.unavailable ? '<p class="hint warn-text">保存的账号暂时无法读取，请重新填写。</p>' : '') +
      toggle('auto-login', !!(S.login && S.login.auto), '自动登录', S.login && S.login.attention ? '已暂停重复尝试，更新密码后恢复' : '打开应用自动登录；已有有效会话时直接查询') +
      '<p class="hint" style="margin:12px 0 0">密码由手机系统加密保护；仅向学校缴费平台提交登录。遇到验证码或密码错误时会请你手动处理。</p></section>' +
      '<div class="section-head"><h2>我的勋章</h2><span class="muted small">' + n + ' / ' + shownBadges.length + '</span></div>' +
      '<section class="card"><div class="badges">' + shownBadges.map(b => {
        const pr = got[b.id] ? null : badgeProg(b.id);
        return '<button class="bdg' + (got[b.id] ? ' got' : '') + '" data-act="badge" data-id="' + b.id + '"><span class="bdg-ic">' + b.icon + '</span><span class="bdg-name">' + b.name + '</span>' +
          (pr ? '<span class="bdg-prog"><i style="width:' + clamp(pr[0] / pr[1] * 100, 4, 100).toFixed(0) + '%"></i></span>' : '') + '</button>';
      }).join('') + '</div></section>' +
      '<div class="section-head"><h2>提醒与每日查询</h2></div>' +
      '<section class="card">' + toggle('notify', notifyOn(), '通知提醒', notifyOn() && H && !S.notifyAllowed ? '<span class="warn-text">通知权限没开，点右边开关去开启</span>' : '余额不足、快用完、用电异常或好几天没查时发通知，各类提醒每天至多一次') +
      '<div class="row-label">提醒线</div><p class="hint">余额低于这个数时首页变红，并发通知</p><div class="chip-row" role="group" aria-label="余额提醒线">' +
      preset.map(v => '<button aria-pressed="' + (v === t) + '" class="chip' + (v === t ? ' on' : '') + '" data-act="thr" data-v="' + v + '">¥' + v + '</button>').join('') +
      '<button aria-pressed="' + (preset.indexOf(t) < 0) + '" class="chip' + (preset.indexOf(t) < 0 ? ' on' : '') + '" data-act="thr-custom">' + (preset.indexOf(t) < 0 ? '¥' + t : '自定义') + '</button></div>' +
      '<div class="row-label">快用完时提前提醒</div><div class="chip-row" role="group" aria-label="提前提醒天数">' + [['0', '不提醒'], ['1', '1 天内'], ['3', '3 天内'], ['5', '5 天内']].map(o => '<button aria-pressed="' + (o[0] === alertDays()) + '" class="chip' + (o[0] === alertDays() ? ' on' : '') + '" data-act="alertDays" data-v="' + o[0] + '">' + o[1] + '</button>').join('') + '</div>' +
      '<div class="divider"></div>' +
      toggle('auto', autoOn(), '每天自动查一次', !autoOn() ? '关闭后不查询，也不按记录估算提醒'
        : (S.nextAuto ? '下次 ' + mdhm(S.nextAuto) + ' 左右，' : '') + (bgReady() ? '在后台查余额' : '按记录估算')) +
      (autoOn() ? '<div class="row-label">查询时间</div><div class="chip-row" role="group" aria-label="每日查询时间">' + ['08:00', '12:00', '18:00', '22:00'].map(v => '<button aria-pressed="' + (v === autoTime()) + '" class="chip' + (v === autoTime() ? ' on' : '') + '" data-act="autoTime" data-v="' + v + '">' + v + '</button>').join('') + '</div>' +
        bgStatusHTML() +
        (bgReady()
          ? '<p class="hint" style="margin-top:14px">到点在后台打开学校平台查一次余额（约 15 秒，查完就退出，不常驻）；3 小时内查过就不再查。遇到验证码、密码问题或没网时，改为按记录估算。' + (notifyOn() ? '' : '通知关着时只记录余额，不打扰你。') + '</p>'
          : '<p class="hint" style="margin-top:14px">现在按本机记录估算，不联网：估算快用完了，或已经 3 天以上没查，就发通知提醒你打开看看。在「学校账号」里开启自动登录后，会改为每天在后台真查一次余额。</p>') +
        '<p class="hint">小米、红米等手机会冻结后台的应用：要在系统设置里把本应用的「省电策略」设为「无限制」并允许「自启动」，后台查询和提醒才会准时。</p><button class="btn tonal sm" data-act="app-settings">打开系统设置</button>' : '') +
      '</section>' +
      awayCardHTML() +
      '<div class="section-head"><h2>去充值</h2></div>' +
      '<section class="card"><div class="wx-row"><div><div class="small muted">充值用的公众号</div><div class="wx-name">' + (wxName() ? esc(wxName()) : '还没填写') + '</div></div><button class="btn text sm" data-act="wx-edit">' + (wxName() ? '修改' : '填写') + '</button></div>' +
      '<button class="btn filled wide" data-act="wechat">打开微信去充值</button>' +
      '<p class="hint" style="margin:12px 0 0">会先复制公众号名称，打开微信后在搜索框粘贴即可。' + (H && S.wechat === false ? '<span class="warn-text">没检测到微信。</span>' : '') + '本应用只查余额，不经手任何支付。</p></section>' +
      '<div class="section-head"><h2>外观</h2></div>' +
      '<section class="card"><div class="row-label">主题</div>' + seg('theme', theme(), [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']]) +
      '<div class="row-label"><span>主题色</span><span class="muted small">' + acName + '</span></div><div class="swatches" role="group" aria-label="主题色">' +
      ACCENTS.map(a => '<button aria-pressed="' + (a[0] === accent()) + '" class="sw' + (a[0] === accent() ? ' on' : '') + '" data-act="accent" data-v="' + a[0] + '" style="--c:' + a[1] + ';--on-swatch:' + onPrimary(a[1]) + '" aria-label="' + a[2] + '"></button>').join('') + '</div>' +
      '<div class="row-label">动效</div>' + seg('motion', P().motion === 'off' ? 'off' : 'on', [['on', '标准'], ['off', '减少']]) + '</section>' +
      '<div class="section-head"><h2>数据</h2></div>' +
      '<section class="card"><p class="hint">共 ' + A.n + ' 条读数，只保存在这台手机上，不会上传到任何地方。换手机前可以先导出一份。</p>' +
      legacyHTML() +
      (A.n ? '<button class="btn tonal wide" data-act="export">导出记录（CSV 表格）</button><div style="height:10px"></div>' : '') +
      '<button class="btn tonal wide" data-act="backup">导出数据备份（含归档）</button><p class="operation-status hint" role="status" aria-live="polite" data-operation-status></p>' +
      (S.storage && S.storage.archiveCount ? '<p class="hint">另有 ' + Number(S.storage.archiveCount) + ' 份归档，归档不参与当前宿舍统计。</p>' : '') +
      '<button class="btn danger wide" data-act="clear">清空记录</button></section>' +
      donateCard() +
      '<p class="about">校园电费 ' + esc(S.version || '1.0.0') + '<br>只读取宿舍余额，不含任何充值或支付功能<br>' +
      '<button class="link small" data-act="disclaimer">免责声明</button>' +
      (P().donateHidden === '1' ? ' · <button class="link small" data-act="donate-show">支持作者</button>' : '') + '</p>';
  }

  // ---------------- 走势图 ----------------
  // 走势图按天取点：每天一个点，取当天最后一次读数（当天的「收盘」余额）；当天有充值的点标绿
  function dailyPoints() {
    const byDay = {};
    A.h.forEach(x => { byDay[dayKey(x[0])] = x; }); // A.h 已按时间排好，同一天后面的覆盖前面的
    const rechDays = new Set(A.rech.map(r => dayKey(r.t)));
    return Object.keys(byDay).sort().map(k => {
      const d = new Date(k.replace(/-/g, '/')); d.setHours(12, 0, 0, 0);
      return { k, t: d.getTime(), b: byDay[k][1], use: A.daily[k] || 0, rech: rechDays.has(k) };
    });
  }

  function drawChart() {
    const box = $('#chart');
    if (!box) return;
    $$('#rangeSeg button').forEach(b => { b.classList.toggle('on', b.dataset.v === range); b.setAttribute('aria-pressed', String(b.dataset.v === range)); });
    const W = Math.max(260, Math.round(box.clientWidth)), Hh = 186, pl = 6, pr = 6, pt = 34, pb = 22;
    const noon = t => { const d = new Date(t); d.setHours(12, 0, 0, 0); return d.getTime(); };
    const today = noon(Date.now());
    const all = dailyPoints();
    const from = range === 'all' ? (all.length ? all[0].t : today) : today - (+range - 1) * DAY;
    const pts = all.filter(p => p.t >= from);
    if (pts.length < 2) {
      box.innerHTML = '<div class="chart-empty">' + I.chart + '<div>' + (all.length < 2 ? '每天一个点，至少要有两天的读数才能画出走势' : '这段时间不到两天的读数，换个范围看看') + '</div></div>';
      return;
    }
    // 横轴从这段时间里第一个有读数的日子开始：记录不满 30 天时选「30 天」不至于把折线挤在最右边
    const x0 = pts[0].t, x1 = Math.max(today, pts[pts.length - 1].t);
    let lo = Math.min.apply(null, pts.map(p => p.b)), hi = Math.max.apply(null, pts.map(p => p.b));
    const pv = Math.max((hi - lo) * .12, 1);
    lo -= pv; hi += pv;
    const X = t => pl + (t - x0) / (x1 - x0 || 1) * (W - pl - pr);
    const Y = v => pt + (1 - (v - lo) / (hi - lo || 1)) * (Hh - pt - pb);
    const Pp = pts.map(p => [X(p.t), Y(p.b), p]);
    const line = Pp.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const base = Hh - pb;
    const area = line + ' L' + Pp[Pp.length - 1][0].toFixed(1) + ' ' + base + ' L' + Pp[0][0].toFixed(1) + ' ' + base + ' Z';
    let g = '';
    for (let k = 0; k <= 2; k++) {
      const v = lo + (hi - lo) * k / 2, y = Y(v).toFixed(1);
      g += '<line class="gridl" x1="0" x2="' + W + '" y1="' + y + '" y2="' + y + '"/><text class="glabel" x="' + W + '" y="' + (y - 4) + '" text-anchor="end">¥' + Math.round(v) + '</text>';
    }
    g += '<text class="glabel" x="0" y="' + (Hh - 4) + '">' + md(x0) + '</text><text class="glabel" x="' + W + '" y="' + (Hh - 4) + '" text-anchor="end">今天</text>';
    let marks = '';
    Pp.forEach(p => { marks += '<circle class="' + (p[2].rech ? 'rech' : 'day') + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (p[2].rech ? 4.5 : 2.6) + '"/>'; });
    const L = Pp[Pp.length - 1];
    box.innerHTML = '<svg class="chart-svg" viewBox="0 0 ' + W + ' ' + Hh + '" width="' + W + '" height="' + Hh + '">' +
      '<defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".26"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient><clipPath id="cc"><rect x="0" y="0" width="' + W + '" height="' + Hh + '"/></clipPath></defs>' +
      g + '<g clip-path="url(#cc)"><path d="' + area + '" fill="url(#cg)"/><path class="line" pathLength="1" d="' + line + '"/></g>' + marks +
      '<circle class="halo" cx="' + L[0].toFixed(1) + '" cy="' + L[1].toFixed(1) + '" r="6"/><circle class="last" cx="' + L[0].toFixed(1) + '" cy="' + L[1].toFixed(1) + '" r="4.5"/>' +
      '<line class="guide" id="cGuide" x1="0" x2="0" y1="' + pt + '" y2="' + base + '"/><circle class="cdot" id="cDot" r="5.5"/></svg><div class="chart-tip" id="chartTip" hidden></div>';

    const svg = box.querySelector('svg');
    let lastIdx = -1, hideT = 0;
    const move = e => {
      const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * (W / r.width);
      let bi = 0, bd = 1e9;
      Pp.forEach((p, i) => { const d = Math.abs(p[0] - x); if (p[0] >= 0 && d < bd) { bd = d; bi = i; } });
      if (bi !== lastIdx) { lastIdx = bi; haptic('tick'); }
      const p = Pp[bi], gd = $('#cGuide'), dt = $('#cDot'), tip = $('#chartTip');
      clearTimeout(hideT);
      gd.setAttribute('x1', p[0]); gd.setAttribute('x2', p[0]); gd.style.opacity = 1;
      dt.setAttribute('cx', p[0]); dt.setAttribute('cy', p[1]); dt.style.opacity = 1;
      tip.hidden = false;
      const d = p[2];
      tip.innerHTML = '<b>¥' + f2(d.b) + '</b><span>' + md(d.t) + (d.use > 0.005 ? ' · 用电约 ¥' + f2(d.use) : '') + (d.rech ? ' · 有充值' : '') + '</span>';
      tip.style.left = clamp(p[0] / W * r.width, 56, r.width - 56) + 'px';
    };
    const end = () => {
      clearTimeout(hideT);
      hideT = setTimeout(() => { const gd = $('#cGuide'); if (!gd) return; gd.style.opacity = 0; $('#cDot').style.opacity = 0; $('#chartTip').hidden = true; lastIdx = -1; }, 1400);
    };
    svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons) move(e); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => svg.addEventListener(ev, end));
  }

  // ---------------- 用电日历 ----------------
  function drawCal() {
    const el = $('#cal');
    if (!el) return;
    const nowD = new Date();
    if (!cal) cal = new Date(nowD.getFullYear(), nowD.getMonth(), 1);
    const y = cal.getFullYear(), m = cal.getMonth();
    $('#calTitle').textContent = y + ' 年 ' + (m + 1) + ' 月';
    const firstMonth = A.n ? new Date(new Date(A.h[0][0]).getFullYear(), new Date(A.h[0][0]).getMonth(), 1) : new Date(nowD.getFullYear(), nowD.getMonth(), 1);
    $('#calPrev').disabled = cal <= firstMonth;
    $('#calNext').disabled = y > nowD.getFullYear() || (y === nowD.getFullYear() && m >= nowD.getMonth());
    const lead = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
    let max = 0;
    const vals = [];
    for (let d = 1; d <= days; d++) { const v = A.daily[y + '-' + pad(m + 1) + '-' + pad(d)] || 0; vals.push(v); max = Math.max(max, v); }
    let html = ['一', '二', '三', '四', '五', '六', '日'].map(w => '<div class="wk">' + w + '</div>').join('');
    for (let i = 0; i < lead; i++) html += '<div class="day blank"></div>';
    const todayK = dayKey(Date.now());
    for (let d = 1; d <= days; d++) {
      const k = y + '-' + pad(m + 1) + '-' + pad(d), v = vals[d - 1];
      const lvl = v <= 0.005 || max <= 0 ? 0 : Math.max(1, Math.min(4, Math.ceil(v / max * 4)));
      const fut = new Date(y, m, d).getTime() > Date.now();
      html += '<button class="day l' + lvl + (k === todayK ? ' today' : '') + (fut ? ' future' : '') + '" data-act="day" data-k="' + k + '">' + d + '</button>';
    }
    el.innerHTML = html;
  }

  // ---------------- 动效（移植自「工大学伴」0.9.27，真机量过帧） ----------------
  // 弹簧：w 越大越快，z 越小回弹越明显。cubic-bezier 的「回弹」是前 1/4 时间冲完、剩下慢慢挪，看着像一下跳过去；
  // 这里按真实弹簧算出位移曲线，写成 CSS linear() 缓动（安卓 WebView 113 起支持，旧的退回普通缓出）
  function springAt(t, w, z) { const wd = w * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + z * w / wd * Math.sin(wd * t)); }
  const LINEAR_OK = (() => { try { return CSS.supports('transition-timing-function', 'linear(0, 1)'); } catch (e) { return false; } })();
  function spring(w, z, ms) { if (!LINEAR_OK) return 'cubic-bezier(.2,.9,.3,1)'; const n = 40, pts = []; for (let i = 0; i <= n; i++) pts.push(+springAt(i / n * ms / 1000, w, z).toFixed(4)); pts[n] = 1; return 'linear(' + pts.join(',') + ')'; }
  // 全部动画只用这几条曲线：进场缓出、退场缓入、弹簧（样式表里的 --spring 也由这里算好写进去）
  const EASE = { out: 'cubic-bezier(.2,.8,.2,1)', in: 'cubic-bezier(.4,0,1,1)' };
  const SPRING = { press: spring(34, .62, 360), sheet: spring(26, .78, 360) };
  if (LINEAR_OK) document.documentElement.style.setProperty('--spring', SPRING.sheet);

  // 底栏滑块和各处选中高亮共用的位移：整块滑过去，只在跑得最快时顺着方向略微拉长（最多 20%），到位时带一点点回弹；左右沿不超出 [minL, maxR]
  const LIQUID_MS = 360;
  function liquidFrames(from, to, minL = -Infinity, maxR = Infinity) {
    const frames = [], n = 24, px = v => v.toFixed(1) + 'px', s = t => springAt(t, 32, .78), dt = .004;
    let vmax = 0; const v = [];
    for (let i = 0; i <= n; i++) { const t = i / n * LIQUID_MS / 1000, d = (s(t + dt) - s(t)) / dt; v.push(d); vmax = Math.max(vmax, d); }
    for (let i = 0; i <= n; i++) {
      const t = i / n * LIQUID_MS / 1000, k = s(t), w = from.w + (to.w - from.w) * k, c = from.x + from.w / 2 + (to.x + to.w / 2 - from.x - from.w / 2) * k;
      const sw = w * (1 + .2 * Math.max(0, v[i]) / (vmax || 1)), l = Math.max(minL, c - sw / 2), r = Math.min(maxR, c + sw / 2);
      frames.push({ transform: 'translate(' + px(l) + ',' + px(from.y + (to.y - from.y) * k) + ')', width: px(Math.max(8, r - l)), height: px(from.h + (to.h - from.h) * k) });
    }
    frames[n] = { transform: 'translate(' + to.x + 'px,' + to.y + 'px)', width: to.w + 'px', height: to.h + 'px' };
    return frames;
  }

  // 悬浮底栏里选中项下面那块浅色滑块（第一次只放到位，不播动画）；回弹不冲出底栏
  let pillAt = '';
  function navPillRect(nav, pill) {
    const r = pill.getBoundingClientRect(), parent = nav.getBoundingClientRect();
    const sx = parent.width / nav.offsetWidth || 1, sy = parent.height / nav.offsetHeight || 1;
    return { x: (r.left - parent.left) / sx - nav.clientLeft,
      y: (r.top - parent.top) / sy - nav.clientTop - 6, w: r.width / sx, h: r.height / sy };
  }
  function movePill() {
    const nav = $('#nav'), cur = nav && nav.querySelector('button[aria-current=page]');
    // Gesture owns the painted geometry until release. State pushes cannot take it over.
    if (!cur || nav.classList.contains('dragging')) return;
    let pill = nav.querySelector('.nav-pill');
    if (!pill) { pill = document.createElement('i'); pill.className = 'nav-pill'; pill.setAttribute('aria-hidden', 'true'); nav.prepend(pill); }
    const to = { x: cur.offsetLeft, y: 0, w: cur.offsetWidth, h: Math.max(1, nav.clientHeight - 12) };
    const at = [to.x, to.w, to.h].join(',');
    if (at === pillAt || !to.w) return;
    const ready = pill.classList.contains('ready'), from = ready ? navPillRect(nav, pill) : to;
    pillAt = at;
    pill.getAnimations().forEach(a => a.cancel());
    pill.style.width = to.w + 'px'; pill.style.height = to.h + 'px';
    pill.style.transformOrigin = '0 0'; pill.style.transform = 'translate(' + to.x + 'px,0px)';
    pill.classList.add('ready');
    if (!ready || !motionOn() || document.hidden) return;
    pill.animate(liquidFrames(from, to, 6, nav.clientWidth - 6), { duration: LIQUID_MS, easing: 'linear' });
  }
  function markNav(p) { $$('#nav button').forEach(b => { if (b.dataset.page === p) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }); }

  // 底栏滑块可以按住拖：按住约 0.25 秒或按下后横着拖，滑块浮起来跟着手指走，经过的图标放大、轻震；松手停在哪个就切到哪个
  const navDrag = {id:null,timer:0,frame:0,scaleUntil:0,on:false,x0:0,y0:0,x:0,over:null,ate:0,w:0,h:0,growFrom:null,started:0,captureTarget:null,trackWidth:0};
  const navButtons = nav => Array.from(nav.querySelectorAll('button[data-page]')).filter(b => !b.hidden);
function navDragMove(nav,x) {
 navDrag.x=x;
 const pill=nav.querySelector('.nav-pill');if (!pill) return;
 const r=nav.getBoundingClientRect(),sx=r.width/nav.offsetWidth||1,localX=(x-r.left)/sx-nav.clientLeft;
 const w=Math.min(navDrag.w*(motionOn()?1.12:1),Math.max(1,nav.clientWidth-12)),h=Math.min(navDrag.h*(motionOn()?1.16:1),Math.max(1,nav.clientHeight-4));
 const left=Math.min(Math.max(localX-w/2,6),nav.clientWidth-6-w),top=(navDrag.h-h)/2;
 // 统一左上原点；用放大后的可见宽度夹边，指尖在可用范围内始终对齐胶囊中心。
 const progress=motionOn()?Math.min(1,Math.max(0,(performance.now()-navDrag.started)/180)):1,eased=1-Math.pow(1-progress,3),from=navDrag.growFrom||{x:left,y:top,w,h};
 const shown={x:from.x+(left-from.x)*eased,y:from.y+(top-from.y)*eased,w:from.w+(w-from.w)*eased,h:from.h+(h-from.h)*eased};
 pill.style.transform='translate('+shown.x+'px,'+shown.y+'px) scale('+shown.w/navDrag.w+','+shown.h/navDrag.h+')';
 const over=navButtons(nav).find(b => { const q=b.getBoundingClientRect();return x>=q.left && x<q.right; })||null;
 if (over !== navDrag.over) { navDrag.over?.classList.remove('lens');over?.classList.add('lens');if (navDrag.over&&over) haptic('tick');navDrag.over=over; }
}
function navDragStart(nav,x) {
 if (navDrag.on || navDrag.id == null) return;
 const pill=nav.querySelector('.nav-pill');if (!pill) return;
 if (pressed && nav.contains(pressed)) endPress(true);
 // Sample before cancelling an interrupted slide; grow from the painted rectangle.
 navDrag.growFrom=navPillRect(nav,pill);navDrag.started=performance.now();
 pill.getAnimations().forEach(a => a.cancel());navDrag.w=Math.max(1,nav.querySelector('button[aria-current=page]')?.offsetWidth||pill.offsetWidth);navDrag.h=Math.max(1,nav.clientHeight-12);navDrag.x=x;navDrag.on=true;
 pill.style.width=navDrag.w+'px';pill.style.height=navDrag.h+'px';pill.style.transformOrigin='0 0';
 nav.classList.add('dragging');haptic('tap');
 try { nav.setPointerCapture(navDrag.id); } catch (error) {}
 navDrag.scaleUntil=performance.now()+420;navDragFrame(nav);
}
function navDragFrame(nav) {
 navDrag.frame=0;if(!navDrag.on)return;
 navDragMove(nav,navDrag.x);
 // 底栏鼓起期间补偿父缩放；稳定长按后只在真实移动时出帧。
 if(performance.now()<navDrag.scaleUntil)navDrag.frame=requestAnimationFrame(()=>navDragFrame(nav));
}
function navDragEnd(nav,commit) {
 clearTimeout(navDrag.timer);cancelAnimationFrame(navDrag.frame);navDrag.timer=navDrag.frame=0;
 if (navDrag.on) navDragMove(nav,navDrag.x);
 const was=navDrag.on,target=navDrag.over,id=navDrag.id,pill=nav.querySelector('.nav-pill'),from=was&&pill?navPillRect(nav,pill):null;
 navDrag.id=null;navDrag.on=false;navDrag.over?.classList.remove('lens');navDrag.over=null;
 try { if(id!=null&&navDrag.captureTarget?.hasPointerCapture(id))navDrag.captureTarget.releasePointerCapture(id); } catch(error) {}
 navDrag.captureTarget=null;navDrag.growFrom=null;
 try { if(id!=null&&nav.hasPointerCapture(id))nav.releasePointerCapture(id); } catch(error) {}
 if (!was) return;
 nav.classList.remove('dragging');navDrag.ate=commit?Date.now()+400:0;pillAt='';
 // 保留松手时的可见矩形，再由同一条滑块弹簧归位；不能先抹掉 scale 跳回小胶囊。
 if (from) { pill.style.width=from.w+'px';pill.style.height=from.h+'px';pill.style.transform='translate('+from.x+'px,'+from.y+'px)'; }
 if (commit&&target&&target.dataset.page!==page) go(target.dataset.page);else movePill();
}
function bindNavDrag() {
 const nav=$('#nav');if(!nav)return;
 nav.addEventListener('pointerdown',e=>{
  if(!e.isPrimary||e.button!==0||getComputedStyle(nav).position!=='fixed'||navDrag.id!=null||!nav.querySelector('.nav-pill'))return;
  navDrag.id=e.pointerId;navDrag.x0=navDrag.x=e.clientX;navDrag.y0=e.clientY;navDrag.ate=0;navDrag.trackWidth=nav.offsetWidth;
  // Capture the original button so a short tap retains its normal click target.
  navDrag.captureTarget=e.target.closest?.('button[data-page]')||nav;
  try { navDrag.captureTarget.setPointerCapture(e.pointerId); } catch(error) {}
  navDrag.timer=setTimeout(()=>{if(navDrag.id===e.pointerId)navDragStart(nav,navDrag.x);},250);
 });
 nav.addEventListener('pointermove',e=>{
  if(e.pointerId!==navDrag.id)return;
  const dx=e.clientX-navDrag.x0,dy=e.clientY-navDrag.y0;navDrag.x=e.clientX;
  if(!navDrag.on&&Math.abs(dy)>18&&Math.abs(dy)>Math.abs(dx)*1.5){navDragEnd(nav,false);endPress(true);return;}
  if(!navDrag.on&&Math.abs(dx)>10){clearTimeout(navDrag.timer);navDragStart(nav,e.clientX);}
  if(navDrag.on&&!navDrag.frame)navDrag.frame=requestAnimationFrame(()=>navDragFrame(nav));
 });
 window.addEventListener('pointerup',e=>{if(e.pointerId===navDrag.id){navDrag.x=e.clientX;navDragEnd(nav,true);}});
 window.addEventListener('pointercancel',e=>{if(e.pointerId===navDrag.id)navDragEnd(nav,false);});
 nav.addEventListener('lostpointercapture',e=>{if(e.target===nav&&e.pointerId===navDrag.id)navDragEnd(nav,false);});
 window.addEventListener('blur',()=>navDragEnd(nav,false));
 document.addEventListener('visibilitychange',()=>{if(document.hidden)navDragEnd(nav,false);});
 window.addEventListener('resize',()=>{if(navDrag.id!=null&&nav.offsetWidth!==navDrag.trackWidth)navDragEnd(nav,false);});
 nav.addEventListener('touchmove',e=>{if(navDrag.on&&e.cancelable)e.preventDefault();},{passive:false});
 nav.addEventListener('contextmenu',e=>e.preventDefault());
 for(const k of ['selectstart','contextmenu','dragstart'])document.addEventListener(k,e=>{if(navDrag.id!=null)e.preventDefault();},true);
 // 只吞真实拖动后的兼容鼠标点击，键盘/无障碍的 detail=0 点击始终可达。
 nav.addEventListener('click',e=>{if(e.detail>0&&Date.now()<navDrag.ate){navDrag.ate=0;e.preventDefault();e.stopPropagation();}},true);
}

  // 按下反馈：安卓 WebView 的 :active 要等系统确认不是滑动才加上，快点一下几乎看不到。
  // 改成手指一碰就缩小，松手时按弹簧弹回；点完整页重画换掉了按钮，就在新按钮上接着播完剩下的回弹
  const PRESSABLE = '.btn, .chip, .icon-btn, .seg button, .sw, .switch-row, .nav button, .bdg, .quote, .room-chip, .day:not(.blank)';
  let pressed = null, releasedAt = 0;
  function pressRelease(el, at) {
    if (!el || !el.animate || !motionOn() || (el.closest('.nav') && el.closest('.nav').classList.contains('dragging'))) return;
    const a = el.animate([{ transform: 'scale(.94)' }, { transform: 'none' }], { duration: 360, easing: SPRING.press });
    a.currentTime = Math.min(340, Math.max(0, Date.now() - (at || releasedAt || Date.now())));
  }
  function endPress(cancel) {
    const el = pressed; pressed = null;
    if (!el) return;
    el.classList.remove('pressing');
    releasedAt = Date.now();
    if (!cancel) pressRelease(el);
  }

  // 一组里只能选一个的（分段选择、提醒线、提前天数、查询时间）：选中的高亮从旧选项滑到新选项，和底栏滑块同一种动画。
  // 点了会整页重画、按钮被换掉：点之前记下旧选中项的位置和样子，重画后找到同一个按钮接着播
  let tapMorph = null, liveSlide = null;
  const morphKey = el => el.tagName + '|' + (el.dataset.act || '') + '=' + (el.dataset.v || '');
  function slideGroup(el) {
    const seg = el.closest('.seg');
    if (seg) return $$(':scope > button', seg);
    if (!el.parentElement || !el.classList.contains('chip') || !el.parentElement.classList.contains('chip-row')) return [];
    return Array.from(el.parentElement.children).filter(x => x.classList.contains('chip'));
  }
  const slideOn = x => x.classList.contains('on');
  // 元素在容器内容里的位置（含容器自身的横向滚动），影子就画在这个坐标系里
  function relBox(x, host) { const r = x.getBoundingClientRect(), h = host.getBoundingClientRect(); return { x: r.left - h.left + host.scrollLeft - host.clientLeft, y: r.top - h.top + host.scrollTop - host.clientTop, w: r.width, h: r.height }; }
  function findMorph(m) { return m.el.isConnected ? m.el : $$('#content ' + m.el.tagName.toLowerCase()).find(x => morphKey(x) === m.key); }
  function slideFrom(m, elapsed) {
    elapsed = elapsed || 0;
    if (!m || !m.prev || elapsed >= LIQUID_MS - 40) return;
    const el = findMorph(m);
    if (!el || !slideOn(el)) return;
    const group = slideGroup(el);
    if (group.filter(slideOn).length !== 1) return;
    const host = el.parentElement, cs = getComputedStyle(el), seg = !!el.closest('.seg');
    const to = relBox(el, host), from = m.prev;
    if (!to.w || Math.abs(to.x - from.x) + Math.abs(to.y - from.y) < 2) return;
    const ghost = document.createElement('i');
    ghost.className = 'slide-ghost';
    // 颜色取点击那一刻旧选中项的：新选中项身上的背景色过渡才刚开始，这时读到的还是透明
    Object.assign(ghost.style, m.look || { background: cs.backgroundColor, borderRadius: cs.borderRadius, boxShadow: cs.boxShadow });
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.prepend(ghost);
    el.style.setProperty('background-color', 'transparent'); el.style.setProperty('box-shadow', 'none');
    const a = ghost.animate(liquidFrames(from, to, 0, seg ? host.clientWidth : host.scrollWidth), { duration: LIQUID_MS, easing: 'linear', fill: 'forwards' });
    if (elapsed) a.currentTime = elapsed;
    liveSlide = { m, ghost, start: performance.now() - elapsed };
    // 文字选中色跟着高亮一起到，不先亮
    if (m.from && m.from.color !== cs.color) el.animate([{ color: m.from.color }, { color: cs.color }], { duration: LIQUID_MS * .6, easing: 'ease-out' });
    // 各自有底色的标签：高亮从中间标签底下穿过，路过的标签底色临时淡掉、让它过去再恢复；原来选中的那个底色从透明慢慢回来
    if (!seg) {
      const lo = Math.min(from.x, to.x), hi = Math.max(from.x + from.w, to.x + to.w);
      group.forEach(c => {
        if (c === el) return;
        const r = relBox(c, host), bg = getComputedStyle(c).backgroundColor;
        if (r.x + r.w <= lo || r.x >= hi || Math.abs(r.y - to.y) > 4) return;
        const source = Math.abs(r.x - from.x) < 2 && Math.abs(r.y - from.y) < 2;
        c.animate(source ? [{ backgroundColor: 'transparent' }, { backgroundColor: 'transparent', offset: .3 }, { backgroundColor: bg }] : [{ backgroundColor: bg }, { backgroundColor: 'transparent', offset: .15 }, { backgroundColor: 'transparent', offset: .55 }, { backgroundColor: bg }], { duration: LIQUID_MS, easing: 'ease-out' });
      });
    }
    el.style.setProperty('transition', 'none');
    // 收尾时按钮自己的底色直接出现，不再从透明过渡一遍（否则影子一撤会闪一下）
    const done = () => { if (!ghost.isConnected) return; ghost.remove(); el.style.removeProperty('background-color'); el.style.removeProperty('box-shadow'); void el.offsetWidth; el.style.removeProperty('transition'); };
    a.finished.then(done, done); setTimeout(done, LIQUID_MS + 200);
  }
  // 滑到一半页面又被重画（保存设置后整页重画），影子会跟着旧控件一起被换掉：在新控件上从同一进度接着滑
  function resumeSlide() {
    const s = liveSlide;
    if (!s || s.ghost.isConnected) return;
    liveSlide = null;
    slideFrom(s.m, performance.now() - s.start);
  }
  // 整页重画后调用：刚点的按钮被换掉了，在新按钮上接着播完高亮滑动和按下回弹
  function playTapMorph() {
    resumeSlide();
    const m = tapMorph;
    if (!m || Date.now() - m.at > 1500 || !motionOn()) return;
    if (m.el.isConnected) return; // 没被重画替换：按下回弹已经在原按钮上播了
    const el = findMorph(m);
    tapMorph = null;
    if (!el || !el.animate) return;
    if (m.prev && slideOn(el) && slideGroup(el).filter(slideOn).length === 1) { slideFrom(m); pressRelease(el, m.at); return; }
    const s = getComputedStyle(el), to = { backgroundColor: s.backgroundColor, color: s.color };
    if (to.backgroundColor !== m.from.backgroundColor || to.color !== m.from.color) el.animate([m.from, to], { duration: 240, easing: 'ease-out' });
    pressRelease(el, m.at);
  }
  function bindMotion() {
    document.addEventListener('pointerdown', e => {
      if (e.button > 0 || !motionOn()) return;
      const el = e.target.closest && e.target.closest(PRESSABLE);
      if (!el || el.disabled) return;
      pressed = el; el.classList.add('pressing');
    }, { passive: true });
    document.addEventListener('pointerup', () => endPress(false), { passive: true });
    document.addEventListener('pointercancel', () => endPress(true), { passive: true });
    document.addEventListener('click', e => {
      const el = e.target.closest && e.target.closest('#content button');
      if (!el || !motionOn()) { tapMorph = null; return; }
      const cs = getComputedStyle(el), group = slideGroup(el), was = group.filter(slideOn), one = was.length === 1 && was[0] !== el ? was[0] : null;
      const of = one && getComputedStyle(one);
      // 旧位置记成相对于这一组容器的坐标：整页重画后上面的卡片高度会变、页面会挪，用屏幕坐标的话高亮会从别处飞来
      tapMorph = { el, key: morphKey(el), at: Date.now(), prev: one ? relBox(one, el.parentElement) : null, look: of ? { background: of.backgroundColor, borderRadius: of.borderRadius, boxShadow: of.boxShadow } : null, from: { backgroundColor: cs.backgroundColor, color: cs.color } };
      // 下一帧再看一次：没被重画的（走势图的范围切换只改选中态）直接滑；被整页重画换掉的由 render() 收尾时接着播
      const m = tapMorph;
      requestAnimationFrame(() => { if (tapMorph !== m) return; if (m.el.isConnected) { tapMorph = null; slideFrom(m); } else playTapMorph(); });
    }, true);
    bindNavDrag();
  }

  // 第一次出现的卡片（预警、闹钟提示、月度小结）：升起淡入一次；之后页面再重画不重复播
  const shownOnce = new Set();
  function firstShow(key) { if (shownOnce.has(key)) return ''; shownOnce.add(key); return ' first-show'; }

  // ---------------- 渲染 ----------------
  function renderTop() {
    const working = fetchSt === 'working';
    $('#progress').hidden = !working;
    const refreshButton = $('#refreshBtn');
    refreshButton.classList.toggle('spin', working);
    refreshButton.disabled = ['working', 'login', 'pick', 'room', 'offline'].includes(fetchSt);
    refreshButton.setAttribute('aria-busy', String(working));
    refreshButton.setAttribute('aria-label', working ? '正在刷新余额' : '刷新余额');
    $('#roomText').textContent = S.room || '未设置宿舍';
    const dot = $('#roomDot');
    dot.className = 'dot' + (S.lastFetch ? (Date.now() - S.lastFetch < 3 * HOUR ? ' ok' : ' warn') : '');
    $('#pageName').textContent = { home: '电费', stats: '统计', me: '我的' }[page];
    markNav(page);
    movePill();
  }

  function render(anim) {
    A = analyze();
    const c = $('#content');
    c.innerHTML = page === 'home' ? homeHTML() : page === 'stats' ? statsHTML() : meHTML();
    renderTop();
    if (anim) {
      Array.from(c.children).forEach((ch, i) => ch.style.setProperty('--i', Math.min(i, 8)));
      c.classList.remove('enter'); void c.offsetWidth; c.classList.add('enter');
    }
    if (page === 'home') afterHome();
    if (page === 'stats') { drawChart(); drawCal(); }
    fitText($$('.tile-val, .sum-grid b'));
    operationUI();
    playTapMorph();
  }

  // 系统字体调大时（原生端按系统字号设了 textZoom），大数字、小格里的数值可能一行放不下：
  // 逐步缩小到放得下为止，不换行、不截断；最小缩到原来的 60%
  function fitText(els) {
    els.forEach(el => {
      el.style.fontSize = '';
      let fs = parseFloat(getComputedStyle(el).fontSize);
      const min = fs * .6;
      while (el.scrollWidth > el.clientWidth + 1 && fs > min) { fs *= .92; el.style.fontSize = fs.toFixed(1) + 'px'; }
    });
  }
  if (!H) window.__fit = () => { fitText($$('.big, .tile-val, .sum-grid b')); }; // 预览里模拟大字号时手动调用

  function afterHome() {
    if (A.cur == null) return;
    const lv = level();
    requestAnimationFrame(() => requestAnimationFrame(() => $$('.wave').forEach(w => w.style.setProperty('--lv', lv))));
    shownLv = lv;
    const el = $('#bigNum'), to = A.cur, from = shown == null ? 0 : shown;
    shown = to;
    if (!el) return;
    // 按最终数字量一次宽度再开始滚动，滚动中途不再跳字号
    el.textContent = f2(to);
    fitText([$('.big')]);
    if (!motionOn() || Math.abs(to - from) < 0.005) { el.textContent = f2(to); return; }
    const t0 = performance.now(), dur = from === 0 ? 1100 : 700;
    const step = now => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      if (!el.isConnected) return;
      el.textContent = f2(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function go(p) {
    if (p === page) { window.scrollTo({ top: 0, behavior: motionOn() ? 'smooth' : 'auto' }); return; }
    // 按底栏顺序左右滑入：往右的页面从右边进来，往左的从左边进来
    const order = ['home', 'stats', 'me'], c = $('#content');
    const dir = order.indexOf(p) > order.indexOf(page) ? 1 : -1;
    c.style.setProperty('--dx', dir * 28 + 'px');
    c.style.setProperty('--dy', '0px');
    page = p;
    // 底栏滑块点下当帧就起步，不等新页面画完
    markNav(p);
    movePill();
    haptic('tap');
    window.scrollTo(0, 0);
    render(true);
    if (p === 'me') maybeThanks(1200);
  }

  // ---------------- 操作 ----------------
  function refresh() {
    if (['working', 'login', 'pick', 'room'].indexOf(fetchSt) >= 0) return;
    userRefresh = true;
    haptic('tap');
    if (H) H.refresh(); else demoRefresh();
  }

  // 原生 boolean 只表示接收任务，成功/失败以 onOperation 回调为准。
  let operation = null, claiming = false;
  const OP_LABELS = { csv: '正在导出 CSV…', backup: '正在导出备份…', 'save-image': '正在保存图片…', 'share-image': '正在准备分享…' };
  function operationUI() {
    const selectors = '[data-act="export"],[data-act="backup"],[data-sheet-act="card-save"],[data-sheet-act="card-share"]';
    $$(selectors).forEach(b => {
      const kind = b.dataset.act === 'export' ? 'csv' : b.dataset.act === 'backup' ? 'backup' : b.dataset.sheetAct === 'card-save' ? 'save-image' : 'share-image';
      if (!b.dataset.idleLabel) b.dataset.idleLabel = b.textContent;
      b.disabled = !!operation;
      b.setAttribute('aria-busy', String(!!operation && operation.kind === kind));
      b.textContent = operation && operation.kind === kind ? OP_LABELS[kind] : b.dataset.idleLabel;
    });
    $$('[data-act="claim-legacy"]').forEach(b => { b.disabled = claiming; b.setAttribute('aria-busy', String(claiming)); });
    $$('[data-operation-status]').forEach(el => { el.textContent = operation ? OP_LABELS[operation.kind] : claiming ? '正在确认旧记录归属…' : ''; });
  }
  function startOperation(kind, method, payload) {
    if (operation) { toast('操作正在进行，请稍候'); return; }
    if (!H || typeof H[method] !== 'function') { toast(H ? '当前版本暂不支持此操作' : '请在安卓应用中导出、保存或分享'); return; }
    operation = { kind };
    operationUI(); haptic('tap');
    try {
      const accepted = payload === undefined ? H[method]() : H[method](payload);
      if (!accepted) finishOperation(kind, false, '任务未开始，请稍后重试');
    } catch (e) { finishOperation(kind, false, '操作未能开始，请稍后重试'); }
  }
  function finishOperation(kind, ok, message) {
    if (kind === 'claim') {
      claiming = false; operationUI();
      if (!ok) { haptic('reject'); toast(message || '旧记录归属确认失败'); }
      return;
    }
    if (!operation || operation.kind !== kind) return;
    operation = null; operationUI();
    haptic(ok ? 'confirm' : 'reject');
    toast(message || (ok ? '操作已完成' : '操作失败，请稍后重试'));
  }

  function act(a, t) {
    switch (a) {
      case 'account':
        haptic('tap');
        if (H && H.manageAccount) H.manageAccount(); else toast('请在安卓应用中添加账号；预览不保存密码');
        break;
      case 'auto-login':
        haptic('tick');
        if (H && H.setAutoLogin) H.setAutoLogin(!(S.login && S.login.auto)); else toast('请在安卓应用中设置自动登录');
        break;
      case 'refresh': refresh(); break;
      case 'school': if (H && H.showSchool) H.showSchool(); break;
      case 'cancel-query': if (H && H.cancel) H.cancel(); break;
      case 'quote': {
        const L = lines();
        quoteIdx = ((quoteIdx || 0) + 1) % L.length;
        quoteTapped = true;
        const el = $('#quote'), q = L[quoteIdx];
        haptic('tick');
        el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip');
        setTimeout(() => { el.querySelector('.q-emoji').textContent = q[0]; el.querySelector('.q-text').textContent = q[1]; }, motionOn() ? 140 : 0);
        break;
      }
      case 'range': range = t.dataset.v; haptic('tick'); drawChart(); break;
      case 'history-more': {
        historyLimit += 80; haptic('tick');
        const box = $('#historyRecords');
        box.innerHTML = historyHTML();
        const more = box.querySelector('[data-act="history-more"]');
        if (more) more.focus({ preventScroll: true });
        else { box.tabIndex = -1; box.focus({ preventScroll: true }); }
        break;
      }
      case 'cal-prev': case 'cal-next':
        cal = new Date(cal.getFullYear(), cal.getMonth() + (a === 'cal-next' ? 1 : -1), 1); haptic('tick'); drawCal(); break;
      case 'day': {
        const v = A.daily[t.dataset.k] || 0, ts = new Date(t.dataset.k.replace(/-/g, '/')).getTime();
        haptic('tick');
        toast(v > 0.005 ? md(ts) + ' 用电约 ¥' + f2(v) : md(ts) + ' 没有用电记录');
        break;
      }
      case 'thr': setPref('thr', t.dataset.v); haptic('tick'); render(); break;
      case 'thr-custom':
        sheet({
          icon: '🔔', title: '自定义提醒线', text: '余额低于这个数时首页变红提醒', ok: '保存',
          html: '<input class="field" id="thrInput" type="number" inputmode="decimal" min="0" step="1" value="' + thr() + '">',
          onOk: () => {
            const v = parseFloat($('#thrInput').value);
            if (!isFinite(v) || v < 0 || v > 1000) { toast('请输入 0–1000 之间的数'); haptic('reject'); return false; }
            setPref('thr', Math.round(v * 100) / 100); render(); toast('提醒线改为 ¥' + thr());
          }
        });
        break;
      case 'theme': case 'accent': case 'motion':
        setPref(a, t.dataset.v); haptic('tick'); applyTheme(); render(); break;
      case 'auto':
        setPref('auto', autoOn() ? '0' : '1'); haptic('tick');
        if (H) H.schedule(); else render();
        toast(autoOn() ? '已开启，每天 ' + autoTime() + ' 左右' + (bgReady() ? '在后台查一次余额' : '按记录估算一次') : '已关闭每日查询');
        break;
      case 'autoTime':
        setPref('autoTime', t.dataset.v); haptic('tick');
        if (H) H.schedule(); else render();
        break;
      case 'notify':
        if (notifyOn() && (!H || S.notifyAllowed)) { setPref('notify', '0'); haptic('tick'); render(); break; }
        setPref('notify', '1'); haptic('tick'); render();
        if (H && !S.notifyAllowed) H.requestNotify();
        break;
      case 'alertDays': setPref('alertDays', t.dataset.v); haptic('tick'); render(); break;
      case 'app-settings': haptic('tap'); if (H) H.openAppSettings(); else toast('预览模式下无法打开系统设置'); break;
      case 'wechat': goWeChat(); break;
      case 'share': shareSheet(); break;
      case 'away-edit': editAway(); break;
      case 'away-end': endAway(false); break;
      case 'away-cancel': endAway(true); break;
      case 'wx-edit': editWx(false); break;
      case 'disclaimer': haptic('tap'); disclaimerSheet(false); break;
      case 'alarm-hide': setPref('alarmMissHide', t.dataset.v); haptic('tick'); render(); toast('之后再连着漏 3 次才会再提示'); break;
      case 'month-seen': setPref('monthSeen', t.dataset.v); haptic('tick'); render(); toast('统计页的「月度对比」里随时能看'); break;
      case 'donate-hide': setPref('donateHidden', '1'); haptic('tick'); render(); toast('已收起，页面最底下的「支持作者」可以重新打开'); break;
      case 'donate-show': setPref('donateHidden', '0'); haptic('tick'); render(); break;
      case 'donate-save': saveDonate(false); break;
      case 'export': startOperation('csv', 'exportCsvAsync'); break;
      case 'backup': startOperation('backup', 'exportBackup'); break;
      case 'claim-legacy': {
        if (claiming || !legacyCount()) break;
        sheet({
          icon: '🧾', title: '将旧记录归属到当前宿舍？', ok: '确认归属',
          text: '这 ' + legacyCount() + ' 条旧版记录尚无宿舍归属。仅在确认它们全部属于当前宿舍' + (S.room ? '「' + S.room + '」' : '') + '时继续；归属后将参与当前宿舍统计。若不确定，请取消并先导出数据备份。',
          onOk: () => {
            if (claiming) return false;
            if (!S.room || !S.storage || !S.storage.activeKey) { toast('请先查询并确认当前宿舍'); return false; }
            if (!H || typeof H.claimLegacy !== 'function') { toast('请在安卓应用中确认旧记录归属'); return false; }
            claiming = true; operationUI();
            try { H.claimLegacy(); } catch (e) { finishOperation('claim', false, '旧记录归属确认失败'); return false; }
          }
        });
        break;
      }
      case 'qr-zoom':
        haptic('tap');
        sheet({ title: '作者的微信收款码', html: '<img class="qr-big" src="donate.png" alt="作者的微信收款码">' + (H ? '' : '<p class="muted small center">用微信扫一扫</p>'), ok: '关闭', cancel: false });
        break;
      case 'reset-room':
        sheet({
          icon: '🏠', title: S.room ? '换个宿舍？' : '选择宿舍', ok: '去选择',
          text: '会打开学校的缴费页面，选校区、填宿舍号后自动回来。旧宿舍单独归档，新宿舍重新统计。',
          onOk: () => { if (H) H.resetRoom(); else toast('预览模式下无法打开学校页面'); }
        });
        break;
      case 'clear':
        sheet({
          icon: '🗑️', title: '清空全部记录？', ok: '清空', danger: true,
          text: '会删除 ' + A.n + ' 条读数和已获得的勋章，宿舍和设置会保留。删除后无法恢复。',
          onOk: () => {
            if (H) H.clearHistory(); else { S.hist = []; delete P().badges; render(); }
            shown = null; shownLv = null; toast('已清空');
          }
        });
        break;
      case 'badge': {
        const b = BADGES.find(x => x.id === t.dataset.id), got = badges()[b.id];
        haptic('tap');
        const pr = got ? null : badgeProg(b.id);
        const left = pr ? '\n现在 ' + pr[0] + ' / ' + pr[1] + ' ' + pr[2] + '，还差 ' + Math.max(0, pr[1] - pr[0]) + ' ' + pr[2] : '\n还没解锁';
        sheet({ icon: got ? b.icon : '🔒', title: b.name, text: b.desc + (got ? '\n' + md(got) + '获得' : left), ok: '好', cancel: false });
        break;
      }
    }
  }

  // ---------------- 去微信充值 ----------------
  function goWeChat() {
    const name = wxName();
    if (!name) { editWx(true); return; }
    haptic('tap');
    if (!H) { toast('预览模式：会复制「' + name + '」并打开微信'); return; }
    const r = H.openWeChat(name);
    if (r === 'missing') { haptic('reject'); toast('没找到微信，请先安装微信'); return; }
    toast('已复制「' + name + '」，在微信搜索框粘贴即可');
  }

  function editWx(thenOpen) {
    sheet({
      icon: '💬', title: '充值用的公众号', ok: thenOpen ? '保存并打开微信' : '保存',
      text: '填你平时给宿舍充电费的微信公众号名称（不确定的话可以问宿管，或看学校的缴费通知）。',
      html: '<input class="field" id="wxInput" type="text" maxlength="40" placeholder="公众号名称" value="' + esc(wxName()) + '">',
      onOk: () => {
        const v = $('#wxInput').value.trim();
        if (!v) { toast('先填一个名称'); haptic('reject'); return false; }
        setPref('wxName', v);
        render();
        if (thenOpen) setTimeout(goWeChat, 220); else toast('已保存');
      }
    });
  }

  // ---------------- 每日查询的状态 ----------------
  // 上一次到点时怎么样（原生端 BgQuery.record 记的）：{t, r: ok / fail:原因 / skip:原因}
  function bgLast() { try { const o = JSON.parse(S.bgLast || ''); return o && o.t ? o : null; } catch (e) { return null; } }
  function bgStatusHTML() {
    const b = bgLast();
    if (!b) return '';
    const when = (dayKey(b.t) === dayKey(Date.now()) ? '今天 ' : md(b.t) + ' ') + hm(b.t);
    const [kind, why] = String(b.r).split(':');
    const text = kind === 'ok' ? '后台查到了余额' : kind === 'skip'
      ? ({ recent: '3 小时内查过，没再查', foreground: '应用正开着，没另外查', away: '假期中，没查', 'no-auto-login': '没开自动登录，按记录估算', attention: '学校说密码不对，没查', 'no-room': '还没选宿舍，没查' })[why] || '没查'
      : '没查到（' + (failText(why) || '原因不明') + '），按记录估算';
    return '<p class="bg-status ' + (kind === 'fail' ? 'warn-text' : 'muted') + '">上次 ' + when + '：' + text + '</p>';
  }
  // 每日闹钟连着 3 次没按时响（多半被省电策略冻住了）：首页提示一次，收起后再漏 3 次才会再出现
  function alarmCardHTML() {
    const miss = +S.alarmMiss || 0, hidden = +P().alarmMissHide || 0;
    if (!H || !autoOn() || miss < 3 || miss < hidden + 3) return '';
    return '<section class="card alert soft' + firstShow('alarm') + '">' + I.warn + '<div class="alert-body"><b>每日查询最近没按时运行</b><div class="small">已经连着 ' + miss +
      ' 次没在 ' + autoTime() + ' 左右运行，多半是手机的省电策略冻住了本应用。把「省电策略」设为「无限制」并允许「自启动」就好。</div>' +
      '<div class="btn-row" style="margin-top:10px"><button class="btn tonal sm" data-act="alarm-hide" data-v="' + miss + '">知道了</button><button class="btn filled sm" data-act="app-settings">去设置</button></div></div></section>';
  }

  // 没查到的原因，说给人听（原生端 retryFetch 的 reason，也用于后台查询的 fail:原因）
  function failText(r) {
    return ({
      network: '网络不稳定，没连上学校平台', server: '学校平台出错了，可能在维护', timeout: '学校平台响应太慢',
      'login-timeout': '学校登录响应太慢', session: '学校的登录状态没接上', 'form-timeout': '学校登录页没加载出来',
      'script-error': '自动登录出了点问题', script: '自动登录出了点问题', parse: '没读懂余额页，学校页面可能改版了',
      challenge: '学校要求验证码', rejected: '学校说账号或密码不对', login: '学校要求重新登录', pick: '需要重新选校区',
      room: '需要重新填宿舍号', other: '学校页面跳到了没见过的地方', credentials: '本机保存的账号读不出来', storage: '余额已保存，但本机记录暂时无法显示', webview: '系统网页组件出错', renderer: '学校网页已退出，请重试'
    })[r] || '';
  }
  function failToast(r) {
    if (maint()) return '23:45–00:00 学校系统维护，稍后再试';
    return (failText(r) || '这次没查到') + '，稍后再试';
  }

  // ---------------- 去充值回来 ----------------
  // 从「去充值」离开、十分钟内回到应用：自动查一次，告诉你到账没有（原生端打开微信时记下 p_wxAt）
  let rechWatch = null;
  function checkRechargeReturn() {
    const at = +P().wxAt || 0, d = Date.now() - at;
    if (!at || d < 15e3 || !A || A.cur == null) return;
    setPref('wxAt', '');
    if (d > 10 * 60e3) return;
    rechWatch = { before: A.cur };
    if (['working', 'login', 'pick', 'room'].indexOf(fetchSt) < 0 && H) H.refresh();
  }
  function rechargeResult() {
    const d = A && A.cur != null ? A.cur - rechWatch.before : 0;
    rechWatch = null;
    haptic(d > 0.005 ? 'confirm' : 'tap');
    toast(d > 0.005 ? '检测到余额增加 ¥' + f2(d) : '还没看到到账，学校入账可能要几分钟，稍后下拉刷新看看');
  }

  // ---------------- 假期模式 ----------------
  function awayCardHTML() {
    const cur = awayCur(), now = Date.now(), on = cur && cur[0] <= now, past = aways().filter(x => x[1] <= now).length;
    const body = on
      ? '<p class="hint"><b>假期中</b>，' + md(cur[1]) + '返校。这段时间不发提醒、不在后台查询，也不算进日均用电。</p>' +
        '<div class="btn-row"><button class="btn tonal" data-act="away-edit">改返校日期</button><button class="btn filled" data-act="away-end">我回来了</button></div>'
      : cur
        ? '<p class="hint">已设好：' + md(cur[0]) + '离校，' + md(cur[1]) + '返校，到时自动进入假期模式。</p>' +
          '<div class="btn-row"><button class="btn tonal" data-act="away-cancel">取消</button><button class="btn filled" data-act="away-edit">修改</button></div>'
        : '<p class="hint">放假离校前设一下：这段时间不发提醒、不在后台查询；跨假期的扣费暂不用于预测；日历仍保留耗费，避免把离校期间的用电全算到在校日。' +
          (past ? '已记下 ' + past + ' 次假期。' : '') + '</p><button class="btn tonal wide" data-act="away-edit">设置离校日期</button>';
    return '<div class="section-head"><h2>假期模式</h2>' + (on ? '<span class="badge ok">进行中</span>' : '') + '</div><section class="card">' + body + '</section>';
  }
  // 日期框的值（yyyy-mm-dd）→ 那天中午
  const noonOf = s => { const p = String(s || '').split('-').map(Number); return p.length === 3 && p.every(v => isFinite(v) && v > 0) ? new Date(p[0], p[1] - 1, p[2], 12).getTime() : NaN; };
  function editAway() {
    const cur = awayCur(), now = Date.now(), started = !!(cur && cur[0] <= now);
    haptic('tap');
    sheet({
      icon: '🏖️', title: started ? '改返校日期' : '假期模式', ok: '保存',
      text: started ? '假期从 ' + md(cur[0]) + '开始。' : '离校、返校按当天中午算；离校选今天就从现在算起。',
      html: (started ? '' : '<label class="field-label">离校日期<input class="field" id="awFrom" type="date" value="' + dayKey(cur ? cur[0] : now) + '" min="' + dayKey(now) + '"></label>') +
        '<label class="field-label">返校日期<input class="field" id="awTo" type="date" value="' + dayKey(cur ? cur[1] : now + 7 * DAY) + '" min="' + dayKey(now) + '"></label>',
      onOk: () => {
        const fv = started ? cur[0] : noonOf($('#awFrom').value), t = noonOf($('#awTo').value);
        const f = started ? fv : dayKey(fv) === dayKey(Date.now()) ? Date.now() : Math.max(fv, Date.now());
        const bad = !isFinite(f) || !isFinite(t) ? '请选好日期' : t <= Date.now() ? '返校日期要在以后' : t <= f ? '返校要晚于离校' : t - f > 120 * DAY ? '假期最长 120 天' : '';
        if (bad) { toast(bad); haptic('reject'); return false; }
        // 换掉原来那一段，和新区间重叠的旧记录一并去掉
        saveAways(aways().filter(x => !(cur && x[0] === cur[0] && x[1] === cur[1]) && (x[1] <= f || x[0] >= t)).concat([[f, t]]));
        haptic('confirm');
        render();
        toast(started ? '已改为 ' + md(t) + '返校' : f <= Date.now() + 60e3 ? '已进入假期模式，' + md(t) + '返校' : '已设好，' + md(f) + '起进入假期模式');
      }
    });
  }
  function endAway(cancel) {
    const cur = awayCur(), now = Date.now();
    if (!cur) return;
    // 刚开始不到一小时就回来，或者还没开始就取消：这段不留记录
    const rest = aways().filter(x => !(x[0] === cur[0] && x[1] === cur[1]));
    saveAways(cancel || now - cur[0] < HOUR ? rest : rest.concat([[cur[0], now]]));
    haptic('confirm');
    render();
    toast(cancel ? '已取消' : '欢迎回来，提醒和每日查询已恢复');
    if (!cancel) refresh();
  }

  // ---------------- 分享卡片 ----------------
  // 画一张 1080×1350 的余额卡片（只有宿舍号、余额和统计，不含账号），按当前主题配色
  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function cardCanvas() {
    const W = 1080, HH = 1350, cv = document.createElement('canvas');
    cv.width = W; cv.height = HH;
    const g = cv.getContext('2d');
    const dark = document.documentElement.dataset.theme === 'dark';
    const pr = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#3482FF';
    const C = dark ? { page: '#000000', card: '#1a1a1a', text: '#f0f0f0', muted: '#9a9a9a', soft: '#262626' }
      : { page: '#eef0f3', card: '#ffffff', text: '#1a1a1a', muted: '#737373', soft: '#f3f4f6' };
    const t = tone(), tc = { ok: pr, warn: '#E8930C', err: '#E5484D', unknown: C.muted }[t];
    const font = (w, s) => w + ' ' + s + 'px system-ui, -apple-system, "Noto Sans CJK SC", "PingFang SC", sans-serif';
    const txt = (s, x, y, f, col, al) => { g.font = f; g.fillStyle = col; g.textAlign = al || 'left'; g.fillText(s, x, y); };
    g.fillStyle = C.page; g.fillRect(0, 0, W, HH);
    rr(g, 60, 60, W - 120, HH - 120, 56); g.fillStyle = C.card; g.fill();
    // 顶部：图标 + 应用名，右边查询时间
    g.fillStyle = pr; g.beginPath(); g.arc(142, 156, 34, 0, Math.PI * 2); g.fill();
    g.save(); g.translate(142 - 22, 156 - 22); g.scale(44 / 24, 44 / 24); g.fillStyle = onPrimary(pr); g.fill(new Path2D('M13.4 2.2 4.9 13.6h6.1l-1.3 8.2 8.6-11.6h-6.2l1.3-8Z')); g.restore();
    txt('校园电费', 196, 170, font(600, 40), C.text);
    txt(mdhm(A.h[A.n - 1][0]) + ' 查询', W - 120, 170, font(400, 32), C.muted, 'right');
    // 宿舍
    txt(S.room || '我的宿舍', 120, 310, font(700, 72), C.text);
    if (S.campus) txt(S.campus, 120, 368, font(400, 34), C.muted);
    // 余额
    const tag = balanceTag();
    txt(A.stale ? '上次实测余额 · 已过期 · 元' : '上次实测余额 · 元', 120, 490, font(400, 36), C.muted);
    g.font = font(600, 30); const tw = g.measureText(tag).width + 48;
    rr(g, W - 120 - tw, 452, tw, 52, 26); g.fillStyle = tc; g.globalAlpha = .14; g.fill(); g.globalAlpha = 1;
    txt(tag, W - 120 - tw / 2, 489, font(600, 30), tc, 'center');
    txt('¥', 120, 660, font(600, 76), tc);
    txt(f2(A.cur), 182, 660, font(700, 168), tc);
    wrap(g, balanceSub(), 120, 732, W - 240, 44, font(400, 34), C.text, 2);
    // 三格统计
    const has = Object.keys(A.daily).length > 0, tiles = [
      ['日均用电', A.perDay != null ? '¥' + f2(A.perDay) : '—'],
      ['近 7 天', has ? '¥' + f2(A.week) : '—'],
      ['本月', has ? '¥' + f2(A.month) : '—']
    ], tw3 = (W - 240 - 48) / 3;
    tiles.forEach((x, i) => {
      const x0 = 120 + i * (tw3 + 24);
      rr(g, x0, 830, tw3, 190, 32); g.fillStyle = C.soft; g.fill();
      txt(x[0], x0 + 36, 896, font(400, 32), C.muted);
      txt(x[1], x0 + 36, 972, font(700, 52), C.text);
    });
    // 一句提示：用电异常、假期、充值建议，挑最要紧的
    const away = awayCur(), sp = A.spike && Date.now() - A.spike.t < 2 * DAY ? A.spike : null;
    const note = sp ? '⚠️ ' + spikeText(sp) : away && away[0] <= Date.now() ? '🏖️ 假期中，' + md(away[1]) + '返校' : A.daysLeft != null && !A.stale ? '📆 ' + rechargeHint() : '';
    if (note) wrap(g, note, 120, 1100, W - 240, 48, font(400, 34), C.text, 2);
    g.fillStyle = C.soft; g.fillRect(120, 1196, W - 240, 2);
    txt('余额以学校缴费平台为准 · 由「校园电费」生成', W / 2, 1250, font(400, 28), C.muted, 'center');
    return cv;
  }
  // 按宽度折行（中文逐字断），最多 lines 行，超出加省略号
  function wrap(g, s, x, y, w, lh, f, col, lines) {
    g.font = f; g.fillStyle = col; g.textAlign = 'left';
    const out = [];
    let cur = '';
    for (const ch of s) {
      if (g.measureText(cur + ch).width > w) { out.push(cur); cur = ch; } else cur += ch;
    }
    if (cur) out.push(cur);
    out.slice(0, lines).forEach((l, i) => g.fillText(i === lines - 1 && out.length > lines ? l.slice(0, -1) + '…' : l, x, y + i * lh));
  }
  let cardUrl = '';
  function shareSheet() {
    if (A.cur == null) { toast('先查到余额再分享'); return; }
    haptic('tap');
    try { cardUrl = cardCanvas().toDataURL('image/png'); } catch (e) { toast('卡片生成失败，请稍后再试'); return; }
    sheet({
      title: '分享电费卡片', ok: '关闭', cancel: false,
      html: '<img class="share-preview" src="' + cardUrl + '" alt="电费卡片预览">' +
        '<p class="muted small center">只有宿舍号、余额和用电统计，不含账号信息</p>' +
        '<p class="operation-status hint" role="status" aria-live="polite" data-operation-status></p>' +
        '<div class="btn-row" style="margin-top:14px"><button type="button" class="btn tonal" data-sheet-act="card-save">保存到相册</button><button type="button" class="btn filled" data-sheet-act="card-share">发给室友</button></div>'
    });
  }
  function cardAct(a) {
    if (!cardUrl) { toast('请先生成分享卡片'); return; }
    startOperation(a === 'card-save' ? 'save-image' : 'share-image', a === 'card-save' ? 'saveImageAsync' : 'shareImageAsync', cardUrl);
  }

  // ---------------- 支持作者 ----------------
  // 与「工大学伴」同一套做法：打开满 100 次、且从第一次打开起满 14 天，在刚查到余额或停在「我的」页时弹一次感谢，
  // 先回顾他自己的用电记录，最后才顺带一句奶茶。一辈子最多两次（100、300）；点「不再提醒」、保存过收款码、
  // 或在「我的」页收起了卡片，都不再弹。打开次数只存在本机，也不知道谁打赏了。
  const jp = k => { try { return JSON.parse(P()[k] || '{}') || {}; } catch (e) { return {}; } };
  function countOpen() {
    const o = jp('opens');
    setPref('opens', JSON.stringify({ n: (+o.n || 0) + 1, first: o.first || Date.now() }));
  }
  function thanksDue() {
    const o = jp('opens'), t = jp('thanks'), shownAt = t.shown || [];
    if (P().donateHidden === '1' || t.never || !o.first || Date.now() - o.first < 14 * DAY) return 0;
    return [100, 300].find(n => o.n >= n && shownAt.indexOf(n) < 0 && (n === 100 || shownAt.indexOf(100) >= 0)) || 0;
  }
  // 只在顺心的时候弹：刚查到余额或在「我的」页闲着；正在查询、开着别的弹窗、电费告急、不在前台都不弹
  function maybeThanks(delay) {
    if (!thanksDue()) return;
    setTimeout(() => {
      const n = thanksDue();
      if (n && fetchSt !== 'working' && !$('#sheet').open && !document.hidden && (page === 'home' || page === 'me') && A && tone() !== 'err') thanksDialog(n);
    }, delay);
  }
  function thanksDialog(n) {
    const o = jp('opens'), t = jp('thanks');
    setPref('thanks', JSON.stringify(Object.assign({}, t, { shown: (t.shown || []).concat([n]) })));
    const got = badges();
    if (!got.oldfriend) { got.oldfriend = Date.now(); setPref('badges', JSON.stringify(got)); }
    const recap = A && A.days
      ? '这段时间帮你记了 <b>' + A.days + ' 天</b>的电费' + (A.perDay != null ? '，你平均每天用电 <b>¥' + f2(A.perDay) + '</b>' : '') +
        (A.rech.length ? '，还记下了 <b>' + A.rech.length + ' 次</b>充值' : '') + '。'
      : '谢谢你一直在用它。';
    haptic('confirm');
    sheet({
      icon: '🤝', title: '这是你第 ' + o.n + ' 次打开校园电费', ok: '下次再说', cancel: false,
      html: '<p class="overline thanks-badge">解锁隐藏成就 · 老朋友</p><p class="thanks-recap">' + recap + '</p>' +
        '<p class="small muted">这个小工具是一个同学课余写的，没有广告，也不收集数据。如果它帮到了你，可以请作者喝杯奶茶 🧋（完全随意）</p>' +
        '<button type="button" class="thanks-qr" data-sheet-act="zoom" aria-label="放大收款码"><img src="donate.png" alt="作者的微信收款码"></button>' +
        (H ? '<div class="center"><button type="button" class="btn tonal sm" data-sheet-act="save">保存收款码</button></div>' : '<p class="muted small center">用微信扫一扫</p>') +
        '<button type="button" class="link small sheet-never" data-sheet-act="never">不再提醒</button>'
    });
    confetti();
  }
  function donateCard() {
    if (P().donateHidden === '1') return '';
    return '<div class="section-head"><h2>支持作者</h2><button class="btn text sm" data-act="donate-hide">收起</button></div>' +
      '<section class="card donate"><p class="hint">免费、没有广告、不收集数据。如果它帮到了你，可以请作者喝杯奶茶 🧋，完全随意，不影响任何功能。</p>' +
      '<button class="donate-qr" data-act="qr-zoom" aria-label="放大收款码"><img src="donate.png" alt="作者的微信收款码"></button>' +
      (H ? '<div class="center"><button class="btn tonal sm" data-act="donate-save">保存到相册</button></div><p class="muted small center">保存后在微信「扫一扫」里从相册选择这张图</p>'
         : '<p class="muted small center">用微信扫一扫</p>') + '</section>';
  }
  function saveDonate(fromThanks) {
    if (fromThanks) { const t = jp('thanks'); setPref('thanks', JSON.stringify(Object.assign({}, t, { never: true }))); }
    if (!H) { toast('预览模式：会把收款码保存到相册'); return; }
    let ok = false;
    try { ok = H.saveDonate(); } catch (e) {}
    haptic(ok ? 'confirm' : 'reject');
    toast(ok ? '已保存到相册「校园电费」，在微信扫一扫里从相册选这张图' : '这台手机不能直接保存，请截图后在微信里识别');
  }

  // 第一次查到余额后问一次要不要开通知（已开或已问过就不再问）
  function maybeAskNotify() {
    if (!H || S.notifyAllowed || !notifyOn() || P().notifyAsked === '1' || $('#sheet').open) return;
    setPref('notifyAsked', '1');
    sheet({
      icon: '🔔', title: '开启余额提醒？', ok: '开启', cancel: '以后再说',
      text: '每天' + (bgReady() ? '在后台查一次余额' : '按你的用电记录估算一次') + '：余额低于 ¥' + thr() + '、预计 ' + (alertDays() === '0' ? 3 : alertDays()) + ' 天内用完、用电明显比平时多，或好几天没查时，发一条通知提醒你。每天最多一条。',
      onOk: () => { H.requestNotify(); }
    });
  }

  // ---------------- 底部面板 / 提示 ----------------
  let sheetOk = null, closeT = 0, pendingRender = false, sheetEpoch = 0, closeListener = null;
  function sheet(o) {
    const d = $('#sheet');
    const replacing = d.open, active = d.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = active ? { id: active.id, sheet: active.dataset.sheet, act: active.dataset.act, sheetAct: active.dataset.sheetAct } : null;
    const epoch = ++sheetEpoch;
    // 上一个面板还在收起动画里：取消那次收起，直接换内容，免得新面板被关掉
    clearTimeout(closeT);
    if (closeListener) { d.removeEventListener('animationend', closeListener); closeListener = null; }
    d.classList.remove('closing', 'closing-drag');
    d.innerHTML = '<form method="dialog" class="sheet-body">' + (o.icon ? '<div class="sheet-icon">' + o.icon + '</div>' : '') +
      '<h2>' + esc(o.title) + '</h2>' + (o.text ? '<p>' + esc(o.text).replace(/\n/g, '<br>') + '</p>' : '') + (o.html || '') +
      '<div class="sheet-actions">' + (o.cancel === false ? '' : '<button type="button" class="btn tonal wide" data-sheet="cancel">' + esc(o.cancel || '取消') + '</button>') +
      '<button type="button" class="btn ' + (o.danger ? 'danger-filled' : 'filled') + ' wide" data-sheet="ok">' + esc(o.ok || '好') + '</button></div></form>';
    sheetOk = o.onOk || null;
    if (!d.open) d.showModal();
    operationUI();
    if (replacing) {
      const candidates = Array.from(d.querySelector('form').querySelectorAll('[id],[data-sheet],[data-sheet-act],[data-act]'));
      const target = focusKey && (focusKey.id ? candidates.find(el => el.id === focusKey.id) : focusKey.sheet ? candidates.find(el => el.dataset.sheet === focusKey.sheet) : focusKey.sheetAct ? candidates.find(el => el.dataset.sheetAct === focusKey.sheetAct) : focusKey.act ? candidates.find(el => el.dataset.act === focusKey.act) : null);
      if (target && !target.disabled) target.focus({ preventScroll: true });
      else { d.tabIndex = -1; d.focus({ preventScroll: true }); }
    }
    const inp = d.querySelector('input');
    if (!replacing && inp && inp.type !== 'date') setTimeout(() => { if (epoch === sheetEpoch && d.open) { inp.focus({ preventScroll: true }); inp.select(); } }, 280);
  }
  function closeSheet() {
    const d = $('#sheet');
    if (!d.open || d.classList.contains('closing')) return;
    const epoch = ++sheetEpoch;
    const done = () => {
      if (epoch !== sheetEpoch) return;
      closeListener = null;
      d.classList.remove('closing');
      d.close();
      if (pendingRender) { pendingRender = false; render(); } // 面板开着时到的新数据，关掉后补上
    };
    if (!motionOn()) { done(); return; }
    // 等滑出动画真正播完再关（时长写在样式表里）；计时器只兜底，免得动画没触发时关不掉
    d.classList.add('closing');
    const onEnd = e => { if (e.target !== d || e.animationName !== 'sheet-down') return; d.removeEventListener('animationend', onEnd); clearTimeout(closeT); done(); };
    closeListener = onEnd;
    d.addEventListener('animationend', onEnd);
    closeT = setTimeout(() => { d.removeEventListener('animationend', onEnd); done(); }, 400);
  }
  // 底部面板可以往下拖关：内容滚到顶时按住往下拉，跟手下移、遮罩变淡；拉过 1/4 或甩一下就关，不够就弹回
  function bindSheetDrag() {
    const d = $('#sheet'), drag = { y0: 0, t0: 0, dy: 0, on: false, track: false };
    const reset = () => { d.style.removeProperty('transform'); d.style.removeProperty('--scrim-o'); d.classList.remove('dragging'); };
    d.addEventListener('touchstart', e => {
      drag.track = motionOn() && e.touches.length === 1 && d.scrollTop <= 0 && !e.target.closest('input, textarea, .legal');
      drag.y0 = e.touches[0].clientY; drag.t0 = Date.now(); drag.dy = 0; drag.on = false;
    }, { passive: true });
    d.addEventListener('touchmove', e => {
      if (!drag.track) return;
      const dy = e.touches[0].clientY - drag.y0;
      if (!drag.on) { if (dy < -4 || d.scrollTop > 0) { drag.track = false; return; } if (dy < 8) return; drag.on = true; d.classList.add('dragging'); d.getAnimations().forEach(a => a.finish()); }
      e.preventDefault();
      drag.dy = Math.max(0, dy - 8);
      d.style.transform = 'translateY(' + drag.dy + 'px)';
      d.style.setProperty('--scrim-o', String(Math.max(0, 1 - drag.dy / (d.offsetHeight || 1))));
    }, { passive: false });
    const end = () => {
      if (!drag.on) { drag.track = false; return; }
      drag.on = drag.track = false;
      const fast = drag.dy / Math.max(1, Date.now() - drag.t0) > .6, from = drag.dy;
      d.classList.remove('dragging');
      if (from > d.offsetHeight / 4 || (fast && from > 30)) {
        haptic('tick');
        const a = d.animate([{ transform: 'translateY(' + from + 'px)' }, { transform: 'translateY(' + (d.offsetHeight + 40) + 'px)' }], { duration: 180, easing: EASE.in, fill: 'forwards' });
        d.classList.add('closing-drag');
        let ran = false;
        const fin = () => {
          if (ran) return; ran = true; a.cancel(); reset(); d.classList.remove('closing-drag');
          if (d.open) d.close();
          if (pendingRender) { pendingRender = false; render(); }
        };
        a.finished.then(fin, fin); setTimeout(fin, 300);
      } else {
        d.animate([{ transform: 'translateY(' + from + 'px)' }, { transform: 'none' }], { duration: 360, easing: SPRING.sheet });
        reset();
      }
    };
    d.addEventListener('touchend', end); d.addEventListener('touchcancel', end);
  }

  // 提示排队：每条至少显示 1.5 秒再换下一条（「解锁勋章」不会被紧跟着的「已更新」顶掉）；重复的不排，最多攒 3 条
  let toastT = 0, pumpT = 0, toastAt = 0;
  const toastQ = [];
  function toast(msg) {
    const t = $('#toast');
    if (toastQ.indexOf(msg) >= 0 || (t.textContent === msg && Date.now() - toastAt < 1500)) return;
    toastQ.push(msg);
    if (toastQ.length > 3) toastQ.shift();
    pumpToast();
  }
  function pumpToast() {
    clearTimeout(pumpT);
    if (!toastQ.length) return;
    const wait = toastAt + 1500 - Date.now();
    if (wait > 0) { pumpT = setTimeout(pumpToast, wait); return; }
    const t = $('#toast');
    t.textContent = toastQ.shift();
    t.classList.remove('hide', 'pop', 'out'); void t.offsetWidth; t.classList.add('pop');
    toastAt = Date.now();
    clearTimeout(toastT);
    // 先淡出再隐藏（动效关着时直接隐藏）
    toastT = setTimeout(() => {
      if (!motionOn()) { t.classList.add('hide'); return; }
      t.classList.add('out');
      toastT = setTimeout(() => t.classList.add('hide'), 180);
    }, 2400);
    if (toastQ.length) pumpT = setTimeout(pumpToast, 1500);
  }

  // ---------------- 原生回调 ----------------
  let fetchReason = '';
  function onFetch(st, reason, stateHandled) {
    const prev = fetchSt;
    fetchSt = st;
    if (reason != null) fetchReason = reason;
    renderTop();
    const fl = $('#fetchLine');
    if (fl) fl.innerHTML = fetchLine();
    if (st === 'ok') {
      if (rechWatch) rechargeResult();
      else if (userRefresh) { haptic('confirm'); toast(updatedText()); }
      userRefresh = false;
      setTimeout(maybeAskNotify, 900);
      maybeThanks(2600); // 等「已更新」提示和通知询问之后；有弹窗开着就不弹
    }
    else if (st === 'timeout' || st === 'error') { haptic('reject'); toast(failToast(fetchReason)); userRefresh = false; rechWatch = null; }
    else if (st === 'idle') { userRefresh = false; rechWatch = null; }
    else if (st === 'login' && prev !== 'login') toast('需要登录一下学校账号');
    if (!stateHandled && page === 'home' && A && A.cur == null) render();
  }

  // 刷新成功的提示带上和上一条读数的差
  function updatedText() {
    if (!A || A.n < 2) return '已更新';
    const d = A.h[A.n - 1][1] - A.h[A.n - 2][1];
    if (Date.now() - A.h[A.n - 1][0] > 5 * 60e3) return '已更新，余额没有变化';
    if (d > 0.005) return '已更新，余额净增加 ¥' + f2(d);
    if (d < -0.005) return '已更新，比上次少了 ¥' + f2(-d);
    return '已更新，余额没有变化';
  }

  // Render from one UiState. Progress/latency/revision changes never rebuild charts or settings.
  function contentSignature(state) {
    const { fetch, fetchStep, fetchReason, queryMs, queryRetries, queryId, stateRevision, ...content } = state || {};
    // Submission count is diagnostic; it does not change page content.
    if (content.login) { const { submitted, ...account } = content.login; content.login = account; }
    return JSON.stringify(content);
  }
  function renderKeepingPosition() {
    const x = scrollX, y = scrollY, focused = document.activeElement;
    const key = focused && focused.closest('#content') ? ['id', 'data-act', 'data-v'].map(k => [k, focused.getAttribute(k)]).filter(e => e[1] != null) : [];
    render();
    if (key.length) {
      const match = Array.from($('#content').querySelectorAll('button,input,select')).find(el => key.every(([k,v]) => el.getAttribute(k) === v));
      if (match) match.focus({ preventScroll: true });
    }
    window.scrollTo(x, y);
  }
  let lastSig = '', lastFetchEvent = '', startupDone = false;
  function completeStartup() {
    if (startupDone || S.dataReady === false) return;
    startupDone = true;
    countOpen();
    checkBadges();
    checkRechargeReturn();
    if (P().disclaimer !== DISCLAIMER_VER) setTimeout(() => { if (!$('#sheet').open) disclaimerSheet(true); }, 600);
  }
  window.DF = {
    onState(o) {
      // Revision ordering applies only to the native stream; legacy browser fixtures omit it.
      if (o && o.stateRevision != null && S.stateRevision != null && o.stateRevision < S.stateRevision) return;
      const prefs = S.prefs, previousKey = S.storage && S.storage.activeKey, oldLegacy = legacyCount();
      const previousFetch = fetchSt, sig = contentSignature(o);
      S = o || { hist: [] };
      if (previousKey !== (S.storage && S.storage.activeKey)) { historyLimit = 80; shown = null; shownLv = null; claiming = false; }
      if (claiming && legacyCount() < oldLegacy) { claiming = false; operationUI(); toast('旧记录已归属到当前宿舍'); }
      if (!S.prefs) S.prefs = prefs || {};
      if (S.fetch) fetchSt = S.fetch;
      if (S.fetchReason != null) fetchReason = S.fetchReason;
      const emptyTransition = page === 'home' && A && A.cur == null && previousFetch !== fetchSt;
      if (sig === lastSig && !pendingRender && !emptyTransition) {
        renderTop();
        const fl = $('#fetchLine');
        if (fl) fl.innerHTML = fetchLine();
      } else {
        lastSig = sig;
        applyTheme();
        if ($('#sheet').open) { A = analyze(); pendingRender = true; } else renderKeepingPosition();
        if (startupDone) checkBadges();
      }
      const event = String(S.queryId || 0) + ':' + fetchSt;
      if (event !== lastFetchEvent) {
        lastFetchEvent = event;
        // Effects consume the same snapshot as the balance; resumed/repeated snapshots do not repeat them.
        fetchSt = previousFetch;
        onFetch(S.fetch || 'idle', fetchReason, true);
      }
      completeStartup();
      if (startupDone) checkRechargeReturn();
    },
    onFetch,
    onOperation: finishOperation,
    // 长按图标的「去充值」、还没填公众号时：弹出填写框
    wechat() { goWeChat(); },
    onProgress(step) {
      S.fetchStep = step;
      const line = $('#fetchLine');
      if (line) line.innerHTML = fetchLine();
    },
    back() {
      if ($('#sheet').open) { closeSheet(); return true; }
      if (page !== 'home') { go('home'); return true; }
      return false;
    }
  };

  // ---------------- 交互绑定 ----------------
  function bind() {
    document.addEventListener('click', e => {
      const t = e.target.closest('[data-page],[data-go],[data-act]');
      if (!t || t.closest('dialog')) return;
      if (t.dataset.page) go(t.dataset.page);
      else if (t.dataset.go) go(t.dataset.go);
      else act(t.dataset.act, t);
    });
    const d = $('#sheet');
    d.addEventListener('click', e => {
      if (e.target === d) { closeSheet(); return; }
      // 面板里的小操作（感谢弹窗：放大收款码 / 保存 / 不再提醒）
      const s = e.target.closest('[data-sheet-act]');
      if (s) {
        const a = s.dataset.sheetAct;
        if (a === 'card-save' || a === 'card-share') cardAct(a);
        else if (a === 'zoom') { s.classList.toggle('big'); haptic('tick'); }
        else if (a === 'save') saveDonate(true);
        else if (a === 'never') {
          const t = jp('thanks');
          setPref('thanks', JSON.stringify(Object.assign({}, t, { never: true })));
          haptic('tap'); closeSheet(); toast('好的，不再提醒；「我的」页还能找到收款码');
        }
        return;
      }
      const b = e.target.closest('[data-sheet]');
      if (!b) return;
      if (b.dataset.sheet === 'ok' && sheetOk && sheetOk() === false) return;
      haptic('tap');
      closeSheet();
    });
    d.addEventListener('submit', e => { e.preventDefault(); d.querySelector('[data-sheet=ok]').click(); });
    d.addEventListener('cancel', e => { e.preventDefault(); closeSheet(); });

    window.addEventListener('scroll', () => $('#appbar').classList.toggle('scrolled', window.scrollY > 36), { passive: true });

    // 下拉刷新
    const ptr = $('#ptr'), content = $('#content');
    let y0 = null, dist = 0, armed = false;
    const setPtr = (v, animate) => {
      ptr.style.transition = content.style.transition = animate ? 'transform .28s cubic-bezier(.2,.8,.2,1), opacity .28s' : 'none';
      ptr.style.opacity = Math.min(1, v / 50);
      ptr.style.transform = 'translateY(' + (v - 48) + 'px) rotate(' + v * 3 + 'deg)';
      content.style.transform = v ? 'translateY(' + v * .45 + 'px)' : '';
    };
    window.addEventListener('touchstart', e => {
      // 只在页面内容上下拉才算：点底栏、顶栏、图表时不碰下拉刷新（否则切页那一刻会同时改内容区样式，动画发顿）
      y0 = window.scrollY <= 0 && page !== 'me' && !d.open && !e.target.closest('.chart-svg,.nav,.appbar') ? e.touches[0].clientY : null;
      dist = 0; armed = false;
    }, { passive: true });
    window.addEventListener('touchmove', e => {
      if (y0 == null) return;
      const dy = e.touches[0].clientY - y0;
      if (dy <= 0 || window.scrollY > 0) { if (dist) { dist = 0; setPtr(0); } return; }
      dist = Math.min(130, dy * .5);
      setPtr(dist);
      const nowArmed = dist >= 72;
      if (nowArmed !== armed) { armed = nowArmed; ptr.classList.toggle('armed', armed); if (armed) haptic('tick'); }
    }, { passive: true });
    window.addEventListener('touchend', () => {
      if (y0 == null) return;
      if (armed) refresh();
      y0 = null; dist = 0; armed = false;
      ptr.classList.remove('armed');
      setPtr(0, true);
    });

    if (!H && window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applyTheme(); render(); });
    setInterval(() => { const fl = $('#fetchLine'); if (fl && fetchSt === 'idle') fl.innerHTML = fetchLine(); }, 30e3);
  }

  // ---------------- 预览用演示数据（只在浏览器里、没有 Native 时使用） ----------------
  function demoState() {
    const prefs = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('df_') === 0) prefs[k.slice(3)] = localStorage.getItem(k); } } catch (e) {}
    if (/[?&]empty/.test(location.search)) return { hist: [], prefs };
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const hist = [];
    let b = 63.4, t = Date.now() - 41 * DAY;
    while (t < Date.now() - 3 * HOUR) {
      hist.push([t, Math.round(b * 1e4) / 1e4]);
      const gap = (5 + rnd() * 30) * HOUR;
      b -= gap / DAY * (0.7 + rnd() * 1.2);
      if (b < 14) { hist.push([t + gap * .6, Math.round(b * 1e4) / 1e4]); b += 50; }
      t += gap;
    }
    hist.push([Date.now() - 25 * 60e3, Math.round(b * 1e4) / 1e4]);
    return { hist, room: '99#909', campus: '齐鲁工业大学长清校区', addr: '测试校区.99号楼.909', meter: 'DEMO-METER-001', status: '开户', lastFetch: Date.now() - 25 * 60e3, version: '1.0.0', prefs };
  }
  function demoRefresh() {
    S.fetch = 'working';
    S.queryId = (S.queryId || 0) + 1;
    onFetch('working');
    setTimeout(() => {
      const last = S.hist[S.hist.length - 1] || [Date.now(), 60];
      S.hist.push([Date.now(), Math.max(0, Math.round((last[1] - 0.37) * 1e4) / 1e4)]);
      S.lastFetch = Date.now();
      S.fetch = 'ok';
      window.DF.onState({ ...S });
    }, 1300);
  }

  // ---------------- 免责声明 ----------------
  // 措辞有实质修改时把版本号加一，用户会再看到一次
  const DISCLAIMER_VER = '2';
  const DISCLAIMER = [
    '本应用由个人开发、免费使用，不是齐鲁工业大学或校园缴费平台的官方应用，与它们没有关联，也没有获得其授权或认可。',
    '余额等数据读取自学校缴费平台页面，一切以平台显示为准。日均用电、预计还能用几天、每日估算提醒都是按这台手机上的历史读数推算的，仅供参考，可能与实际不符。',
    '本应用不提供充值或支付功能。充值请通过学校官方渠道办理，「去充值」只是帮你打开微信。',
    '应用里的收款码是作者个人的自愿赞赏方式，与学校和缴费平台无关；打不打赏都不影响任何功能，应用也不会记录谁打赏过。',
    '学校平台改版、维护或网络异常时，本应用可能查不到或显示过期数据。请不要把它当作唯一的用电提醒；因没有及时充值造成的停电等后果，开发者不承担责任。',
    '读数和设置只保存在这台手机上，不会上传到任何服务器。如果你在应用里保存了学校账号，它也只加密保存在本机；请不要在别人或公共的设备上保存。',
    '请自行遵守学校和缴费平台的相关规定，并对自己使用本应用的行为负责。',
    '本应用按现状提供，开发者不对它的可用性、准确性作任何保证。继续使用即表示你已了解并同意以上内容。'
  ];
  function disclaimerSheet(first) {
    sheet({
      icon: '📄', title: first ? '使用前请看一下' : '免责声明', ok: first ? '我已了解' : '知道了', cancel: false,
      html: '<ol class="legal">' + DISCLAIMER.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>',
      onOk: () => { setPref('disclaimer', DISCLAIMER_VER); }
    });
  }

  // ---------------- 启动 ----------------
  if (H) { try { S = JSON.parse(H.getState()); lastSig = contentSignature(S); } catch (e) { S = { hist: [], prefs: {} }; } }
  else S = demoState();
  if (!S.prefs) S.prefs = {};
  if (!H && /[?&]thanks/.test(location.search)) S.prefs.opens = JSON.stringify({ n: 99, first: Date.now() - 20 * DAY }); // 预览：模拟第 100 次
  fetchSt = S.fetch || 'idle';
  if (H) document.documentElement.classList.add('android');
  // 一直开着跨过零点：重算「今天 / 近 7 天 / 本月 / 一句话」（学伴 0.9.11）；开着弹窗就等关掉再画
  (function midnight() {
    const d = new Date(); d.setHours(24, 0, 5, 0);
    setTimeout(() => { quoteIdx = null; quoteTapped = false; if ($('#sheet').open) pendingRender = true; else render(); midnight(); }, d - Date.now());
  })();
  applyTheme();
  bind();
  bindMotion();
  bindSheetDrag();
  render(true);
  completeStartup();
})();
