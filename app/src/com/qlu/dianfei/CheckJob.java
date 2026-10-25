package com.qlu.dianfei;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

/**
 * 每日后台查询：每日提醒的闹钟到点后由 CheckReceiver 排进来，等有网时系统唤起一次。
 * 在看不见的网页里走一遍和打开应用时一样的流程（学校首页 → 自动登录 → 校园充值 → 余额页），抓到余额就存下，
 * 再按真实读数决定要不要提醒。约 15 秒，最多 75 秒，查完就退出，不常驻。
 *
 * 只在这些条件都满足时查：开着自动登录、密码没被学校拒绝过、已经选过宿舍、不在假期、应用不在前台。
 * 遇到验证码、密码错误、要选宿舍或任何没见过的页面一律放弃，退回按记录估算提醒；绝不点充值、支付相关的控件。
 */
public class CheckJob extends JobService {
    static final int JOB_ID = 7003;
    private static final long LIMIT = 75000L, DEADLINE = 30 * 60 * 1000L;

    /** 当前正在跑的后台查询（只在主线程读写）；用户打开应用时让出 */
    private static Query running;
    /** 后台每登录一次加一：应用里记着的学校会话因此失效，下次查询要重新走首页 */
    static int logins = 0;

    static boolean eligible(Context c) {
        CredentialStore cs = new CredentialStore(c);
        String why = "0".equals(Core.pref(c, "auto", "1")) ? "off" : !cs.autoLogin() ? "no-auto-login"
                : cs.needsAttention() ? "attention" : Core.sp(c).getString("room", "").isEmpty() ? "no-room"
                : Core.awayNow(c, System.currentTimeMillis()) ? "away" : MainActivity.inForeground ? "foreground" : null;
        if (why != null) Log.i("dianfei", "background query skipped: " + why);
        return why == null;
    }

    static void schedule(Context c) { schedule(c, 0); }

