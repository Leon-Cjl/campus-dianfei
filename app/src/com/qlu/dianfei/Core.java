package com.qlu.dianfei;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.Locale;

/**
 * 共用部分：驱动脚本、读数存储、用电速度推算、每日估算提醒与闹钟。
 * 读数统计的算法与 assets/app.js 里的 analyze() 保持一致。
 */
final class Core {
    private Core() {}

    // 从「校园充值」列表进入：本次打开期间已经登录时直接往下走，不会经过登录页
    // （打开首页或登录页会让服务器端的登录失效，所以不能每次都从首页进）。
    // 应用重启后 sessionStorage 里没有登录信息（loginData），页面只会是空白——驱动脚本一发现就转去首页登录，
    // 登录后落在「校园服务」首页（SL300000），再接着往下点。
    static final String ENTRY_URL =
            "https://qlgydx.mp.sinojy.cn/SL320000?ssoType=true&loginByInterface=true";
    static final String HOME_URL = "https://qlgydx.mp.sinojy.cn/";
    static final String LOGIN_URL = "https://qlgydx.mp.sinojy.cn/SL200000";
    static final String WECHAT = "com.tencent.mm";
    static final String ACTION_WECHAT = "com.qlu.dianfei.OPEN_WECHAT";
    static final String ACTION_REFRESH = "com.qlu.dianfei.REFRESH";
    static final String CH_ALERT = "alert", CH_LOGIN = "login", CH_USAGE = "usage";
    static final int N_ALERT = 1, N_LOGIN = 2, N_USAGE = 3;
    static final int REQ_ALARM = 7002;
    private static final int HIST_CAP = 800;
    private static final long HOUR = 3600 * 1000L, DAY = 24 * HOUR;

    static SharedPreferences sp(Context c) {
        return c.getSharedPreferences("df", Context.MODE_PRIVATE);
    }

    /** 界面里的设置统一存成 p_<key> 字符串 */
    static String pref(Context c, String k, String def) {
        return sp(c).getString("p_" + k, def);
    }

    private static double num(String s, double def) {
        try { return Double.parseDouble(s); } catch (Exception e) { return def; }
    }

    // ---------------- 驱动脚本 ----------------

    // 每 0.6 秒看一次当前在哪一步，能自动推进就推进，推进不了就报告需要用户操作。
    // 只会点「校区」卡片和「下一步」，余额页只读文字，不碰金额输入和「立即支付」；登录页报告状态，由原生端按本机账号设置决定是否自动登录。
    static boolean isSchoolUrl(String url) {
        if (url == null) return false;
        try {
            Uri u = Uri.parse(url);
            return "https".equalsIgnoreCase(u.getScheme()) && "qlgydx.mp.sinojy.cn".equalsIgnoreCase(u.getHost())
                    && u.getUserInfo() == null && (u.getPort() == -1 || u.getPort() == 443);
        } catch (Exception ex) { return false; }
    }

    static boolean isSchoolLogin(String url) {
        return isSchoolUrl(url) && "/SL200000".equals(Uri.parse(url).getPath().replaceAll("/+$", ""));
    }

    private static String driverScript;

    static String asset(Context c, String name) throws Exception {
        try (java.io.InputStream in = c.getAssets().open(name);
             java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
            byte[] buf = new byte[4096]; int n;
            while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            return new String(out.toByteArray(), java.nio.charset.StandardCharsets.UTF_8);
        }
    }

    static void injectDriver(Context c, WebView w, String token) {
        if (!isSchoolUrl(w.getUrl())) return;
        try {
            if (driverScript == null) driverScript = asset(c, "driver.js");
            SharedPreferences p = sp(c);
            String config = "window.__DF_RUN__=" + JSONObject.quote(token) +
                    ";window.__DF_ROOM__=" + JSONObject.quote(p.getString("room", "")) +
                    ";window.__DF_CAMPUS__=" + JSONObject.quote(p.getString("campus", "")) + ";";
            w.evaluateJavascript(config + driverScript, null);
        } catch (Exception ex) { android.util.Log.w("dianfei", "driver asset unavailable"); }
    }

    static void stopScripts(WebView w) {
        w.evaluateJavascript("if(window.__DF_STOP_DRIVER__)window.__DF_STOP_DRIVER__();if(window.__DF_LOGIN__)window.__DF_LOGIN__.cancel();", null);
    }

