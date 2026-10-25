package com.qlu.dianfei;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkRequest;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;
import android.text.InputType;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.EditText;
import android.widget.CheckBox;
import android.widget.Toast;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.util.Map;

/**
 * 校园电费 —— 原生壳。驱动脚本、读数存储、预警与每日闹钟在 Core，每日后台查询在 CheckJob。
 *
 * 两个 WebView：
 *  - ui：加载 assets 里的本地界面（https://dianfei.local/），所有展示、统计、勋章都在这里；
 *  - fetch：藏在 ui 下面，加载齐鲁工大随缴费平台并保持登录态，注入驱动脚本自动走
 *    「校区 → 宿舍号 → 下一步 → 余额页」，抓到「剩余量」后交给 ui。
 * 需要登录或第一次选宿舍时，把 fetch 连同顶部引导栏露出来，让用户自己操作。
 *
 * 全程只读：只读取余额页上的文字，绝不点击充值、支付相关的任何控件；只在学校 HTTPS 登录页按用户设置填写已保存的账号。
 */
public class MainActivity extends Activity {

    private static final String ENTRY_URL = Core.ENTRY_URL;
    private static final String UI_HOST = "dianfei.local";
    private static final String UI_URL = "https://dianfei.local/index.html";
    private static final int REQ_NOTIFY = 41;
    private static final long FETCH_TIMEOUT = 45000L;
    private static final long QUERY_LIMIT = 90000L;
    private static final long STALE_MS = 20 * 60 * 1000L;
    // 排查问题时改成 true：允许电脑通过 adb 查看应用里的网页（配合 tests/inspect-webview.cjs）
    private static final boolean WEB_DEBUG = false;

    /** 应用在前台时每日后台查询不跑（CheckJob 读） */
    static volatile boolean inForeground = false;

    private final Handler h = new Handler(Looper.getMainLooper());
    private int bgLoginsSeen = CheckJob.logins;
    private boolean pendingWeChat = false;
    private SharedPreferences sp;
    private CredentialStore credentials;
    private boolean loginAttempted = false, queriedThisOpen = false;
    private boolean sessionKnown = false, awaitingNetwork = false, foreground = false, pageCommitted = false;
    private int recoveries = 0, loginRedirects = 0, loginSubmissions = 0;
    private long queryDuration = 0;
    private long queryId = 0, documentId = 0;
    private String activeToken = "", fetchStep = "connect";
    private ConnectivityManager connectivity;
    private ConnectivityManager.NetworkCallback networkCallback;
    private FrameLayout root;
    private WebView ui, fetch;
    private LinearLayout sheetHead;
    private TextView sheetTitle, sheetSub, sheetClose, sheetHome;

    private boolean fetching = false, uiReady = false, uiStale = false, sheetShown = false;
    private String version = "";
    private String driverState = "", fetchState = "idle";
    private int barBg = 0xFF000000;
    private boolean barDark = true;

    private final Runnable loginTimeout = () -> { if (fetching && !sheetShown) retryFetch("login-timeout"); };
    private final Runnable timeout = () -> { if (fetching && !sheetShown) retryFetch("timeout"); };
    private final Runnable retryLoad = () -> { if (fetching) loadQueryPage(); };
    private final Runnable otherTimer = () -> { if (fetching && "other".equals(driverState)) showSheet("other"); };

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        sp = getSharedPreferences("df", Context.MODE_PRIVATE);
        credentials = new CredentialStore(this);
        Core.migrate(this);
        if (WEB_DEBUG) WebView.setWebContentsDebuggingEnabled(true);
        barDark = sysDark();
        barBg = barDark ? 0xFF000000 : 0xFFF7F7F7;

        root = new FrameLayout(this);

