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
    home: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20H4z"/><path d="M9.5 20v-5.5h5V20"/></svg>'
  };

  let S = { hist: [], prefs: {} };
  let A = null;              // 本次渲染用的统计结果
  let page = 'home';
  let fetchSt = 'idle';
  let userRefresh = false;
  let shown = null;          // 首页大数字当前显示的值（用于滚动动画）
  let shownLv = null;        // 电池液面当前高度
  let range = '30';
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
  const fmtDays = d => d >= 365 ? '一年以上' : d < 1 ? '不到 1 天' : Math.floor(d) + ' 天';
  function hexRgb(h) { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
  function mix(a, b, t) { const x = hexRgb(a), y = hexRgb(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
  function maint() { const d = new Date(); return d.getHours() === 23 && d.getMinutes() >= 45; }

  // ---------------- 设置 ----------------
  const P = () => S.prefs || (S.prefs = {});
  function setPref(k, v) {
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
  const alertDays = () => P().alertDays == null ? '3' : P().alertDays;
  const wxName = () => (P().wxName || '').trim();
  const toggle = (act, on, title, sub) => '<button class="switch-row' + (on ? ' on' : '') + '" data-act="' + act + '"><span><b>' + title + '</b><span class="small muted">' + sub + '</span></span><i class="tgl" aria-hidden="true"></i></button>';
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

  // 日均用电：按实际经过的时间算。每次余额下降，这次的用电量算在「上次余额变化（或第一条读数）到这次」整段时间上，
  // 余额不变的时段也计入（学校余额可能攒一段才扣）。充值的区间不计入，从充值后重新起算；最后一次变化之后还没变的时段不计入。
  // 优先用最近 14 天里结束的段；累计时长不足 12 小时就退回用全部记录，仍不足则算不出。与 Core.java 的 rate() 保持一致。
  const RATE_WINDOW = 14 * DAY, RATE_MIN_SPAN = 12 * HOUR;
  function rate(h, now) {
    let drop = 0, span = 0, dropAll = 0, spanAll = 0, from = 0;
    for (let i = 1; i < h.length; i++) {
      const d = h[i - 1][1] - h[i][1];
      if (d >= -0.0005 && d <= 0.0005) continue;
      if (d > 0) {
        const dt = h[i][0] - h[from][0];
        dropAll += d; spanAll += dt;
        if (h[i][0] >= now - RATE_WINDOW) { drop += d; span += dt; }
      }
      from = i;
    }
    if (span >= RATE_MIN_SPAN) return drop / (span / DAY);
    if (spanAll >= RATE_MIN_SPAN) return dropAll / (spanAll / DAY);
    return null;
  }

  function analyze() {
    const h = (S.hist || []).filter(x => Array.isArray(x) && isFinite(x[0]) && isFinite(x[1])).slice().sort((a, b) => a[0] - b[0]);
    // 用电日历和日均同一口径：每次下降的用电量摊到「上次余额变化到这次」整段时间里（余额不变的日子也分到）
    const n = h.length, daily = {}, rech = [];
    let from = 0;
    for (let i = 1; i < n; i++) {
      const [, b0] = h[i - 1], [t1, b1] = h[i], d = b0 - b1;
      if (d > 0.0005) spread(daily, h[from][0], t1, d);
      else if (d < -0.0005) rech.push({ t: t1, amt: -d, before: b0 });
      else continue;
      from = i;
    }
    const now = Date.now();
    const cur = n ? h[n - 1][1] : null;
    const perDay = rate(h, now);
    // 上次读数离现在超过一天：按日均用电估算「现在」的余额，提醒和可用天数都按估算算（与小组件、每日提醒一致）
    const since = n ? (now - h[n - 1][0]) / DAY : 0;
    const stale = since >= 1;
    const est = cur != null && perDay ? Math.max(0, cur - perDay * since) : cur;
    const daysLeft = perDay && est != null ? Math.max(0, est / perDay) : null;
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
      h, n, daily, rech, cur, perDay, daysLeft, week, lastWeek, prevWeek, month, total, since, stale, est,
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
    if (A.cur == null) return 'ok';
    const a = alerting();
    if (a.low || a.soon) return 'err';
    const near = A.daysLeft != null ? A.daysLeft <= Math.max(7, 2 * +alertDays()) : A.est <= thr() * 2;
    return near ? 'warn' : 'ok';
  }

  // 一句话：只用真实读数和推算结果
  function lines() {
    const L = [];
    if (maint()) L.push(['🛠️', '23:45–00:00 学校系统维护，这段时间查不到是正常的', true]);
    if (A.cur == null) { L.push(['👋', '第一次用？点「查询电费」，登录一次就能记住宿舍']); return L; }
    if (A.stale) L.push(['🕰️', '已经 ' + Math.floor(A.since) + ' 天没查了，下拉刷新看看准数', true]);
    if (A.daysLeft != null) {
      L.push(['⏳', '按最近的用电速度，还能用 ' + fmtDays(A.daysLeft)]);
      L.push(['📆', rechargeHint()]);
    } else L.push(['🌱', '隔几个小时再查一次，读数跨度够半天，就能算出你的用电速度']);
    // 好几天没查时，「今天用了多少」「近 7 天对比」缺最近的读数，算出来会偏小，不说
    if (!A.stale && A.today > 0.005) L.push(['🔌', '今天已经用了约 ¥' + f2(A.today)]);
    if (!A.stale && A.tracked >= 15 && A.prevWeek > 0.01) {
      const p = (A.lastWeek - A.prevWeek) / A.prevWeek * 100;
      if (Math.abs(p) >= 3) L.push([p < 0 ? '📉' : '📈', '近 7 天比之前 7 天' + (p < 0 ? '少' : '多') + '用了 ' + Math.abs(p).toFixed(0) + '%']);
    }
    if (A.rech.length) L.push(['🔋', '已记录 ' + A.rech.length + ' 次充值，最近一次 +¥' + f2(A.rech[A.rech.length - 1].amt)]);
    L.push(['🧾', '已经记了 ' + A.n + ' 次读数，横跨 ' + A.days + ' 天']);
    return L;
  }

  // 「什么时候该充」：按提醒线算，不按用到 0 算（用到 0 那天才充就停电了）
  function rechargeHint() {
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
    if (A.cur == null) return head('电费') + (fetchSt === 'working' ? skeletonHTML() : emptyHTML());
    const t = tone(), lv = level();
    const daysTxt = A.daysLeft == null ? '计算中' : A.daysLeft >= 99 ? '99+ 天' : '约 ' + Math.floor(A.daysLeft) + ' 天';
    const tag = { ok: '电量充足', warn: '有点少了', err: '该充电费了' }[t];
    const sub = A.stale && A.perDay != null
      ? '已经 ' + Math.floor(A.since) + ' 天没查了，按最近的用电速度估算现在约 <b>¥' + f2(A.est) + '</b>，还能用 <b>' + fmtDays(A.daysLeft) + '</b>'
      : A.stale
        ? '已经 ' + Math.floor(A.since) + ' 天没查了，下拉刷新看看准数'
        : A.daysLeft != null
          ? '预计还能用 <b>' + fmtDays(A.daysLeft) + '</b>，' + (A.daysToThr != null && thr() > 0 && A.daysToThr >= 1
            ? '建议 ' + md(Date.now() + A.daysToThr * DAY) + '前充值'
            : md(Date.now() + A.daysLeft * DAY) + '前后用完')
          : '多查几次，就能预测还能用多久';
    return head('电费', '<span class="badge ' + t + '">' + tag + '</span>') +
      '<section class="card hero tone-' + t + '"><div class="hero-row"><div class="hero-main">' +
      '<div class="overline">' + (A.stale ? md(A.h[A.n - 1][0]) + '查到的余额 · 元' : '剩余电费 · 元') + '</div>' +
      '<div class="big"><span class="yen">¥</span><span id="bigNum">' + f2(shown == null ? 0 : shown) + '</span></div>' +
      '<div class="hero-sub">' + sub + '</div></div>' +
      '<div class="battery" aria-hidden="true"><div class="cap"></div><div class="cell">' +
      '<div class="wave w1" style="--lv:' + (shownLv == null ? 0 : shownLv) + '"></div><div class="wave w2" style="--lv:' + (shownLv == null ? 0 : shownLv) + '"></div>' + I.bolt +
      '</div><div class="days">' + daysTxt + '</div></div></div>' +
      '<div class="hero-foot"><span class="fetch-line" id="fetchLine">' + fetchLine() + '</span><button class="btn tonal sm" data-act="wechat">去充值</button></div></section>' +
      alertHTML() +
      monthCardHTML() +
      '<div class="tiles">' +
      tile('日均用电', A.perDay != null ? '¥' + f2(A.perDay) : '积累中', A.perDay != null ? '近两周推算' : '读数还不够') +
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
    const msg = (A.stale ? '按估算现在约 ¥' + f2(A.est) + '，' : '') +
      (low ? '已低于提醒线 ¥' + thr() + (A.daysLeft != null ? '，大约还能用 ' + fmtDays(A.daysLeft) : '') : '按最近的用电速度，大约还能用 ' + fmtDays(A.daysLeft)) +
      (A.stale ? '。先下拉刷新看看准数' : '');
    return '<section class="card alert">' + I.warn + '<div class="alert-body"><b>' + (low ? '余额不多了' : '电费快用完了') + '</b><div class="small">' + msg + '</div></div>' +
      '<button class="btn danger-filled sm" data-act="wechat">去充值</button></section>';
  }
  const tile = (label, val, sub) => '<div class="tile"><div class="tile-label">' + label + '</div><div class="tile-val">' + val + '</div><div class="tile-sub">' + sub + '</div></div>';

  function skeletonHTML() {
    return '<section class="card hero"><p class="muted small" id="fetchLine">' + fetchLine() + '</p><div class="sk" style="width:90px;height:14px"></div><div class="sk" style="width:190px;height:52px;margin:12px 0"></div><div class="sk" style="width:70%;height:14px"></div></section>' +
      '<div class="tiles"><div class="tile"><div class="sk" style="height:44px"></div></div><div class="tile"><div class="sk" style="height:44px"></div></div><div class="tile"><div class="sk" style="height:44px"></div></div></div>';
  }
  function emptyHTML() {
    const msg = fetchSt === 'offline' ? '网络暂时不可用，恢复连接后会自动继续，无需重新输入账号密码。' : fetchSt === 'timeout' || fetchSt === 'error' ? '刚才没查到，可能是网络或学校系统在维护，稍后再试试。' : '登录一次学校账号、选一次宿舍，以后打开就能直接看到余额。';
    return '<section class="card empty"><div class="empty-art">' + I.boltLine + '</div><h2>还没有电费数据</h2><p>' + msg + '</p><button class="btn filled wide" data-act="refresh">查询电费</button></section>' + quoteHTML();
  }

  function fetchLine() {
    switch (fetchSt) {
      case 'offline': return '等待网络恢复，连接后自动继续';
      case 'working': return esc(({
        connect: '正在连接学校平台…', form: '正在等待登录页面…', signin: '正在自动登录…', query: '已连接，正在查询余额…',
        home: '已登录，正在进入校园充值…', campus: '正在选择校区…', room: '正在打开宿舍 ' + (S.room || '') + '…', balance: '马上就好，正在读取余额…',
        retry: '连接暂时异常，正在自动重试…'
      })[S.fetchStep] || '正在查询…');
      case 'login': return '等你登录学校账号…';
      case 'pick': case 'room': return '等你选择宿舍…';
      case 'timeout': case 'error': return '没查到，<button class="link" data-act="refresh">重试</button>';
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
        chip = d > 0.005 ? '<span class="badge ok">充值 +' + f2(d) + '</span>' : d < -0.005 ? '<span class="delta">−' + f2(-d) + '</span>' : '<span class="delta">持平</span>';
      }
      out.push('<div class="rec"><div class="rec-time">' + md(t) + '<div class="muted small">' + hm(t) + '</div></div><div class="rec-val">¥' + f2(b) + '</div><div class="rec-chip">' + chip + '</div></div>');
    }
    return out.join('');
  }

  // ---------------- 月度小结（学伴 0.9.4 的做法）----------------
  // 按月汇总：用电（按相邻读数分摊估算）、有记录覆盖的天数、日均、充值次数和金额；记录不满整月的标出来
  function months() {
    if (!A.n) return [];
    // 用电只能算到最后一次读数为止：覆盖天数也截到那里，否则好几天没查时「本月日均」会被摊薄
    const first = A.h[0][0], now = A.h[A.n - 1][0], out = {};
    const get = k => out[k] || (out[k] = { k, use: 0, rechN: 0, rechAmt: 0 });
    for (const d in A.daily) get(d.slice(0, 7)).use += A.daily[d];
    A.rech.forEach(r => { const m = get(monthKey(r.t)); m.rechN++; m.rechAmt += r.amt; });
    return Object.values(out).map(m => {
      const [y, mo] = m.k.split('-').map(Number);
      const start = new Date(y, mo - 1, 1).getTime(), end = new Date(y, mo, 1).getTime();
      const from = Math.max(start, first), to = Math.min(end, now);
      // 按实际时长算（不取整：2.4 天记成 2 天会把日均抬高两成）；不足一天按一天，免得刚开始记录时日均虚高
      m.covered = Math.max(1, (to - from) / DAY);
      m.partial = from > start + DAY || to < end - DAY;
      m.perDay = m.use / m.covered;
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
    if (prev && prev.perDay > 0.01 && !m.partial && !prev.partial) {
      const p = (m.perDay - prev.perDay) / prev.perDay * 100;
      cmp = Math.abs(p) < 3 ? '，和 ' + prev.label + '差不多' : '，日均比 ' + prev.label + (p < 0 ? '少' : '多') + ' ' + Math.abs(p).toFixed(0) + '%';
    }
    return '<section class="card month-card"><div class="card-head"><h2>📅 ' + m.label + '小结</h2><button class="btn text sm" data-act="month-seen" data-v="' + lm + '">收起</button></div>' +
      '<p class="month-line">用电约 <b>¥' + f2(m.use) + '</b>，日均 <b>¥' + f2(m.perDay) + '</b>' + cmp + '。' +
      (m.rechN ? '充值 ' + m.rechN + ' 次，共 ¥' + f2(m.rechAmt) + '。' : '') + (m.partial ? '<span class="muted">（这个月的记录不全，仅供参考）</span>' : '') + '</p></section>';
  }

  // 统计页：最近几个月（记录只留 120 天，最多 5 个月）的用电对比，日均最高的那个月条最长
  function monthTableHTML() {
    const list = months().filter(m => m.use > 0.01 || m.rechN);
    if (!list.length) return '';
    const max = Math.max.apply(null, list.map(m => m.perDay)) || 1;
    return '<div class="section-head"><h2>月度对比</h2><span class="muted small">日均用电</span></div><section class="card list">' +
      list.map(m => '<div class="rec month-row"><div class="rec-time">' + m.label + (m.partial ? '<div class="muted small">记录不全</div>' : '<div class="muted small">共 ¥' + f2(m.use) + '</div>') + '</div>' +
        '<div class="month-bar"><i style="width:' + Math.max(4, m.perDay / max * 100).toFixed(0) + '%"></i></div>' +
        '<div class="rec-val">¥' + f2(m.perDay) + '</div>' +
        '<div class="rec-chip">' + (m.rechN ? '<span class="badge ok">充值 ' + m.rechN + ' 次</span>' : '') + '</div></div>').join('') +
      '</section>';
  }

  function statsHTML() {
    const top = Object.keys(A.daily).sort((a, b) => A.daily[b] - A.daily[a])[0];
    const rechSum = A.rech.reduce((s, r) => s + r.amt, 0);
    const item = (label, val, sub) => '<div><span>' + label + '</span><b>' + val + '</b>' + (sub ? '<em>' + sub + '</em>' : '') + '</div>';
    return head('统计') +
      '<section class="card"><div class="card-head"><h2>余额走势</h2><div class="seg" id="rangeSeg">' +
      [['7', '7 天'], ['30', '30 天'], ['all', '全部']].map(r => '<button data-act="range" data-v="' + r[0] + '" class="' + (r[0] === range ? 'on' : '') + '">' + r[1] + '</button>').join('') +
      '</div></div><div class="chart" id="chart"></div>' +
      '<div class="chart-legend"><span><i style="background:var(--primary)"></i>余额</span><span><i style="background:var(--ok)"></i>充值</span><span class="muted">每天一个点，按住左右滑动看每天</span></div></section>' +
      '<section class="card"><div class="card-head"><h2>用电日历</h2><div class="cal-nav"><button class="icon-btn" data-act="cal-prev" id="calPrev" aria-label="上个月">' + I.chevL + '</button><span id="calTitle"></span><button class="icon-btn" data-act="cal-next" id="calNext" aria-label="下个月">' + I.chevR + '</button></div></div>' +
      '<div class="cal" id="cal"></div><div class="legend">少<i style="background:var(--heat0)"></i><i style="background:var(--heat1)"></i><i style="background:var(--heat2)"></i><i style="background:var(--heat3)"></i><i style="background:var(--heat4)"></i>多</div>' +
      '<p class="note">每天的用电按相邻两次读数之间平均分摊估算，点格子看当天数值。</p></section>' +
      '<section class="card"><div class="card-head" style="margin-bottom:10px"><h2>汇总</h2></div><div class="sum-grid">' +
      item('累计用电', Object.keys(A.daily).length ? '¥' + f2(A.total) : '—', Object.keys(A.daily).length ? '自 ' + md(A.h[0][0]) + ' 起' : '读数还不够') +
      item('日均用电', A.perDay != null ? '¥' + f2(A.perDay) : '—', A.perDay != null ? '近两周推算' : '读数还不够') +
      item('单日最多', top ? '¥' + f2(A.daily[top]) : '—', top ? md(new Date(top.replace(/-/g, '/')).getTime()) : '') +
      item('充值', A.rech.length + ' 次', A.rech.length ? '共 ¥' + f2(rechSum) : '还没记录到') +
      item('读数', A.n + ' 次', '横跨 ' + A.days + ' 天') +
      item('提醒线', '¥' + thr(), '在「我的」里修改') + '</div></section>' +
      monthTableHTML() +
      '<div class="section-head"><h2>全部记录</h2><span class="muted small">共 ' + A.n + ' 条</span></div>' +
      '<section class="card list">' + recordsHTML(80) + '</section>';
  }

  function meHTML() {
    const got = badges(), shownBadges = BADGES.filter(b => !b.hidden || got[b.id]), n = shownBadges.filter(b => got[b.id]).length;
    const seg = (act, cur, opts) => '<div class="seg full">' + opts.map(o => '<button data-act="' + act + '" data-v="' + o[0] + '" class="' + (o[0] === cur ? 'on' : '') + '">' + o[1] + '</button>').join('') + '</div>';
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
      '<div class="section-head"><h2>每日提醒</h2></div>' +
      '<section class="card">' + toggle('auto', autoOn(), '每天按记录估算一次', autoOn() ? (S.nextAuto ? '下次 ' + mdhm(S.nextAuto) + ' 左右；当天查过就不打扰' : '当天查过就不打扰') : '关闭后不发估算提醒') +
      (autoOn() ? '<div class="row-label">提醒时间</div><div class="chip-row">' + ['08:00', '12:00', '18:00', '22:00'].map(v => '<button class="chip' + (v === autoTime() ? ' on' : '') + '" data-act="autoTime" data-v="' + v + '">' + v + '</button>').join('') + '</div>' +
        '<p class="hint" style="margin-top:14px">每日提醒按本机记录估算，不在后台联网。打开应用时会查询余额；开启自动登录后会按需重新登录。这里按你最近的用电速度估算今天大约还剩多少：估算快用完了，或已经 3 天以上没查，就发通知提醒你打开看看。</p>' +
        '<p class="hint">小米、红米等手机要在系统设置里允许「自启动」，提醒才会准时。</p><button class="btn tonal sm" data-act="app-settings">打开系统设置</button>' : '') +
      '</section>' +
      '<div class="section-head"><h2>余额提醒</h2></div>' +
      '<section class="card">' + toggle('notify', notifyOn(), '通知提醒', notifyOn() && H && !S.notifyAllowed ? '<span class="warn-text">通知权限没开，点右边开关去开启</span>' : '估算快用完或好几天没查时发通知，每天最多一次') +
      '<div class="row-label">提醒线</div><p class="hint">余额低于这个数时首页变红；每日估算低于它时发通知</p><div class="chip-row">' +
      preset.map(v => '<button class="chip' + (v === t ? ' on' : '') + '" data-act="thr" data-v="' + v + '">¥' + v + '</button>').join('') +
      '<button class="chip' + (preset.indexOf(t) < 0 ? ' on' : '') + '" data-act="thr-custom">' + (preset.indexOf(t) < 0 ? '¥' + t : '自定义') + '</button></div>' +
      '<div class="row-label">快用完时提前提醒</div><div class="chip-row">' + [['0', '不提醒'], ['1', '1 天内'], ['3', '3 天内'], ['5', '5 天内']].map(o => '<button class="chip' + (o[0] === alertDays() ? ' on' : '') + '" data-act="alertDays" data-v="' + o[0] + '">' + o[1] + '</button>').join('') + '</div>' +
      '</section>' +
      '<div class="section-head"><h2>去充值</h2></div>' +
      '<section class="card"><div class="wx-row"><div><div class="small muted">充值用的公众号</div><div class="wx-name">' + (wxName() ? esc(wxName()) : '还没填写') + '</div></div><button class="btn text sm" data-act="wx-edit">' + (wxName() ? '修改' : '填写') + '</button></div>' +
      '<button class="btn filled wide" data-act="wechat">打开微信去充值</button>' +
      '<p class="hint" style="margin:12px 0 0">会先复制公众号名称，打开微信后在搜索框粘贴即可。' + (H && S.wechat === false ? '<span class="warn-text">没检测到微信。</span>' : '') + '本应用只查余额，不经手任何支付。</p></section>' +
      '<div class="section-head"><h2>外观</h2></div>' +
      '<section class="card"><div class="row-label">主题</div>' + seg('theme', theme(), [['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']]) +
      '<div class="row-label"><span>主题色</span><span class="muted small">' + acName + '</span></div><div class="swatches">' +
      ACCENTS.map(a => '<button class="sw' + (a[0] === accent() ? ' on' : '') + '" data-act="accent" data-v="' + a[0] + '" style="--c:' + a[1] + '" aria-label="' + a[2] + '"></button>').join('') + '</div>' +
      '<div class="row-label">动效</div>' + seg('motion', P().motion === 'off' ? 'off' : 'on', [['on', '标准'], ['off', '减少']]) + '</section>' +
      '<div class="section-head"><h2>数据</h2></div>' +
      '<section class="card"><p class="hint">共 ' + A.n + ' 条读数，只保存在这台手机上，不会上传到任何地方。换手机前可以先导出一份。</p>' +
      (A.n ? '<button class="btn tonal wide" data-act="export">导出记录（CSV 表格）</button><div style="height:10px"></div>' : '') +
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
    $$('#rangeSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === range));
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
    lo = Math.max(0, lo - pv); hi += pv;
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

  // ---------------- 渲染 ----------------
  function renderTop() {
    const working = fetchSt === 'working';
    $('#progress').hidden = !working;
    $('#refreshBtn').classList.toggle('spin', working);
    $('#roomText').textContent = S.room || '未设置宿舍';
    const dot = $('#roomDot');
    dot.className = 'dot' + (S.lastFetch ? (Date.now() - S.lastFetch < 3 * HOUR ? ' ok' : ' warn') : '');
    $('#pageName').textContent = { home: '电费', stats: '统计', me: '我的' }[page];
    $$('#nav button').forEach(b => { if (b.dataset.page === page) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
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
  }

  function afterHome() {
    if (A.cur == null) return;
    const lv = level();
    requestAnimationFrame(() => requestAnimationFrame(() => $$('.wave').forEach(w => w.style.setProperty('--lv', lv))));
    shownLv = lv;
    const el = $('#bigNum'), to = A.cur, from = shown == null ? 0 : shown;
    shown = to;
    if (!el) return;
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
        toast(autoOn() ? '已开启，每天 ' + autoTime() + ' 左右按记录估算一次' : '已关闭每日提醒');
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
      case 'wx-edit': editWx(false); break;
      case 'disclaimer': haptic('tap'); disclaimerSheet(false); break;
      case 'month-seen': setPref('monthSeen', t.dataset.v); haptic('tick'); render(); toast('统计页的「月度对比」里随时能看'); break;
      case 'donate-hide': setPref('donateHidden', '1'); haptic('tick'); render(); toast('已收起，页面最底下的「支持作者」可以重新打开'); break;
      case 'donate-show': setPref('donateHidden', '0'); haptic('tick'); render(); break;
      case 'donate-save': saveDonate(false); break;
      case 'export': {
        haptic('tap');
        if (!H || !H.exportCsv) { toast('预览模式：会把 ' + A.n + ' 条读数存成 CSV 表格'); break; }
        let r = 'fail';
        try { r = H.exportCsv(); } catch (e) {}
        haptic(r === 'fail' ? 'reject' : 'confirm');
        toast({ saved: '已存到「下载/校园电费」，可用 WPS 或 Excel 打开', shared: '选一个应用保存或发送', empty: '还没有记录可以导出' }[r] || '导出失败，请稍后再试');
        break;
      }
      case 'qr-zoom':
        haptic('tap');
        sheet({ title: '作者的微信收款码', html: '<img class="qr-big" src="donate.png" alt="作者的微信收款码">' + (H ? '' : '<p class="muted small center">用微信扫一扫</p>'), ok: '关闭', cancel: false });
        break;
      case 'reset-room':
        sheet({
          icon: '🏠', title: S.room ? '换个宿舍？' : '选择宿舍', ok: '去选择',
          text: '会打开学校的缴费页面，选校区、填宿舍号后自动回来。之前的读数会保留。',
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
      text: '每天按你的用电记录估算一次：估算低于 ¥' + thr() + '、预计 ' + (alertDays() === '0' ? 3 : alertDays()) + ' 天内用完，或好几天没查时，发一条通知提醒你。每天最多一条。',
      onOk: () => { H.requestNotify(); }
    });
  }

  // ---------------- 底部面板 / 提示 ----------------
  let sheetOk = null, closeT = 0, pendingRender = false;
  function sheet(o) {
    const d = $('#sheet');
    // 上一个面板还在收起动画里：取消那次收起，直接换内容，免得新面板被关掉
    clearTimeout(closeT);
    d.classList.remove('closing');
    d.innerHTML = '<form method="dialog" class="sheet-body">' + (o.icon ? '<div class="sheet-icon">' + o.icon + '</div>' : '') +
      '<h2>' + esc(o.title) + '</h2>' + (o.text ? '<p>' + esc(o.text).replace(/\n/g, '<br>') + '</p>' : '') + (o.html || '') +
      '<div class="sheet-actions">' + (o.cancel === false ? '' : '<button type="button" class="btn tonal wide" data-sheet="cancel">' + esc(o.cancel || '取消') + '</button>') +
      '<button type="button" class="btn ' + (o.danger ? 'danger-filled' : 'filled') + ' wide" data-sheet="ok">' + esc(o.ok || '好') + '</button></div></form>';
    sheetOk = o.onOk || null;
    if (!d.open) d.showModal();
    const inp = d.querySelector('input');
    if (inp) setTimeout(() => { inp.focus(); inp.select(); }, 280);
  }
  function closeSheet() {
    const d = $('#sheet');
    if (!d.open || d.classList.contains('closing')) return;
    const done = () => {
      d.classList.remove('closing');
      d.close();
      if (pendingRender) { pendingRender = false; render(); } // 面板开着时到的新数据，关掉后补上
    };
    if (!motionOn()) { done(); return; }
    d.classList.add('closing');
    closeT = setTimeout(done, 170);
  }

  let toastT = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hide', 'pop'); void t.offsetWidth; t.classList.add('pop');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.add('hide'), 2400);
  }

  // ---------------- 原生回调 ----------------
  function onFetch(st) {
    const prev = fetchSt;
    fetchSt = st;
    renderTop();
    const fl = $('#fetchLine');
    if (fl) fl.innerHTML = fetchLine();
    if (st === 'ok') {
      if (userRefresh) { haptic('confirm'); toast(updatedText()); }
      userRefresh = false;
      setTimeout(maybeAskNotify, 900);
      maybeThanks(2600); // 等「已更新」提示和通知询问之后；有弹窗开着就不弹
    }
    else if (st === 'timeout' || st === 'error') { haptic('reject'); toast(maint() ? '23:45–00:00 学校系统维护，稍后再试' : '这次没查到，稍后再试试'); userRefresh = false; }
    else if (st === 'idle') userRefresh = false;
    else if (st === 'login' && prev !== 'login') toast('需要登录一下学校账号');
    if (page === 'home' && A && A.cur == null) render();
  }

  // 刷新成功的提示带上和上一条读数的差
  function updatedText() {
    if (!A || A.n < 2) return '已更新';
    const d = A.h[A.n - 1][1] - A.h[A.n - 2][1];
    if (Date.now() - A.h[A.n - 1][0] > 5 * 60e3) return '已更新，余额没有变化';
    if (d > 0.005) return '已更新，比上次多了 ¥' + f2(d) + '（充值到账）';
    if (d < -0.005) return '已更新，比上次少了 ¥' + f2(-d);
    return '已更新，余额没有变化';
  }

  window.DF = {
    onState(o) {
      const prefs = S.prefs;
      S = o || { hist: [] };
      if (!S.prefs) S.prefs = prefs || {};
      if (S.fetch && S.fetch !== fetchSt) fetchSt = S.fetch;
      applyTheme();
      if ($('#sheet').open) { A = analyze(); pendingRender = true; } else render();
      checkBadges();
    },
    onFetch,
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
        if (a === 'zoom') { s.classList.toggle('big'); haptic('tick'); }
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
    return { hist, room: '20#340', campus: '齐鲁工业大学长清校区', addr: '长清校区学生公寓.20#学生公寓.3楼.340', meter: '001600291874', status: '开户', lastFetch: Date.now() - 25 * 60e3, version: '1.0.0', prefs };
  }
  function demoRefresh() {
    onFetch('working');
    setTimeout(() => {
      const last = S.hist[S.hist.length - 1] || [Date.now(), 60];
      S.hist.push([Date.now(), Math.max(0, Math.round((last[1] - 0.37) * 1e4) / 1e4)]);
      S.lastFetch = Date.now();
      window.DF.onState(S);
      onFetch('ok');
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
  if (H) { try { S = JSON.parse(H.getState()); } catch (e) { S = { hist: [], prefs: {} }; } }
  else S = demoState();
  if (!S.prefs) S.prefs = {};
  if (!H && /[?&]thanks/.test(location.search)) S.prefs.opens = JSON.stringify({ n: 99, first: Date.now() - 20 * DAY }); // 预览：模拟第 100 次
  fetchSt = S.fetch || 'idle';
  countOpen();
  if (H) document.documentElement.classList.add('android');
  // 一直开着跨过零点：重算「今天 / 近 7 天 / 本月 / 一句话」（学伴 0.9.11）；开着弹窗就等关掉再画
  (function midnight() {
    const d = new Date(); d.setHours(24, 0, 5, 0);
    setTimeout(() => { quoteIdx = null; quoteTapped = false; if ($('#sheet').open) pendingRender = true; else render(); midnight(); }, d - Date.now());
  })();
  applyTheme();
  bind();
  render(true);
  checkBadges();
  if (P().disclaimer !== DISCLAIMER_VER) setTimeout(() => { if (!$('#sheet').open) disclaimerSheet(true); }, 600);
})();
