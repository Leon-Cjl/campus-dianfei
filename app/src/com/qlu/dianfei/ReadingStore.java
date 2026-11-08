package com.qlu.dianfei;

import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;

/** Per-meter archives; hist is only the active archive's compatibility mirror. */
final class ReadingStore {
    private static final String STORE = "readingStore.v1";
    private static final String[] ROOM_STRINGS = {
            "p_away", "p_badges", "p_badgesInit", "p_wxAt", "bgLast", "alertDay"
    };
    private static final String[] ROOM_LONGS = {"lastFetch", "spikeAt"};
    private static final String[] DETAILS = {"room", "campus", "meter", "addr", "status"};

    private ReadingStore() {}

    static synchronized void migrate(Context c) {
        SharedPreferences p = Core.sp(c);
        if (p.contains(STORE)) { read(p); return; }
        try {
            String raw = p.getString("hist", "[]");
            JSONObject legacy = new JSONObject().put("rawHist", raw)
                    .put("capturedAt", System.currentTimeMillis()).put("claimedTo", "")
                    .put("roomState", roomState(p));
            JSONObject root = new JSONObject().put("version", 1).put("activeKey", "")
                    .put("archives", new JSONObject()).put("legacy", legacy);
            SharedPreferences.Editor e = p.edit();
            clearRoomState(e);
            // Keep the selected room/campus as query preferences, not evidence of legacy ownership.
            for (String k : new String[]{"meter", "addr", "status"}) e.remove(k);
            commit(e.putString(STORE, root.toString()).putString("hist", "[]"));
        } catch (Exception ex) { throw failure(ex); }
    }

    /** Revalidates the raw balance before touching preferences. Caller validates query generation. */
    static synchronized void save(Context c, JSONObject result, double balance, long now) throws Exception {
        BalanceParser.Amount amount = BalanceParser.parse(result.optString("balance", null), BalanceParser.SCHOOL_CNY);
        if (Double.isNaN(balance) || Double.isInfinite(balance) || Double.compare(amount.cny.doubleValue(), balance) != 0 || now <= 0)
            throw new IllegalArgumentException("余额或时间无效");
        String school = text(result, "school", false);
        if (!school.isEmpty() && !BalanceParser.SCHOOL.equals(school)) throw new IllegalArgumentException("学校适配器不匹配");
        String campus = text(result, "campus", true), room = text(result, "room", true), meter = text(result, "meter", true);
        String key = new JSONArray().put(BalanceParser.SCHOOL).put(campus).put(room).put(meter).toString();
        migrate(c);
        SharedPreferences p = Core.sp(c);
        JSONObject root = read(p), archives = root.getJSONObject("archives");
        String previous = root.optString("activeKey", "");
        boolean changed = !key.equals(previous);
        if (changed) captureActive(root, p);
        JSONObject archive = archives.optJSONObject(key);
        if (archive == null) {
            archive = new JSONObject().put("school", BalanceParser.SCHOOL).put("campus", campus)
                    .put("room", room).put("meter", meter).put("currency", "CNY")
                    .put("readings", new JSONArray()).put("roomState", new JSONObject());
            archives.put(key, archive);
        }
        JSONArray rows = validRows(archive.getJSONArray("readings"));
        boolean duplicate = false;
        if (rows.length() > 0) {
            JSONArray last = rows.getJSONArray(rows.length() - 1);
            if (now < last.getLong(0) || (now == last.getLong(0) && Double.compare(last.getDouble(1), balance) != 0))
                throw new IllegalArgumentException("本机读取时间回退，请检查系统时间");
            duplicate = now >= last.getLong(0) && now - last.getLong(0) < 20 * 60 * 1000L
                    && Double.compare(last.getDouble(1), balance) == 0;
        }
        if (!duplicate) rows.put(new JSONArray().put(now).put(balance).put(amount.source).put(amount.cny.toPlainString()));
        archive.put("readings", compact(rows, now)).put("lastFetch", now).put("balanceSource", amount.source);
        for (String k : new String[]{"addr", "status"}) archive.put(k, text(result, k, false));
        root.put("activeKey", key);
        SharedPreferences.Editor e = p.edit();
        if (changed) {
            clearRoomState(e);
            restoreRoomState(e, archive.optJSONObject("roomState"));
        }
        for (String k : DETAILS) e.putString(k, archive.optString(k, ""));
        e.putLong("lastFetch", now).putString("hist", archive.getJSONArray("readings").toString());
        commit(e.putString(STORE, root.toString()));
        if (changed) cancelRoomNotices(c);
    }