        // 底层：学校页面 + 引导栏（平时被 ui 盖住）
        LinearLayout sheet = new LinearLayout(this);
        sheet.setOrientation(LinearLayout.VERTICAL);
        sheetHead = buildSheetHead();
        sheet.addView(sheetHead, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        fetch = new WebView(this);
        sheet.addView(fetch, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        root.addView(sheet, mp());

        // 上层：本地界面
        ui = new WebView(this);
        root.addView(ui, mp());

        setContentView(root);
        applyBars(barBg, barDark);
        setupFetch();
        setupUi();
        watchNetwork();
        try { version = getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception ignore) {}
        ui.loadUrl(UI_URL);
        // 学校页面和本地界面同时开始加载，不等界面画完再连学校（冷启动省 0.4 秒左右）；界面就绪时补推一次状态
        maybeAutoFetch();
        Core.ensureChannels(this);
        Core.scheduleDaily(this);
        setupShortcuts();
        if (b == null) handleIntent(getIntent());
    }

    // ---------------- 本地界面 ----------------

    private void setupUi() {
        WebSettings s = ui.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        ui.setOverScrollMode(View.OVER_SCROLL_NEVER);
        ui.setVerticalScrollBarEnabled(false);
        ui.setHapticFeedbackEnabled(true);
        ui.addJavascriptInterface(new Host(), "Native");
        ui.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (!UI_HOST.equals(u.getHost())) return empty();
                String name = u.getPath() == null ? "" : u.getPath().replaceFirst("^/", "");
                if (name.isEmpty()) name = "index.html";
                if (name.contains("..")) return empty();
                try {
                    return new WebResourceResponse(mime(name), "UTF-8", getAssets().open(name));
                } catch (Exception e) {
                    return empty();
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return !UI_HOST.equals(r.getUrl().getHost()); // 界面里不跳任何外部链接
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                uiReady = true;
                if (uiStale) { uiStale = false; pushState(); }
                if (pendingWeChat) { pendingWeChat = false; ui.evaluateJavascript("window.DF&&DF.wechat()", null); }
                maybeAutoFetch();
            }
        });
    }

    private static WebResourceResponse empty() {
        return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
    }

    private static String mime(String n) {
        if (n.endsWith(".js")) return "text/javascript";
        if (n.endsWith(".css")) return "text/css";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".json")) return "application/json";
        return "text/html";
    }

    /** 界面调用的原生接口（window.Native） */
    private class Host {
        @JavascriptInterface public String getState() { return stateJson(); }
        @JavascriptInterface public void manageAccount() { h.post(MainActivity.this::manageAccount); }
        @JavascriptInterface public void setAutoLogin(boolean enabled) {
            h.post(() -> {
                if (!credentials.hasSaved()) { manageAccount(); return; }
                credentials.setAutoLogin(enabled);
                if (enabled) credentials.setNeedsAttention(false);
                if (fetching && Core.isSchoolLogin(fetch.getUrl())) endFetch("idle");
                pushState();
                if (enabled) startFetch();
            });
        }
        @JavascriptInterface public void refresh() { h.post(MainActivity.this::startFetch); }

        /** 分享余额卡片：弹出系统分享面板（微信、QQ 等），图片只临时授权给选中的应用 */
        @JavascriptInterface
        public boolean shareImage(String b64) {
            try {
                writeCard(b64);
                Uri u = ShareProvider.uri(MainActivity.this, "dianfei-card.png");
                Intent send = new Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM, u)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                send.setClipData(ClipData.newRawUri("", u));
                Intent chooser = Intent.createChooser(send, "分享电费卡片").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                h.post(() -> { try { startActivity(chooser); } catch (Exception ignore) {} });
                return true;
            } catch (Exception e) { return false; }
        }

        /** 分享卡片存进相册「校园电费」（Android 10 起，不需要存储权限）；更早的系统返回 false */
        @JavascriptInterface
        public boolean saveImage(String b64) {
            if (Build.VERSION.SDK_INT < 29) return false;
            Uri u = null;
            android.content.ContentResolver cr = getContentResolver();
            try {
                java.io.File f = writeCard(b64);
                android.content.ContentValues v = new android.content.ContentValues();
                v.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, "校园电费-" + new java.text.SimpleDateFormat("yyyyMMdd-HHmmss", java.util.Locale.CHINA).format(new java.util.Date()) + ".png");
                v.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "image/png");
                v.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_PICTURES + "/校园电费");
                u = cr.insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                if (u == null) return false;
                try (java.io.InputStream in = new java.io.FileInputStream(f); java.io.OutputStream out = cr.openOutputStream(u)) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
                return true;
            } catch (Exception e) {
                if (u != null) try { cr.delete(u, null, null); } catch (Exception ignore) {}
                return false;
            }
        }
        @JavascriptInterface public void cancel() { h.post(() -> { if (fetching) endFetch("idle"); }); }
        @JavascriptInterface public void haptic(String k) { h.post(() -> doHaptic(k)); }

        @JavascriptInterface
        public void setPref(String k, String v) {
            if (k != null) sp.edit().putString("p_" + k, v == null ? "" : v).apply();
        }

        @JavascriptInterface
        public void resetRoom() {
            h.post(() -> {
                sp.edit().remove("room").remove("campus").apply();
                if (fetching) endFetch("idle");
                startFetch();
            });
        }

        @JavascriptInterface
        public void clearHistory() {
            h.post(() -> {
                sp.edit().remove("hist").remove("p_badges").remove("p_badgesInit").apply();
                pushState();
            });
        }

        @JavascriptInterface
        public void setBars(String bg, boolean dark) {
            h.post(() -> {
                try { applyBars(Color.parseColor(bg), dark); } catch (Exception ignore) {}
            });
        }

        /** 改了自动查询开关或时间后重新排闹钟 */
        @JavascriptInterface public void schedule() { h.post(() -> { Core.scheduleDaily(MainActivity.this); pushState(); }); }

        /** 申请通知权限；已拒绝过或被关掉时打开本应用的通知设置 */
        @JavascriptInterface public void requestNotify() { h.post(MainActivity.this::requestNotify); }

        /** 打开本应用的系统设置页（小米等机型在这里允许自启动、省电无限制） */
        @JavascriptInterface
        public void openAppSettings() {
            h.post(() -> {
                try {
                    startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                            Uri.parse("package:" + getPackageName())));
                } catch (Exception ignore) {}
            });
        }

        /** 把公众号名称复制到剪贴板并打开微信；没装微信返回 missing */
        @JavascriptInterface
        public String openWeChat(String name) {
            if (getPackageManager().getLaunchIntentForPackage(Core.WECHAT) == null) return "missing";
            h.post(() -> openWeChatWith(name));
            return "ok";
        }

        /**
         * 「支持作者」：把收款码（assets/donate.png）存进相册的「校园电费」文件夹。
         * Android 10 起用 MediaStore，不需要存储权限；更早的系统返回 false，界面提示截图。
         */
        @JavascriptInterface
        public boolean saveDonate() {
            if (Build.VERSION.SDK_INT < 29) return false;
            Uri u = null;
            try {
                android.content.ContentValues v = new android.content.ContentValues();
                v.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, "校园电费-支持作者.png");
                v.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "image/png");
                v.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_PICTURES + "/校园电费");
                v.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 1);
                android.content.ContentResolver cr = getContentResolver();
                u = cr.insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                if (u == null) return false;
                try (java.io.InputStream in = getAssets().open("donate.png");
                     java.io.OutputStream out = cr.openOutputStream(u)) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
                v.clear();
                v.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 0);
                cr.update(u, v, null, null);
                return true;
            } catch (Exception e) {
                if (u != null) try { getContentResolver().delete(u, null, null); } catch (Exception ignore) {}
                return false;
            }
        }

        /**
         * 导出全部读数为 CSV（带 BOM，Excel / WPS 直接打开不乱码）。
         * Android 10 起存进「下载/校园电费」，返回 "saved"；更早的系统弹出分享面板，返回 "shared"；没有记录返回 "empty"。
         */
        @JavascriptInterface
        public String exportCsv() {
            try {
                String csv = Core.historyCsv(MainActivity.this);
                if (csv == null) return "empty";
                String name = "校园电费记录-" + new java.text.SimpleDateFormat("yyyyMMdd-HHmm", java.util.Locale.CHINA).format(new java.util.Date()) + ".csv";
                if (Build.VERSION.SDK_INT >= 29) {
                    android.content.ContentValues v = new android.content.ContentValues();
                    v.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "text/csv");
                    v.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS + "/校园电费");
                    android.content.ContentResolver cr = getContentResolver();
                    Uri u = cr.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (u == null) return "fail";
                    try (java.io.OutputStream out = cr.openOutputStream(u)) {
                        out.write(("﻿" + csv).getBytes(java.nio.charset.StandardCharsets.UTF_8));
                    } catch (Exception e) {
                        cr.delete(u, null, null);
                        return "fail";
                    }
                    return "saved";
                }
                h.post(() -> {
                    Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain")
                            .putExtra(Intent.EXTRA_SUBJECT, name).putExtra(Intent.EXTRA_TEXT, csv);
                    try { startActivity(Intent.createChooser(send, "导出电费记录")); } catch (Exception ignore) {}
                });
                return "shared";
            } catch (Exception e) {
                return "fail";
            }
        }
    }

    private boolean openWeChatWith(String name) {
        Intent wx = getPackageManager().getLaunchIntentForPackage(Core.WECHAT);
        if (wx == null) return false;
        if (name != null && !name.trim().isEmpty()) {
            ClipboardManager cb = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cb != null) cb.setPrimaryClip(ClipData.newPlainText("公众号", name.trim()));
        }
        try { startActivity(wx.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return true; } catch (Exception ignore) { return false; }
    }

    /**
     * 预警通知上的「打开微信」、长按图标的「去充值」：复制设置里的公众号名称后打开微信，应用本身在后台照常查一次余额；
     * 还没填公众号就留在应用里，让界面弹出填写框。长按图标的「刷新余额」：马上查一次。
     */
    private void handleIntent(Intent i) {
        String a = i == null ? null : i.getAction();
        if ("TEMP_TEST_BG".equals(a)) { CheckJob.schedule(this, 30000); Toast.makeText(this, "bg scheduled", Toast.LENGTH_SHORT).show(); return; } // TEMP
        if (!Core.ACTION_WECHAT.equals(a) && !Core.ACTION_REFRESH.equals(a)) return;
        setIntent(new Intent(this, MainActivity.class)); // 转屏或重建时不再重复执行
        if (Core.ACTION_REFRESH.equals(a)) { startFetch(); return; }
        String name = Core.pref(this, "wxName", "").trim();
        if (name.isEmpty()) {
            if (uiReady) ui.evaluateJavascript("window.DF&&DF.wechat()", null); else pendingWeChat = true;
            return;
        }
        if (openWeChatWith(name))
            Toast.makeText(this, "已复制「" + name + "」，在微信搜索框粘贴即可", Toast.LENGTH_LONG).show();
    }

    /** 长按桌面图标的快捷菜单（Android 7.1 起）：用代码设，诊断包改了包名也能用 */
    private void setupShortcuts() {
        if (Build.VERSION.SDK_INT < 25) return;
        try {
            android.content.pm.ShortcutManager sm = getSystemService(android.content.pm.ShortcutManager.class);
            if (sm == null) return;
            java.util.List<android.content.pm.ShortcutInfo> list = new java.util.ArrayList<>();
            list.add(new android.content.pm.ShortcutInfo.Builder(this, "refresh").setShortLabel("刷新余额").setLongLabel("刷新电费余额")
                    .setIcon(android.graphics.drawable.Icon.createWithResource(this, R.drawable.ic_sc_refresh))
                    .setIntent(new Intent(this, MainActivity.class).setAction(Core.ACTION_REFRESH)).setRank(0).build());
            list.add(new android.content.pm.ShortcutInfo.Builder(this, "wechat").setShortLabel("去充值").setLongLabel("打开微信去充值")
                    .setIcon(android.graphics.drawable.Icon.createWithResource(this, R.drawable.ic_sc_recharge))
                    .setIntent(new Intent(this, MainActivity.class).setAction(Core.ACTION_WECHAT)).setRank(1).build());
            sm.setDynamicShortcuts(list);
        } catch (Exception ignore) {}
    }

    /** 界面画好的分享卡片（PNG 的 base64）写进缓存目录，返回文件；同名覆盖，只留最新一张 */
    private java.io.File writeCard(String b64) throws Exception {
        byte[] png = android.util.Base64.decode(b64.replaceFirst("^data:image/png;base64,", ""), android.util.Base64.DEFAULT);
        if (png.length < 8 || png[1] != 'P' || png[2] != 'N' || png[3] != 'G') throw new IllegalArgumentException("not png");
        java.io.File dir = new java.io.File(getCacheDir(), ShareProvider.DIR);
        if (!dir.isDirectory() && !dir.mkdirs()) throw new java.io.IOException("mkdir");
        java.io.File f = new java.io.File(dir, "dianfei-card.png");
        try (java.io.FileOutputStream out = new java.io.FileOutputStream(f)) { out.write(png); }
        return f;
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        handleIntent(i);
    }

    private void requestNotify() {
        if (Core.notifyAllowed(this)) { pushState(); return; }
        String perm = "android.permission.POST_NOTIFICATIONS";
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(perm) != PackageManager.PERMISSION_GRANTED
                && (!sp.getBoolean("askedNotify", false) || shouldShowRequestPermissionRationale(perm))) {
            sp.edit().putBoolean("askedNotify", true).apply();
            requestPermissions(new String[]{perm}, REQ_NOTIFY);
            return;
        }
        try {
            Intent i = Build.VERSION.SDK_INT >= 26
                    ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())
                    : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()));
            startActivity(i);
        } catch (Exception ignore) {}
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        super.onRequestPermissionsResult(code, perms, res);
        if (code == REQ_NOTIFY) pushState();
    }

    private String stateJson() {
        try {
            JSONObject o = new JSONObject();
            JSONArray hist = new JSONArray(sp.getString("hist", "[]"));
            o.put("hist", hist);
            o.put("room", sp.getString("room", ""));
            o.put("campus", sp.getString("campus", ""));
            o.put("addr", sp.getString("addr", ""));
            o.put("meter", sp.getString("meter", ""));
            o.put("status", sp.getString("status", ""));
            long last = hist.length() > 0 ? hist.getJSONArray(hist.length() - 1).getLong(0) : 0;
            o.put("lastFetch", sp.getLong("lastFetch", last));
            o.put("sysDark", sysDark());
            o.put("fetch", fetchState);
            o.put("fetchStep", fetchStep);
            o.put("version", version);
            o.put("login", credentials.metadata().put("submitted", loginSubmissions));
            o.put("queryMs", queryDuration);
            o.put("queryRetries", recoveries);
            o.put("notifyAllowed", Core.notifyAllowed(this));
            o.put("wechat", getPackageManager().getLaunchIntentForPackage(Core.WECHAT) != null);
            o.put("nextAuto", sp.getLong("nextAuto", 0));
            JSONObject p = new JSONObject();
            for (Map.Entry<String, ?> en : sp.getAll().entrySet()) {
                if (en.getKey().startsWith("p_")) p.put(en.getKey().substring(2), String.valueOf(en.getValue()));
            }
            o.put("prefs", p);
            return o.toString();
        } catch (Exception e) {
            return "{\"hist\":[],\"prefs\":{}}";
        }
    }

    // 界面还没加载完时先记下来，onPageFinished 里补推一次完整状态
    private void pushState() {
        if (uiReady) ui.evaluateJavascript("window.DF&&DF.onState(" + stateJson() + ")", null);
        else uiStale = true;
    }

    private void setFetchState(String st) {
        fetchState = st;
        if (uiReady) ui.evaluateJavascript("window.DF&&DF.onFetch('" + st + "')", null);
        else uiStale = true;
    }

    // ---------------- 取数 ----------------

    private void setupFetch() {
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(fetch, true);
        WebSettings s = fetch.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        if (Build.VERSION.SDK_INT >= 26) fetch.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
        fetch.addJavascriptInterface(new Driver(), "DF");
        fetch.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return !"https".equalsIgnoreCase(r.getUrl().getScheme());
            }
            @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) {
                if (!fetching || activeToken.isEmpty()) return;
                activeToken = queryId + ":" + (++documentId);
                pageCommitted = false;
                driverState = "";
                h.removeCallbacks(loginTimeout);
            }
            private void inject(WebView v) {
                if (fetching && pageCommitted && !activeToken.isEmpty() && Core.isSchoolUrl(v.getUrl())) Core.injectDriver(MainActivity.this, v, activeToken);
            }
            @Override public void onPageCommitVisible(WebView v, String url) { pageCommitted = true; inject(v); }
            @Override public void onPageFinished(WebView v, String url) {
                if (url != null && url.equals(v.getUrl())) pageCommitted = true;
                inject(v);
            }
            @Override public void doUpdateVisitedHistory(WebView v, String url, boolean reload) { pageStep(url); inject(v); }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError error) {
                if (r.isForMainFrame() && fetching && Core.isSchoolUrl(r.getUrl().toString())) retryFetch("network");
            }
            @Override public void onReceivedHttpError(WebView v, WebResourceRequest r, WebResourceResponse response) {
                if (r.isForMainFrame() && fetching && response.getStatusCode() >= 500) retryFetch("server");
            }
        });
    }

    private boolean online() {
        try {
            android.net.NetworkInfo info = connectivity == null ? null : connectivity.getActiveNetworkInfo();
            return info != null && info.isConnected();
        } catch (Exception ex) { return true; }
    }

    private void watchNetwork() {
        connectivity = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivity == null) return;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network network) { h.post(MainActivity.this::networkChanged); }
            @Override public void onLost(Network network) { h.post(MainActivity.this::networkChanged); }
            @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) { h.post(MainActivity.this::networkChanged); }
        };
        try {
            if (Build.VERSION.SDK_INT >= 24) connectivity.registerDefaultNetworkCallback(networkCallback);
            else connectivity.registerNetworkCallback(new NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(), networkCallback);
        } catch (Exception ex) { networkCallback = null; }
    }

    private void networkChanged() {
        if (!fetching || sheetShown) return;
        if (!online()) pauseForNetwork();
        else if (awaitingNetwork && foreground) {
            Log.i("dianfei", "network restored; resume query");
            fetchStart = SystemClock.elapsedRealtime();
            loadQueryPage();
        }
    }

    private void maybeAutoFetch() {
        if (fetching) { if (awaitingNetwork && online() && foreground) networkChanged(); return; }
        if ((!queriedThisOpen && credentials.autoLogin())
                || System.currentTimeMillis() - sp.getLong("lastFetch", 0) > STALE_MS) startFetch();
    }

    private long fetchStart = 0;

    private void startFetch() {
        if (fetching) { if (awaitingNetwork && online()) networkChanged(); return; }
        // 后台查询期间重新登录过：服务器那边旧会话已失效，从首页重新走
        if (CheckJob.logins != bgLoginsSeen) { bgLoginsSeen = CheckJob.logins; sessionKnown = false; }
        fetching = true;
        queriedThisOpen = true;
        queryId++;
        recoveries = 0;
        loginRedirects = 0;
        loginSubmissions = 0;
        queryDuration = 0;
        fetchStart = SystemClock.elapsedRealtime();
        Log.i("dianfei", "fetch start");
        loadQueryPage();
    }

    private void setStep(String step) {
        fetchStep = step;
        if (uiReady) ui.evaluateJavascript("window.DF&&DF.onProgress(" + JSONObject.quote(step) + ")", null);
        else uiStale = true;
    }

    /**
     * 学校页面走到哪一步就告诉界面（查询一次要 7–16 秒，看得到进度不那么像卡住）。
     * 只看网址路径，不读页面内容；登录阶段的「等待表单 / 自动登录」仍由 login.js 报告。
     */
    private void pageStep(String url) {
        if (!fetching || awaitingNetwork) return;
        String step = stepFor(url);
        if (step != null && !step.equals(fetchStep)) setStep(step);
    }

    private static String stepFor(String url) {
        if (!Core.isSchoolUrl(url) || Core.isSchoolLogin(url)) return null;
        String path = Uri.parse(url).getPath();
        if (path == null) return null;
        return path.startsWith("/SL321110") ? "balance"
                : path.startsWith("/SL321100") ? "room"
                : path.startsWith("/SL320000") || path.startsWith("/SL321000") ? "campus"
                : path.startsWith("/SL300000") ? "home" : null;
    }

    private void armTimeout() {
        h.removeCallbacks(timeout);
        long left = QUERY_LIMIT - (SystemClock.elapsedRealtime() - fetchStart);
        h.postDelayed(timeout, Math.max(1, Math.min(FETCH_TIMEOUT, left)));
    }

    private void loadQueryPage() {
        if (!fetching) return;
        if (!online()) { pauseForNetwork(); return; }
        awaitingNetwork = false;
        activeToken = queryId + ":" + (++documentId);
        loginAttempted = false;
        driverState = "";
        hideSheet();
        setStep(sessionKnown ? "query" : "connect");
        setFetchState("working");
        armTimeout();
        // 冷启动先完成学校首页初始化；同一进程保留有效会话，直接查询。
        pageCommitted = false;
        fetch.loadUrl(sessionKnown ? ENTRY_URL : Core.HOME_URL);
    }

    private void stopWork() {
        activeToken = "";
        pageCommitted = false;
        h.removeCallbacks(loginTimeout);
        h.removeCallbacks(timeout);
        h.removeCallbacks(retryLoad);
        h.removeCallbacks(otherTimer);
        Core.stopScripts(fetch);
        fetch.stopLoading();
    }

    private void pauseForNetwork() {
        if (awaitingNetwork) return;
        awaitingNetwork = true;
        stopWork();
        hideSheet();
        setFetchState("offline");
        Log.i("dianfei", "query waiting for network");
    }

    private void retryFetch(String reason) {
        if (!fetching || awaitingNetwork || sheetShown) return;
        if (!online()) { pauseForNetwork(); return; }
        if (recoveries >= 1 || SystemClock.elapsedRealtime() - fetchStart >= QUERY_LIMIT) { endFetch("timeout"); return; }
        recoveries++;
        stopWork();
        setStep("retry");
        setFetchState("working");
        Log.i("dianfei", "recover query: " + reason);
        h.postDelayed(retryLoad, 1200);
    }

    private void endFetch(String st) {
        Log.i("dianfei", "fetch " + st + " in " + (SystemClock.elapsedRealtime() - fetchStart) + " ms");
        queryDuration = SystemClock.elapsedRealtime() - fetchStart;
        fetching = false;
        awaitingNetwork = false;
        stopWork();
        hideSheet();
        // 只停止本应用的驱动轮询，保留学校页面的会话给下次刷新使用。
        setFetchState(st);
    }

    private boolean validCallback(String token) {
        return fetching && !awaitingNetwork && token != null && !token.isEmpty() && token.equals(activeToken) && Core.isSchoolUrl(fetch.getUrl());
    }

    private class Driver {
        @JavascriptInterface public void state(String token, String st) { h.post(() -> { if (validCallback(token)) onDriverState(st); }); }
        @JavascriptInterface public void result(String token, String json) { h.post(() -> { if (validCallback(token)) onDriverResult(json); }); }
        @JavascriptInterface public void login(String token, String st) { h.post(() -> { if (validCallback(token)) onLoginState(st); }); }
    }

    private void onDriverState(String st) {
        if (st == null) return;
        if ("authenticated".equals(st)) {
            sessionKnown = true;
            if (credentials.needsAttention()) { credentials.setNeedsAttention(false); pushState(); }
            return;
        }
        if (st.equals(driverState)) return;
        driverState = st;
        Log.i("dianfei", "state " + st + " at " + (SystemClock.elapsedRealtime() - fetchStart) + " ms");
        h.removeCallbacks(otherTimer);
        switch (st) {
            case "need-login":
                sessionKnown = false;
                if (loginRedirects++ >= 1 || loginAttempted) { retryFetch("session"); break; }
                pageCommitted = false;
                fetch.loadUrl(Core.HOME_URL);
                break;
            case "login":
                sessionKnown = false;
                if (!Core.isSchoolLogin(fetch.getUrl())) { loginFallback("请完成学校账号验证"); break; }
                if (tryAutoLogin()) break;
                loginFallback(credentials.needsAttention() ? "学校提示账号或密码有误，请点「账号」更新" :
                        loginAttempted ? "学校仍要求登录，请核对账号或手动处理" : "可点右侧「账号」管理本机保存的密码");
                break;
            case "pick": case "room":
                h.removeCallbacks(timeout);
                showSheet(st);
                setFetchState(st);
                break;
            case "working":
                if (!Core.isSchoolLogin(fetch.getUrl())) {
                    h.removeCallbacks(loginTimeout);
                    // 冷启动先经过学校首页初始化，这时还没登录，不能说「已连接」
                    String s = stepFor(fetch.getUrl());
                    setStep(s != null ? s : sessionKnown ? "query" : "connect");
                }
                hideSheet();
                armTimeout();
                setFetchState("working");
                break;
            case "other": h.postDelayed(otherTimer, 10000); break;
        }
    }

    private void onLoginState(String st) {
        if (st == null) return;
        switch (st) {
            case "waiting": setStep("form"); break;
            case "submitted":
                loginSubmissions++;
                Log.i("dianfei", "auto login submitted");
                setStep("signin");
                h.removeCallbacks(loginTimeout);
                h.postDelayed(loginTimeout, 27000);
                break;
            case "success": sessionKnown = true; h.removeCallbacks(loginTimeout); setStep("query"); break;
            case "challenge": loginFallback("学校需要验证码，请在页面完成验证，账号密码已保留"); break;
            case "rejected":
                credentials.setNeedsAttention(true);
                pushState();
                loginFallback("学校提示账号或密码有误，请点「账号」更新；已暂停重复尝试");
                break;
            case "cancelled": if (Core.isSchoolLogin(fetch.getUrl())) loginFallback("自动填写已暂停，可继续手动登录"); break;
            case "network": case "timeout": case "form-timeout": case "script-error": retryFetch(st); break;
        }
    }

    private void onDriverResult(String json) {
        try {
            Core.saveResult(this, json);
            Core.clearActionNotice(this);
            sessionKnown = true;
            pushState();
            endFetch("ok");
        } catch (Exception ex) { endFetch("error"); }
    }

    // ---------------- 本地账号与自动登录 ----------------

    private void manageAccount() {
        JSONObject old = null;
        try { old = credentials.read(); } catch (Exception ignored) {}
        final JSONObject saved = old;
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(24), dp(8), dp(24), dp(4));
        TextView hint = new TextView(this);
        hint.setText("使用学校缴费平台的学号/工号账号。账号密码加密保存在本机，仅用于向学校平台登录。");
        hint.setTextSize(13);
        box.addView(hint);
        EditText user = new EditText(this);
        user.setSingleLine(true);
        user.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);
        user.setHint("学号 / 工号");
        if (saved != null) user.setText(saved.optString("username", ""));
        box.addView(user);
        EditText pass = new EditText(this);
        pass.setSingleLine(true);
        pass.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        pass.setHint(saved == null ? "密码" : "密码（留空保留原密码）");
        if (Build.VERSION.SDK_INT >= 26) {
            user.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
            pass.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);
        }
        box.addView(pass);
        CheckBox auto = new CheckBox(this);
        auto.setText("自动登录");
        auto.setChecked(!credentials.hasSaved() || credentials.autoLogin());
        box.addView(auto);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("学校账号")
                .setView(box).setNegativeButton("取消", null).setPositiveButton("保存", null)
                .setNeutralButton(credentials.hasSaved() ? "清除账号" : null, null).create();
        boolean wasSecure = (getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        dialog.setOnDismissListener(d -> {
            pass.setText("");
            if (!wasSecure) getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        });
        dialog.setOnShowListener(d -> {
            dialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
                String name = user.getText().toString().trim();
                String password = pass.getText().toString();
                if (name.isEmpty()) { user.setError("请填写学号 / 工号"); return; }
                if (password.isEmpty() && saved != null && name.equals(saved.optString("username")))
                    password = saved.optString("password", "");
                if (password.isEmpty()) { pass.setError("请填写密码"); return; }
                try {
                    credentials.save(name, password, auto.isChecked());
                    dialog.dismiss();
                    pushState();
                    Toast.makeText(this, auto.isChecked() ? "已加密保存，正在自动登录" : "已加密保存，自动登录已关闭", Toast.LENGTH_SHORT).show();
                    if (auto.isChecked()) {
                        sessionKnown = false;
                        if (fetching) endFetch("idle");
                        startFetch();
                    }
                } catch (Exception ex) {
                    Toast.makeText(this, "账号保存失败，请重新填写或检查系统版本", Toast.LENGTH_LONG).show();
                }
            });
            if (credentials.hasSaved()) dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v -> {
                new AlertDialog.Builder(this).setTitle("清除本机保存的账号？")
                        .setMessage("同时关闭自动登录。宿舍和电费记录会保留。当前网页会话仍可继续使用。")
                        .setNegativeButton("取消", null).setPositiveButton("清除", (confirm, which) -> {
                            try {
                                if (fetching) endFetch("idle");
                                credentials.clear();
                                dialog.dismiss();
                                pushState();
                                Toast.makeText(this, "已清除账号并关闭自动登录", Toast.LENGTH_SHORT).show();
                            } catch (Exception ex) { Toast.makeText(this, "清除失败，请重试", Toast.LENGTH_SHORT).show(); }
                        }).show();
            });
        });
        dialog.show();
    }

    private boolean tryAutoLogin() {
        if (loginAttempted || !credentials.autoLogin() || credentials.needsAttention() || !Core.isSchoolLogin(fetch.getUrl())) return false;
        loginAttempted = true;
        try {
            JSONObject value = credentials.read();
            if (value == null) return false;
            String token = activeToken;
            value.put("token", token);
            String script = Core.asset(this, "login.js").replace("__DF_CREDENTIALS__", value.toString());
            hideSheet();
            setStep("form");
            setFetchState("working");
            h.removeCallbacks(loginTimeout);
            h.postDelayed(loginTimeout, 17000);
            fetch.evaluateJavascript(script, result -> {
                if (validCallback(token) && Core.isSchoolLogin(fetch.getUrl()) && !"\"active\"".equals(result)) retryFetch("script");
            });
            return true;
        } catch (Exception ex) { return false; }
    }

    private void loginFallback(String message) {
        h.removeCallbacks(loginTimeout);
        h.removeCallbacks(timeout);
        h.removeCallbacks(retryLoad);
        showSheet("login");
        sheetSub.setText(message);
        setFetchState("login");
    }

    // ---------------- 引导栏 ----------------

    private LinearLayout buildSheetHead() {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(10), dp(10), dp(12), dp(10));

        sheetClose = pill("✕");
        sheetClose.setOnClickListener(v -> endFetch("idle"));

        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(dp(12), 0, dp(8), 0);
        sheetTitle = new TextView(this);
        sheetTitle.setTextSize(17);
        sheetTitle.setTypeface(Typeface.DEFAULT_BOLD);
        sheetSub = new TextView(this);
        sheetSub.setTextSize(12);
        col.addView(sheetTitle);
        col.addView(sheetSub);

        sheetHome = pill("回到电费页");
        sheetHome.setOnClickListener(v -> {
            if ("login".equals(driverState)) { manageAccount(); return; }
            driverState = "";
            pageCommitted = false;
            fetch.loadUrl(ENTRY_URL);
        });

        row.addView(sheetClose);
        row.addView(col, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        row.addView(sheetHome);
        return row;
    }

    private TextView pill(String text) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(14);
        t.setGravity(Gravity.CENTER);
        t.setMinHeight(dp(36));
        t.setMinWidth(dp(36));
        t.setPadding(dp(12), 0, dp(12), 0);
        t.setClickable(true);
        return t;
    }

    private void styleSheetHead() {
        if (sheetHead == null) return;
        int text = barDark ? 0xFFF0F0F0 : 0xFF1A1A1A;
        int muted = barDark ? 0xFF9A9A9A : 0xFF737373;
        int fill = barDark ? 0xFF262626 : 0xFFF0F0F0;
        sheetHead.setBackgroundColor(barBg);
        sheetTitle.setTextColor(text);
        sheetSub.setTextColor(muted);
        for (TextView t : new TextView[]{sheetClose, sheetHome}) {
            GradientDrawable g = new GradientDrawable();
            g.setColor(fill);
            g.setCornerRadius(dp(18));
            t.setBackground(g);
            t.setTextColor(text);
        }
    }

    private void showSheet(String st) {
        String title, sub;
        switch (st) {
            case "login": title = "登录学校账号"; sub = "可点右侧「账号」保存密码并开启自动登录"; break;
            case "pick": title = "选择你的校区"; sub = "点「齐鲁工业大学××校区」，以后会自动记住"; break;
            case "room": title = "输入宿舍号"; sub = "如 20#340，点「下一步」；只需输一次"; break;
            default: title = "学校页面"; sub = "没自动往下走的话，点「校园充值」"; break;
        }
        sheetHome.setText("login".equals(st) ? "账号" : "回到电费页");
        sheetTitle.setText(title);
        sheetSub.setText(sub);
        if (!sheetShown) {
            sheetShown = true;
            ui.setVisibility(View.INVISIBLE);
        }
    }

    private void hideSheet() {
        if (sheetShown) {
            sheetShown = false;
            ui.setVisibility(View.VISIBLE);
        }
    }

    // ---------------- 系统栏 / 震动 / 生命周期 ----------------

    private void applyBars(int bg, boolean dark) {
        barBg = bg;
        barDark = dark;
        Window w = getWindow();
        w.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        w.setStatusBarColor(bg);
        w.setNavigationBarColor(bg);
        View d = w.getDecorView();
        int light = 0;
        if (Build.VERSION.SDK_INT >= 23) light |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if (Build.VERSION.SDK_INT >= 26) light |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        int f = d.getSystemUiVisibility();
        d.setSystemUiVisibility(dark ? (f & ~light) : (f | light));
        root.setBackgroundColor(bg);
        ui.setBackgroundColor(bg);
        styleSheetHead();
    }

    private void doHaptic(String k) {
        int c;
        if ("confirm".equals(k)) c = Build.VERSION.SDK_INT >= 30 ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.VIRTUAL_KEY;
        else if ("reject".equals(k)) c = Build.VERSION.SDK_INT >= 30 ? HapticFeedbackConstants.REJECT : HapticFeedbackConstants.LONG_PRESS;
        else if ("tick".equals(k)) c = HapticFeedbackConstants.CLOCK_TICK;
        else c = HapticFeedbackConstants.VIRTUAL_KEY;
        ui.performHapticFeedback(c, HapticFeedbackConstants.FLAG_IGNORE_VIEW_SETTING);
    }

    private boolean sysDark() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
    }

    @Override
    public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        pushState(); // 系统深浅色切换时让界面跟着变
    }

    @Override
    protected void onResume() {
        super.onResume();
        foreground = true;
        inForeground = true;
        CheckJob.yield(); // 后台恰好在查：让给前台，首页自己会查
        ui.onResume();
        fetch.onResume();
        if (uiReady) {
            pushState();
            maybeAutoFetch();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        foreground = false;
        inForeground = false;
        // 切到后台时界面的电池波纹等动画不必再跑；正在查询时学校页面照常走完（比如切去微信等结果）
        ui.onPause();
        if (!fetching) fetch.onPause();
        CookieManager.getInstance().flush();
        DianfeiWidget.update(this); // 离开应用时同步小组件（提醒线等设置可能改过）
    }

    @Override
    protected void onDestroy() {
        fetching = false;
        if (connectivity != null && networkCallback != null) {
            try { connectivity.unregisterNetworkCallback(networkCallback); } catch (Exception ignored) {}
        }
        h.removeCallbacksAndMessages(null);
        if (fetch != null) { fetch.stopLoading(); fetch.destroy(); }
        if (ui != null) ui.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (sheetShown) { endFetch("idle"); return; }
        if (!uiReady) { finish(); return; }
        ui.evaluateJavascript("window.DF&&DF.back?DF.back():false", v -> {
            if (!"true".equals(v)) finish();
        });
    }

    private FrameLayout.LayoutParams mp() {
        return new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }

    private int dp(float v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }
}