    // ---------------- 读数 ----------------

    /** 保存余额页抓到的结果，返回余额 */
    static double saveResult(Context c, String json) throws Exception {
        JSONObject d = new JSONObject(json);
        double bal = Double.parseDouble(d.optString("balance", "").replaceAll("[^0-9.\\-]", ""));
        SharedPreferences.Editor e = sp(c).edit();
        for (String k : new String[]{"room", "campus", "addr", "meter", "status"}) {
            String v = d.optString(k, "");
            if (!v.isEmpty()) e.putString(k, v);
        }
        e.putLong("lastFetch", System.currentTimeMillis());
        e.apply();
        addReading(c, bal);
        DianfeiWidget.update(c);
        return bal;
    }

    private static void addReading(Context c, double bal) {
        try {
            SharedPreferences p = sp(c);
            JSONArray a = new JSONArray(p.getString("hist", "[]"));
            long now = System.currentTimeMillis();
            if (a.length() > 0) {
                JSONArray last = a.getJSONArray(a.length() - 1);
                // 与上次相同且间隔很短：不重复记录
                if (Math.abs(last.getDouble(1) - bal) < 1e-6 && now - last.getLong(0) < 20 * 60 * 1000L) return;
            }
            JSONArray e = new JSONArray();
            e.put(now);
            e.put(bal);
            a.put(e);
            p.edit().putString("hist", compact(a, now).toString()).apply();
        } catch (Exception ignore) {}
    }

    private static final long KEEP_DAYS = 120;

    /**
     * 控制记录体积：只留最近 120 天（最新一条无论多久都保留）；余额没变的一段里，同一天只留第一条和这段的最后一条；
     * 总数再超过上限从最老的删起。
     * 去掉的只是「余额不变区间」中间的点，日均用电、用电日历、充值识别都只看余额变化的区间，结果不受影响
     * （tests/CompactTest 验证）。每天至少留一条，按天计数的勋章也不受影响。
     */
    static boolean[] compactKeep(long[] t, double[] b, long now) {
        int n = t.length;
        boolean[] keep = new boolean[n];
        long cutoff = now - KEEP_DAYS * DAY;
        int prev = -1;
        for (int i = 0; i < n; i++) {
            if (t[i] < cutoff) continue;
            boolean flatWithPrev = prev >= 0 && Math.abs(b[i] - b[prev]) < 1e-6;
            boolean flatWithNext = i + 1 < n && Math.abs(b[i + 1] - b[i]) < 1e-6;
            if (flatWithPrev && flatWithNext && dayKey(t[i]).equals(dayKey(t[prev]))) continue;
            keep[i] = true;
            prev = i;
        }
        // 最新一条永远保留：很久没查时也不至于把「上次的余额」一起删掉
        if (n > 0) keep[n - 1] = true;
        int kept = 0;
        for (boolean k : keep) if (k) kept++;
        for (int i = 0; i < n - 1 && kept > HIST_CAP; i++) if (keep[i]) { keep[i] = false; kept--; }
        return keep;
    }

    private static JSONArray compact(JSONArray a, long now) throws Exception {
        int n = a.length();
        long[] t = new long[n];
        double[] b = new double[n];
        for (int i = 0; i < n; i++) { t[i] = a.getJSONArray(i).getLong(0); b[i] = a.getJSONArray(i).getDouble(1); }
        boolean[] keep = compactKeep(t, b, now);
        JSONArray out = new JSONArray();
        for (int i = 0; i < n; i++) if (keep[i]) out.put(a.getJSONArray(i));
        return out;
    }

    /** 启动时整理一次已有记录（旧版本没有压缩，记录可能已经比较多） */
    static void compactStored(Context c) {
        try {
            SharedPreferences p = sp(c);
            JSONArray a = new JSONArray(p.getString("hist", "[]"));
            JSONArray out = compact(a, System.currentTimeMillis());
            if (out.length() != a.length()) p.edit().putString("hist", out.toString()).apply();
        } catch (Exception ignore) {}
    }