    static void schedule(Context c, long delay) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) { Core.dailyCheck(c, false); return; }
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(c, CheckJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setMinimumLatency(delay)
                .setOverrideDeadline(delay + DEADLINE) // 半小时还没网也唤起，那时按估算提醒
                .build();
        if (js.schedule(job) != JobScheduler.RESULT_SUCCESS) Core.dailyCheck(c, false);
    }

    /** 用户打开了应用：后台这次不查了，也不再发通知（首页已经看得到） */
    static void yield() {
        if (running != null) running.finish(Query.YIELDED);
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        if (!eligible(this) || running != null) { Core.dailyCheck(this, false); return false; }
        running = new Query(this, r -> {
            running = null;
            Log.i("dianfei", "background query " + r);
            if (!Query.YIELDED.equals(r)) {
                Core.dailyCheck(this, Query.OK.equals(r));
                DianfeiWidget.update(this);
            }
            jobFinished(params, false);
        });
        running.start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        // 系统要收回（比如网断了）：放弃这次，按估算提醒
        if (running != null) running.finish(Query.STOPPED);
        return false;
    }

    /** 看不见的学校页面 + 驱动脚本，状态处理是 MainActivity 里取数流程的精简版：不露页面，走不通就放弃 */
    static final class Query {
        static final String OK = "ok", FAIL = "fail", YIELDED = "yielded", STOPPED = "stopped";
        interface Done { void done(String result); }

        private final Context c;
        private final Done done;
        private final Handler h = new Handler(Looper.getMainLooper());
        private final CredentialStore credentials;
        private WebView w;
        private String token = "";
        private long doc = 0;
        private boolean loginTried = false, finished = false;
        private int homeLoads = 0;
        private String state = "";

        private final Runnable timeout = () -> finish(FAIL + ":timeout");
        private final Runnable otherTimer = () -> finish(FAIL + ":other");

        Query(Context c, Done done) {
            this.c = c.getApplicationContext();
            this.done = done;
            credentials = new CredentialStore(this.c);
        }

        void start() {
            try {
                w = new WebView(c);
            } catch (Exception ex) { finish(FAIL + ":webview"); return; }
            // 不挂到窗口上的网页默认是 0×0，学校页面会按 0 宽排版、按钮量不出位置：按一台普通手机的屏幕尺寸排一次
            android.util.DisplayMetrics dm = c.getResources().getDisplayMetrics();
            int wpx = Math.max(dm.widthPixels, (int) (360 * dm.density)), hpx = Math.max(dm.heightPixels, (int) (640 * dm.density));
            w.measure(android.view.View.MeasureSpec.makeMeasureSpec(wpx, android.view.View.MeasureSpec.EXACTLY),
                    android.view.View.MeasureSpec.makeMeasureSpec(hpx, android.view.View.MeasureSpec.EXACTLY));
            w.layout(0, 0, wpx, hpx);
            CookieManager.getInstance().setAcceptCookie(true);
            WebSettings s = w.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setDatabaseEnabled(true);
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            s.setAllowFileAccess(false);
            s.setAllowContentAccess(false);
            s.setBlockNetworkImage(true); // 只读文字，图片不用下
            w.addJavascriptInterface(new Driver(), "DF");
            w.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                    return !"https".equalsIgnoreCase(r.getUrl().getScheme());
                }
                @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) {
                    if (!finished) token = "bg:" + (++doc);
                    state = "";
                }
                @Override public void onPageCommitVisible(WebView v, String url) { inject(); }
                @Override public void onPageFinished(WebView v, String url) { inject(); }
                @Override public void doUpdateVisitedHistory(WebView v, String url, boolean reload) { inject(); }
                @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                    if (r.isForMainFrame()) finish(FAIL + ":network");
                }
            });
            h.postDelayed(timeout, LIMIT);
            token = "bg:" + (++doc);
            w.loadUrl(Core.HOME_URL);
        }

        private void inject() {
            if (!finished && Core.isSchoolUrl(w.getUrl())) Core.injectDriver(c, w, token);
        }

        private boolean valid(String t) {
            return !finished && t != null && t.equals(token) && Core.isSchoolUrl(w.getUrl());
        }

        private class Driver {
            @JavascriptInterface public void state(String t, String st) { h.post(() -> { if (valid(t)) onState(st); }); }
            @JavascriptInterface public void result(String t, String json) { h.post(() -> { if (valid(t)) onResult(json); }); }
            @JavascriptInterface public void login(String t, String st) { h.post(() -> { if (valid(t)) onLogin(st); }); }
        }

        private void onState(String st) {
            if (st == null || "authenticated".equals(st) || st.equals(state)) return;
            state = st;
            h.removeCallbacks(otherTimer);
            switch (st) {
                case "need-login":
                    if (homeLoads++ >= 1) { finish(FAIL + ":session"); break; }
                    w.loadUrl(Core.HOME_URL);
                    break;
                case "login":
                    if (loginTried || !Core.isSchoolLogin(w.getUrl())) { finish(FAIL + ":login"); break; }
                    login();
                    break;
                case "pick": case "room": finish(FAIL + ":" + st); break;
                case "other": h.postDelayed(otherTimer, 10000); break;
            }
        }

        private void login() {
            loginTried = true;
            try {
                JSONObject value = credentials.read();
                if (value == null) { finish(FAIL + ":credentials"); return; }
                value.put("token", token);
                String script = Core.asset(c, "login.js").replace("__DF_CREDENTIALS__", value.toString());
                logins++;
                w.evaluateJavascript(script, null);
            } catch (Exception ex) { finish(FAIL + ":credentials"); }
        }

        private void onLogin(String st) {
            if (st == null) return;
            switch (st) {
                case "waiting": case "submitted": case "success": break;
                case "rejected":
                    // 和前台一样：学校说密码不对就暂停自动登录，等用户更新，免得反复提交被锁
                    credentials.setNeedsAttention(true);
                    finish(FAIL + ":rejected");
                    break;
                default: finish(FAIL + ":" + st); break;
            }
        }

        private void onResult(String json) {
            try {
                Core.saveResult(c, json);
                Core.clearActionNotice(c);
                finish(OK);
            } catch (Exception ex) { finish(FAIL + ":parse"); }
        }

        void finish(String result) {
            if (finished) return;
            finished = true;
            token = "";
            h.removeCallbacksAndMessages(null);
            if (w != null) {
                try {
                    Core.stopScripts(w);
                    w.stopLoading();
                    w.destroy();
                } catch (Exception ignore) {}
                w = null;
            }
            CookieManager.getInstance().flush();
            String r = result.startsWith(FAIL) ? FAIL : result;
            Log.i("dianfei", "background query detail " + result);
            done.done(r);
        }
    }
}