    /** Archives and disconnects the current room; the next validated result chooses its own key. */
    static synchronized void detach(Context c) {
        migrate(c);
        try {
            SharedPreferences p = Core.sp(c);
            JSONObject root = read(p);
            captureActive(root, p);
            root.put("activeKey", "");
            SharedPreferences.Editor e = p.edit();
            clearRoomState(e);
            for (String k : DETAILS) e.remove(k);
            commit(e.putString(STORE, root.toString()).putString("hist", "[]"));
            cancelRoomNotices(c);
        } catch (Exception ex) { throw failure(ex); }
    }

    /** Clears only the active readings and derived state, never the unassigned legacy backup. */
    static synchronized void clearActive(Context c) {
        migrate(c);
        try {
            SharedPreferences p = Core.sp(c);
            JSONObject root = read(p);
            JSONObject archive = active(root);
            if (archive != null) {
                archive.put("readings", new JSONArray()).remove("lastFetch");
                JSONObject state = roomState(p);
                for (String k : new String[]{"p_badges", "p_badgesInit", "p_wxAt", "bgLast", "alertDay", "lastFetch", "spikeAt"}) state.remove(k);
                archive.put("roomState", state);
            }
            SharedPreferences.Editor e = p.edit().putString("hist", "[]");
            for (String k : new String[]{"p_badges", "p_badgesInit", "p_wxAt", "bgLast", "alertDay", "lastFetch", "spikeAt"}) e.remove(k);
            commit(e.putString(STORE, root.toString()));
            cancelRoomNotices(c);
        } catch (Exception ex) { throw failure(ex); }
    }

    static synchronized JSONObject summary(Context c) {
        migrate(c);
        try {
            JSONObject root = read(Core.sp(c)), legacy = root.getJSONObject("legacy");
            int count = legacyRows(legacy).length();
            String claimed = legacy.optString("claimedTo", "");
            return new JSONObject().put("legacyCount", claimed.isEmpty() ? count : 0)
                    .put("legacyOriginalCount", count).put("archiveCount", root.getJSONObject("archives").length())
                    .put("activeKey", root.optString("activeKey", "")).put("legacyClaimedTo", claimed)
                    .put("legacyInvalid", !legacyValid(legacy));
        } catch (Exception ex) { throw failure(ex); }
    }

    /** Explicit user-confirmed ownership assignment. A second call is always rejected. */
    static synchronized void claimLegacy(Context c) throws Exception {
        migrate(c);
        SharedPreferences p = Core.sp(c);
        JSONObject root = read(p), legacy = root.getJSONObject("legacy"), archive = active(root);
        if (archive == null) throw new IllegalStateException("请先查询当前宿舍");
        if (!legacy.optString("claimedTo", "").isEmpty()) throw new IllegalStateException("旧记录已经认领");
        if (!legacyValid(legacy)) throw new IllegalStateException("旧记录格式异常，原始备份已保留");
        JSONArray old = legacyRows(legacy);
        if (old.length() == 0) throw new IllegalStateException("没有可认领的旧记录");
        JSONArray rows = archive.getJSONArray("readings");
        for (int n = 0; n < old.length(); n++) rows.put(old.getJSONArray(n));
        rows = validRows(rows);
        archive.put("readings", rows);
        legacy.put("claimedTo", root.getString("activeKey")).put("claimedAt", System.currentTimeMillis());
        // Do not import old away/badge/background state merely because the readings were claimed.
        commit(p.edit().putString(STORE, root.toString()).putString("hist", rows.toString()));
    }

    /** Only the archive schema is exported; no getAll(), account, password or session access. */
    static synchronized JSONObject backupJson(Context c) {
        migrate(c);
        try {
            JSONObject root = read(Core.sp(c));
            captureActive(root, Core.sp(c));
            return root;
        } catch (Exception ex) { throw failure(ex); }
    }

    static synchronized void compactStored(Context c) {
        migrate(c);
        try {
            SharedPreferences p = Core.sp(c);
            JSONObject root = read(p), a = active(root);
            if (a == null) {
                if (!"[]".equals(p.getString("hist", "[]"))) commit(p.edit().putString("hist", "[]"));
                return;
            }
            JSONArray rows = compact(a.getJSONArray("readings"), System.currentTimeMillis());
            a.put("readings", rows);
            commit(p.edit().putString(STORE, root.toString()).putString("hist", rows.toString()));
        } catch (Exception ex) { throw failure(ex); }
    }

    /** A snapshot keeps CSV identity and readings consistent during an archive switch. */
    static synchronized JSONObject activeSnapshot(Context c) {
        migrate(c);
        try {
            JSONObject a = active(read(Core.sp(c)));
            return a == null ? null : new JSONObject(a.toString());
        } catch (Exception ex) { throw failure(ex); }
    }