    /** 全部读数导出成 CSV 文本（不含 BOM）；没有记录返回 null */
    static String historyCsv(Context c) throws Exception {
        JSONArray a = new JSONArray(sp(c).getString("hist", "[]"));
        if (a.length() == 0) return null;
        java.text.SimpleDateFormat f = new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.CHINA);
        String room = sp(c).getString("room", "").replace("\"", "\"\"");
        StringBuilder s = new StringBuilder("时间,宿舍,余额（元）,与上一条相比（元）,说明\r\n");
        double prev = Double.NaN;
        for (int i = 0; i < a.length(); i++) {
            JSONArray e = a.getJSONArray(i);
            double b = e.getDouble(1), d = b - prev;
            String note = Double.isNaN(prev) ? "首条" : d > 0.005 ? "充值" : d < -0.005 ? "用电" : "持平";
            s.append(f.format(new java.util.Date(e.getLong(0)))).append(",\"").append(room).append("\",")
                    .append(String.format(Locale.US, "%.2f", b)).append(',')
                    .append(Double.isNaN(prev) ? "" : "持平".equals(note) ? "0.00" : String.format(Locale.US, "%+.2f", d)).append(',')
                    .append(note).append("\r\n");
            prev = b;
        }
        return s.toString();
    }

    // ---------------- 假期 ----------------

    private static final long[][] NO_AWAY = new long[0][];

    /** 界面里设的离校区间（p_away，JSON [[离校, 返校], …] 毫秒）：这段时间不提醒、不自动查询，也不算进日均 */
    static long[][] aways(Context c) {
        try {
            JSONArray a = new JSONArray(pref(c, "away", "[]"));
            long[][] out = new long[a.length()][];
            int n = 0;
            for (int i = 0; i < a.length(); i++) {
                long f = a.getJSONArray(i).getLong(0), t = a.getJSONArray(i).getLong(1);
                if (t > f) out[n++] = new long[]{f, t};
            }
            return java.util.Arrays.copyOf(out, n);
        } catch (Exception e) { return NO_AWAY; }
    }

    /** [a, b] 与各假期区间重叠的总时长 */
    static long awayOverlap(long[][] aw, long a, long b) {
        long s = 0;
        for (long[] x : aw) { long lo = Math.max(a, x[0]), hi = Math.min(b, x[1]); if (hi > lo) s += hi - lo; }
        return s;
    }

    static boolean awayNow(Context c, long now) {
        for (long[] x : aways(c)) if (now >= x[0] && now < x[1]) return true;
        return false;
    }

    private static final long RATE_WINDOW = 14 * DAY, RATE_MIN_SPAN = 12 * HOUR;

    static double rate(long[] t, double[] b, long now) { return rate(t, b, now, NO_AWAY); }

    /**
     * 日均用电：按实际经过的时间算。每次余额下降，用电量算在「上次余额变化（或第一条读数）到这次」整段时间上，
     * 余额不变的时段也计入；充值的区间不计入，从充值后重新起算；最后一次变化之后还没变的时段不计入。
     * 设过的假期从时长里扣掉，14 天窗口也往前顺延同样长（放假回来后日均不会被离校那几天拉低）。
     * 优先用最近 14 天里结束的段；累计时长不足 12 小时就退回用全部记录，仍不足返回 NaN。
     * 与 assets/app.js 的 rate() 保持一致（tests/RateTest 对拍）。
     */
    static double rate(long[] t, double[] b, long now, long[][] aw) {
        double drop = 0, dropAll = 0;
        long span = 0, spanAll = 0;
        long start = now - RATE_WINDOW - awayOverlap(aw, now - RATE_WINDOW, now);
        int from = 0;
        for (int i = 1; i < t.length; i++) {
            double d = b[i - 1] - b[i];
            if (d >= -0.0005 && d <= 0.0005) continue;
            if (d > 0) {
                long dt = Math.max(0, t[i] - t[from] - awayOverlap(aw, t[from], t[i]));
                dropAll += d;
                spanAll += dt;
                if (t[i] >= start) { drop += d; span += dt; }
            }
            from = i;
        }
        if (span >= RATE_MIN_SPAN) return drop / ((double) span / DAY);
        if (spanAll >= RATE_MIN_SPAN) return dropAll / ((double) spanAll / DAY);
        return Double.NaN;
    }

    private static final long SPIKE_MIN = 20 * HOUR, SPIKE_MAX = 84 * HOUR;

    /**
     * 用电异常：最后一次余额下降往前凑够至少 20 小时（不跨充值），这段的用电速度和这段之前的日均比。
     * 速度达到平时 2 倍以上、且比平时多用 ¥2 以上才算，返回 {这段用电, 天数, 倍数, 结束时间}；否则 null。
     * 跨度超过 3.5 天说明查得太稀，看不出是哪天用多的，也不算。与 app.js 的 spike() 对拍。
     */
    static double[] spike(long[] t, double[] b, long[][] aw) {
        int n = t.length, i = n - 1;
        while (i > 0 && Math.abs(b[i] - b[i - 1]) <= 0.0005) i--;
        if (i <= 0 || b[i] > b[i - 1]) return null;
        int s = i;
        while (s > 0) {
            int p = s - 1;
            while (p > 0 && Math.abs(b[p] - b[p - 1]) <= 0.0005) p--;
            if (s != i && b[s] > b[s - 1]) break; // s 是充值点：从充值后算起
            s = p;
            if (t[i] - t[s] >= SPIKE_MIN) break;
        }
        long dt = t[i] - t[s] - awayOverlap(aw, t[s], t[i]);
        if (t[i] - t[s] < SPIKE_MIN || dt < SPIKE_MIN || dt > SPIKE_MAX) return null;
        double base = rate(java.util.Arrays.copyOf(t, s + 1), java.util.Arrays.copyOf(b, s + 1), t[s], aw);
        if (Double.isNaN(base) || base <= 0.05) return null;
        double use = b[s] - b[i], days = dt / (double) DAY, ratio = use / days / base;
        if (ratio < 2 || use - base * days < 2) return null;
        return new double[]{use, days, ratio, t[i]};
    }

    private static long[] times(JSONArray a) throws Exception {
        long[] t = new long[a.length()];
        for (int i = 0; i < t.length; i++) t[i] = a.getJSONArray(i).getLong(0);
        return t;
    }

    private static double[] values(JSONArray a) throws Exception {
        double[] b = new double[a.length()];
        for (int i = 0; i < b.length; i++) b[i] = a.getJSONArray(i).getDouble(1);
        return b;
    }

    /**
     * {上次读数, 日均用电, 估算现在的余额, 估算还能用几天}；算不出来的项为 NaN。
     * 上次读数之后按日均往下扣，假期里的时间不扣（和界面、小组件、每日提醒同一个口径）。
     */
    static double[] estimate(Context c, long now) {
        double cur = Double.NaN, perDay = Double.NaN, est = Double.NaN, days = Double.NaN;
        try {
            JSONArray a = new JSONArray(sp(c).getString("hist", "[]"));
            long[] t = times(a);
            double[] b = values(a);
            long[][] aw = aways(c);
            if (t.length > 0) {
                cur = b[t.length - 1];
                long last = t[t.length - 1];
                perDay = rate(t, b, now, aw);
                double since = Math.max(0, now - last - awayOverlap(aw, last, now)) / (double) DAY;
                est = Double.isNaN(perDay) ? cur : Math.max(0, cur - perDay * since);
                if (!Double.isNaN(perDay) && perDay > 0) days = est / perDay;
            }
        } catch (Exception ignore) {}
        return new double[]{cur, perDay, est, days};
    }

    /** 最近一段用电异常（见 spike）；没有返回 null */
    static double[] spike(Context c) {
        try {
            JSONArray a = new JSONArray(sp(c).getString("hist", "[]"));
            return spike(times(a), values(a), aways(c));
        } catch (Exception e) { return null; }
    }

    /** 启动时的数据整理：0.3 版把提醒线存成 float「thr」，统一迁到 p_thr；顺带按保留规则压缩一次记录 */
    static void migrate(Context c) {
        compactStored(c);
        SharedPreferences p = sp(c);
        if (!p.contains("thr")) return;
        SharedPreferences.Editor e = p.edit();
        try {
            if (!p.contains("p_thr")) e.putString("p_thr", trim(p.getFloat("thr", 10f)));
        } catch (Exception ignore) {}
        e.remove("thr").apply();
    }

    // ---------------- 通知 ----------------

    static boolean notifyAllowed(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return false;
        if (Build.VERSION.SDK_INT >= 33 &&
                c.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED)
            return false;
        return nm.areNotificationsEnabled();
    }

    static void ensureChannels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        // 每次都调用：已存在的渠道只会更新名称和说明，不会改用户自己调过的设置
        NotificationChannel a = new NotificationChannel(CH_ALERT, "电费预警", NotificationManager.IMPORTANCE_HIGH);
        a.setDescription("估算余额低于提醒线或快要用完时提醒充值");
        nm.createNotificationChannel(a);
        NotificationChannel r = new NotificationChannel(CH_LOGIN, "查电费提醒", NotificationManager.IMPORTANCE_DEFAULT);
        r.setDescription("好几天没查电费时提醒一下");
        nm.createNotificationChannel(r);
        NotificationChannel u = new NotificationChannel(CH_USAGE, "用电异常", NotificationManager.IMPORTANCE_DEFAULT);
        u.setDescription("最近一天用电明显比平时多时提醒一下");
        nm.createNotificationChannel(u);
    }

    private static PendingIntent openApp(Context c, int code) {
        Intent i = new Intent(c, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static Notification.Builder builder(Context c, String ch) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, ch) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_bolt).setColor(Color.rgb(52, 130, 255))
                .setAutoCancel(true).setShowWhen(true);
        return b;
    }

    /** 发出去了才返回 true（没权限或被关掉时不算提醒过） */
    private static boolean post(Context c, int id, Notification.Builder b) {
        if (!notifyAllowed(c)) return false;
        ensureChannels(c);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        try { nm.notify(id, b.build()); return true; } catch (Exception e) { return false; }
    }

    /**
     * 每日提醒。fresh = 刚在后台查到真实余额（见 CheckJob）；否则是查不了时的估算：
     * 按最后一次读数和最近的日均用电，估算今天大约还剩多少。
     *  - 余额低于提醒线、或预计 N 天内用完 → 发预警（同一天最多一次，余额恢复后重新计数）；
     *  - 刚查到的读数里最近一天用电明显偏多 → 发一条用电异常（同一段只提醒一次）；
     *  - 估算时已经 3 天以上没查 → 发一条轻提醒。
     * 估算时今天已经查过就不提醒（打开应用时首页已经显示了）；假期里一律不提醒。
     */
    static void dailyCheck(Context c, boolean fresh) {
        if ("0".equals(pref(c, "notify", "1"))) return;
        SharedPreferences p = sp(c);
        long now = System.currentTimeMillis();
        if (awayNow(c, now)) return;
        long last = p.getLong("lastFetch", 0);
        if (last == 0 || (!fresh && dayKey(last).equals(dayKey(now)))) return;
        double[] s = estimate(c, now);
        if (Double.isNaN(s[0])) return;
        double perDay = s[1], est = s[2], estDays = s[3];
        double since = (now - last) / (double) DAY;
        double thr = num(pref(c, "thr", "10"), 10);
        int days = (int) num(pref(c, "alertDays", "3"), 3);
        boolean low = est <= thr;
        boolean soon = days > 0 && !Double.isNaN(estDays) && estDays <= days;
        String room = p.getString("room", "");
        String where = room.isEmpty() ? "宿舍" : "宿舍 " + room;
        String lastTxt = new java.text.SimpleDateFormat("M月d日", Locale.CHINA).format(new java.util.Date(last))
                + "查到 " + String.format(Locale.CHINA, "¥%.2f", s[0]);
        String today = dayKey(now);
        String daysTxt = !Double.isNaN(estDays) ? "，能用 " + (estDays < 1 ? "不到 1 天" : (int) Math.floor(estDays) + " 天") : "";

        if (fresh) spikeNotice(c, where);
        if (low || soon) {
            if (today.equals(p.getString("alertDay", ""))) return;
            String title = fresh ? (low ? "电费不多了" : "电费快用完了") : low ? "电费可能不多了" : "电费可能快用完了";
            String text = fresh
                    ? "刚查到" + where + "还剩 " + String.format(Locale.CHINA, "¥%.2f", s[0]) + (daysTxt.isEmpty() ? "" : "，按最近的用电速度还" + daysTxt.substring(1)) + "。记得充值。"
                    : "按最近的用电速度估算，" + where + "现在大约还剩 " + String.format(Locale.CHINA, "¥%.2f", est) +
                    daysTxt + "（" + lastTxt + "）。点这里打开查一下准数，记得充值。";
            Notification.Builder b = builder(c, CH_ALERT).setContentTitle(title).setContentText(text)
                    .setStyle(new Notification.BigTextStyle().bigText(text))
                    .setCategory(Notification.CATEGORY_REMINDER)
                    .setContentIntent(openApp(c, 11));
            if (c.getPackageManager().getLaunchIntentForPackage(WECHAT) != null) {
                // 先经过应用：和界面里的「去充值」一样把公众号名称复制好再打开微信
                Intent go = new Intent(c, MainActivity.class).setAction(ACTION_WECHAT)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                PendingIntent pi = PendingIntent.getActivity(c, 12, go, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                // 用 int 图标的构造：传 null 会选中 Icon 版本，那个要 Android 6.0，5.x 上会崩
                b.addAction(new Notification.Action.Builder(0, "打开微信", pi).build());
            }
            if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
            if (post(c, N_ALERT, b)) p.edit().putString("alertDay", today).apply();
            return;
        }
        p.edit().remove("alertDay").apply();
        if (!fresh && since >= 3) {
            String text = "已经 " + (int) Math.floor(since) + " 天没查电费了" +
                    (!Double.isNaN(perDay) ? "，按估算现在大约还剩 " + String.format(Locale.CHINA, "¥%.2f", est) : "") +
                    "（" + lastTxt + "）。点这里打开看看。";
            post(c, N_LOGIN, builder(c, CH_LOGIN).setContentTitle("该看看电费了").setContentText(text)
                    .setStyle(new Notification.BigTextStyle().bigText(text))
                    .setContentIntent(openApp(c, 13)));
        }
    }

    /** 用电异常提醒：同一段（按结束时间认）只发一次 */
    private static void spikeNotice(Context c, String where) {
        double[] k = spike(c);
        SharedPreferences p = sp(c);
        if (k == null || p.getLong("spikeAt", 0) == (long) k[3]) return;
        String span = k[1] < 1.5 ? "最近一天" : "最近 " + Math.round(k[1]) + " 天";
        String text = where + span + "用了约 " + String.format(Locale.CHINA, "¥%.2f", k[0]) + "，是平时的 " +
                String.format(Locale.CHINA, "%.1f", k[2]) + " 倍。看看空调、热水器、取暖器是不是忘了关。";
        if (post(c, N_USAGE, builder(c, CH_USAGE).setContentTitle("用电比平时多").setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(openApp(c, 14))))
            p.edit().putLong("spikeAt", (long) k[3]).apply();
    }

    /** 查到新读数后收起「该看看电费了」那条提醒 */
    static void clearActionNotice(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(N_LOGIN);
    }

    // ---------------- 每日闹钟 ----------------

    /** 按设置的时间排下一次每日估算提醒；关闭时取消。系统闹钟本身不常驻，到点只唤起一次。 */
    static void scheduleDaily(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent i = new Intent(c, CheckReceiver.class).setAction(CheckReceiver.ACTION);
        PendingIntent pi = PendingIntent.getBroadcast(c, REQ_ALARM, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.cancel(pi);
        if ("0".equals(pref(c, "auto", "1"))) return;
        String[] t = pref(c, "autoTime", "12:00").split(":");
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, (int) num(t[0], 12));
        cal.set(Calendar.MINUTE, t.length > 1 ? (int) num(t[1], 0) : 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() <= System.currentTimeMillis() + 60 * 1000L) cal.add(Calendar.DAY_OF_MONTH, 1);
        // setAndAllowWhileIdle 要 Android 6.0；应用支持到 5.0，旧系统用普通闹钟（那时还没有 Doze）
        if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pi);
        else am.set(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pi);
        sp(c).edit().putLong("nextAuto", cal.getTimeInMillis()).apply();
    }

    static String dayKey(long t) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(t);
        return c.get(Calendar.YEAR) + "-" + (c.get(Calendar.MONTH) + 1) + "-" + c.get(Calendar.DAY_OF_MONTH);
    }

    private static String trim(double v) {
        return v == Math.floor(v) ? String.valueOf((long) v) : String.valueOf(v);
    }
}