    private static String text(JSONObject d, String key, boolean required) {
        Object value = d.opt(key);
        String s = value instanceof String ? ((String) value).trim() : "";
        if ((required && s.isEmpty()) || s.length() > 512) throw new IllegalArgumentException("缺少或无效的" + key);
        return s;
    }

    private static JSONObject read(SharedPreferences p) {
        try {
            JSONObject root = new JSONObject(p.getString(STORE, ""));
            if (root.getInt("version") != 1) throw new IllegalStateException("不支持的存储版本");
            root.getJSONObject("archives"); root.getJSONObject("legacy");
            return root;
        } catch (Exception ex) { throw failure(ex); }
    }

    private static JSONObject active(JSONObject root) throws Exception {
        return root.getJSONObject("archives").optJSONObject(root.optString("activeKey", ""));
    }

    private static JSONObject roomState(SharedPreferences p) throws Exception {
        JSONObject out = new JSONObject();
        for (String k : ROOM_STRINGS) if (p.contains(k)) out.put(k, p.getString(k, ""));
        for (String k : ROOM_LONGS) if (p.contains(k)) out.put(k, p.getLong(k, 0));
        return out;
    }

    private static void captureActive(JSONObject root, SharedPreferences p) throws Exception {
        JSONObject a = active(root);
        if (a != null) a.put("roomState", roomState(p));
    }

    private static void clearRoomState(SharedPreferences.Editor e) {
        for (String k : ROOM_STRINGS) e.remove(k);
        for (String k : ROOM_LONGS) e.remove(k);
    }

    private static void restoreRoomState(SharedPreferences.Editor e, JSONObject state) throws Exception {
        if (state == null) return;
        // Delivery/retry markers describe a previous query or notification and must start afresh.
        for (String k : new String[]{"p_away", "p_badges", "p_badgesInit"})
            if (state.has(k)) e.putString(k, state.getString(k));
    }

    private static JSONArray legacyRows(JSONObject legacy) {
        try { return validRows(new JSONArray(legacy.getString("rawHist"))); }
        catch (Exception ex) { return new JSONArray(); }
    }

    private static boolean legacyValid(JSONObject legacy) {
        try {
            JSONArray rows = new JSONArray(legacy.getString("rawHist"));
            validRows(rows);
            return true;
        } catch (Exception ex) { return false; }
    }

    private static JSONArray validRows(JSONArray rows) throws Exception {
        ArrayList<JSONArray> list = new ArrayList<>();
        for (int i = 0; i < rows.length(); i++) {
            JSONArray r = rows.getJSONArray(i);
            Object time = r.get(0), value = r.get(1);
            if (!(time instanceof Number) || !(value instanceof Number) || r.getLong(0) <= 0
                    || ((Number) time).doubleValue() != (double) r.getLong(0)
                    || Double.isNaN(r.getDouble(1)) || Double.isInfinite(r.getDouble(1)))
                throw new IllegalArgumentException("无效历史记录");
            list.add(r);
        }
        // Comparator.comparingLong requires API 24; this app also supports Android 5.
        Collections.sort(list, new Comparator<JSONArray>() {
            @Override public int compare(JSONArray a, JSONArray b) { return Long.compare(a.optLong(0), b.optLong(0)); }
        });
        JSONArray out = new JSONArray();
        long lastTime = Long.MIN_VALUE;
        double lastBalance = Double.NaN;
        for (JSONArray r : list) {
            long time = r.getLong(0); double balance = r.getDouble(1);
            if (time == lastTime && Double.compare(balance, lastBalance) == 0) continue;
            out.put(r); lastTime = time; lastBalance = balance;
        }
        return out;
    }

    private static JSONArray compact(JSONArray rows, long now) throws Exception {
        rows = validRows(rows);
        long[] t = new long[rows.length()]; double[] b = new double[rows.length()];
        for (int i = 0; i < t.length; i++) { t[i] = rows.getJSONArray(i).getLong(0); b[i] = rows.getJSONArray(i).getDouble(1); }
        boolean[] keep = Core.compactKeep(t, b, now);
        JSONArray out = new JSONArray();
        for (int i = 0; i < keep.length; i++) if (keep[i]) out.put(rows.getJSONArray(i));
        return out;
    }

    private static void commit(SharedPreferences.Editor e) {
        if (!e.commit()) throw new IllegalStateException("保存读数失败，请重试");
    }

    private static IllegalStateException failure(Exception ex) {
        return ex instanceof IllegalStateException ? (IllegalStateException) ex : new IllegalStateException("读数档案不可用，原数据未覆盖", ex);
    }

    private static void cancelRoomNotices(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) { nm.cancel(Core.N_ALERT); nm.cancel(Core.N_LOGIN); nm.cancel(Core.N_USAGE); }
    }
}
