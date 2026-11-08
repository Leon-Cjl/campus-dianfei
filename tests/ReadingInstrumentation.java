package com.qlu.dianfei;

import android.app.Instrumentation;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Bundle;
import org.json.JSONArray;
import org.json.JSONObject;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicReference;

/** Runs production storage/callback code under a separate UID, without onCreate or a WebView. */
public final class ReadingInstrumentation extends Instrumentation {
    private static final String PACKAGE = "com.qlu.dianfei.datatests";
    private static final String ROOM_A = "QA-A,\"101\"", ROOM_B = "QA-B-202";
    private static final String CAMPUS_A = "QA-Campus-A", CAMPUS_B = "QA-Campus-B";
    private static final String METER_A = "QA-Meter-A", METER_B = "QA-Meter-B";
    private String phase;
    private int checks;
    private final List<String> passed = new ArrayList<>();

    @Override public void onCreate(Bundle args) {
        super.onCreate(args);
        phase = args == null ? "exercise" : args.getString("phase", "exercise");
        start();
    }

    private void check(boolean ok, String message) {
        checks++;
        if (!ok) throw new AssertionError(message);
    }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            Context c = getTargetContext();
            check(PACKAGE.equals(c.getPackageName()), "refusing non-test package");
            check(c.getApplicationInfo().uid == android.os.Process.myUid(), "test UID mismatch");
            check(c.checkCallingOrSelfPermission("android.permission.INTERNET") == PackageManager.PERMISSION_DENIED,
                    "isolated APK unexpectedly has network permission");
            if ("exercise".equals(phase)) exercise(c);
            else if ("reload".equals(phase)) reload(c);
            else throw new IllegalArgumentException("unknown test phase");
            result.putString("stream", "PASS: " + phase + "; " + checks + " assertions; " + String.join("; ", passed) + "\n");
            finish(-1, result);
        } catch (Throwable failure) {
            result.putString("stream", "FAIL: " + phase + "; " + failure.getClass().getSimpleName() + ": " + failure.getMessage() + "\n");
            finish(0, result);
        }
    }

    private static JSONObject reading(String room, String campus, String meter, String balance) throws Exception {
        return new JSONObject().put("school", "qlu-sinojy").put("room", room).put("campus", campus)
                .put("meter", meter).put("balance", balance).put("addr", "synthetic fixture only").put("status", "normal");
    }

    private static JSONObject a(String balance) throws Exception { return reading(ROOM_A, CAMPUS_A, METER_A, balance); }
    private static JSONObject b(String balance) throws Exception { return reading(ROOM_B, CAMPUS_B, METER_B, balance); }
    private static JSONArray history(Context c) throws Exception { return new JSONArray(Core.sp(c).getString("hist", "[]")); }
    private static JSONObject archive(Context c, String key) throws Exception {
        return ReadingStore.backupJson(c).getJSONObject("archives").getJSONObject(key);
    }

    private void exercise(Context c) throws Exception {
        SharedPreferences p = Core.sp(c), evidence = c.getSharedPreferences("datatests_evidence", Context.MODE_PRIVATE);
        check(p.edit().clear().commit() && evidence.edit().clear().commit(), "cannot clear isolated test fixtures");
        QueryGate.invalidate();
        long now = System.currentTimeMillis(), t0 = now - 3 * 86400000L, t1 = now - 2 * 86400000L;
        String raw = "[ [ " + t0 + ", 22.1234567890123 ],\n [" + t1 + ",21.0001000] ]";
        check(p.edit().putString("hist", raw).putString("room", "QA-old-selection")
                .putString("campus", "QA-old-campus").putString("meter", "QA-old-meter").commit(), "cannot seed legacy fixture");
        ReadingStore.migrate(c);
        JSONObject summary = ReadingStore.summary(c);
        check(raw.equals(ReadingStore.backupJson(c).getJSONObject("legacy").getString("rawHist")), "legacy raw string changed during migration");
        check(summary.getInt("legacyCount") == 2 && summary.getInt("archiveCount") == 0, "legacy readings silently assigned");
        check(summary.getString("activeKey").isEmpty() && history(c).length() == 0, "migration guessed active ownership");
        expectClaimRejected(c, "claim without a queried room");
        ReadingStore.migrate(c);
        check(raw.equals(ReadingStore.backupJson(c).getJSONObject("legacy").getString("rawHist")), "repeat migration changed raw legacy backup");
        passed.add("legacy migration preserves exact raw bytes and leaves ownership unassigned");

        ReadingStore.save(c, a("80.1234元"), 80.1234, now - 7200000L);
        String keyA = ReadingStore.summary(c).getString("activeKey");
        check(history(c).length() == 1 && history(c).getJSONArray(0).getDouble(1) == 80.1234, "A did not receive its own reading");
        check(ReadingStore.summary(c).getInt("legacyCount") == 2, "first A reading implicitly claimed legacy");
        check(p.edit().putString("p_away", "[[1000,2000]]").putString("account-test-sentinel", "SYNTHETIC_PRIVATE_FIELD").commit(), "cannot set scoped fixture");
        ReadingStore.save(c, b("9.8765元"), 9.8765, now - 3600000L);
        check(!p.contains("p_away"), "A holiday leaked into B");
        check(!ReadingStore.backupJson(c).toString().contains("SYNTHETIC_PRIVATE_FIELD"), "backup exported unrelated private preferences");
        String keyB = ReadingStore.summary(c).getString("activeKey");
        check(!keyA.equals(keyB), "A and B archive keys collide");
        check(history(c).length() == 1 && history(c).getJSONArray(0).getDouble(1) == 9.8765, "B compatibility history includes A or legacy");
        check(archive(c, keyA).getJSONArray("readings").length() == 1, "switching to B altered A history");
        String csvB = Core.historyCsv(c);
        assertCsv(csvB, ROOM_B, ROOM_A, CAMPUS_B, METER_B, 1);
        ReadingStore.save(c, a("70.0001元"), 70.0001, now - 1800000L);
        check("[[1000,2000]]".equals(p.getString("p_away", "")), "A holiday not restored after switching back");
        check(keyA.equals(ReadingStore.summary(c).getString("activeKey")), "returning to A did not reuse A archive");
        check(history(c).length() == 2 && archive(c, keyB).getJSONArray("readings").length() == 1, "switching A/B mixes readings");
        JSONObject savedA = archive(c, keyA), savedB = archive(c, keyB);
        check(ROOM_A.equals(savedA.getString("room")) && METER_A.equals(savedA.getString("meter")), "A identity changed");
        check(ROOM_B.equals(savedB.getString("room")) && METER_B.equals(savedB.getString("meter")), "B identity changed");
        assertCsv(Core.historyCsv(c), ROOM_A, ROOM_B, CAMPUS_A, METER_A, 2);
        check(ReadingStore.summary(c).getInt("legacyCount") == 2, "archive switching claimed legacy");
        passed.add("A/B archives and CSV labels remain isolated, including quoted room names");

        ReadingStore.claimLegacy(c);
        summary = ReadingStore.summary(c);
        check(keyA.equals(summary.getString("legacyClaimedTo")) && summary.getInt("legacyCount") == 0, "explicit legacy claim has wrong owner");
        check(history(c).length() == 4 && archive(c, keyB).getJSONArray("readings").length() == 1, "claim changed another room or lost readings");
        check(history(c).getJSONArray(0).getLong(0) == t0 && history(c).getJSONArray(0).getDouble(1) == 22.1234567890123, "claim rewrote original legacy value");
        check(raw.equals(ReadingStore.backupJson(c).getJSONObject("legacy").getString("rawHist")), "claim destroyed raw backup");
        expectClaimRejected(c, "duplicate claim in A");
        ReadingStore.save(c, b("8.5000元"), 8.5, now - 600000L);
        expectClaimRejected(c, "duplicate claim after switching to B");
        check(archive(c, keyA).getJSONArray("readings").length() == 4 && history(c).length() == 2, "repeat claim moved or duplicated readings");
        passed.add("legacy claim is explicit, permanent and cannot be repeated across rooms");

        for (String invalid : new String[]{"NaN", "Infinity", "12kWh", "12度", "12USD", ""}) {
            Map<String, ?> before = new HashMap<>(p.getAll());
            boolean rejected = false;
            try { Core.saveResult(c, b(invalid).toString()); } catch (Exception expected) { rejected = true; }
            check(rejected, "invalid balance accepted: " + invalid);
            check(before.equals(p.getAll()), "invalid balance changed stored data: " + invalid);
        }
        for (double invalid : new double[]{Double.NaN, Double.POSITIVE_INFINITY}) {
            Map<String, ?> before = new HashMap<>(p.getAll());
            boolean rejected = false;
            try { ReadingStore.save(c, b("10.0000元"), invalid, now); } catch (Exception expected) { rejected = true; }
            check(rejected && before.equals(p.getAll()), "nonfinite double changed stored data");
        }
        passed.add("NaN, infinity and illegal units are rejected without changing old preferences");

        Map<String, ?> beforeRollback = new HashMap<>(p.getAll());
        boolean rollbackRejected = false;
        try { ReadingStore.save(c, b("99元"), 99, now - 7200000L); } catch (IllegalArgumentException expectedRollback) { rollbackRejected = true; }
        check(rollbackRejected && beforeRollback.equals(p.getAll()), "clock rollback inserted or replaced data");

        rejectLateProductionCallback(c);
        passed.add("production foreground result callback cannot commit an expired QueryGate ticket");

        String expected = canonical(ReadingStore.backupJson(c));
        check(evidence.edit().putString("expectedBackup", expected).putString("legacyRaw", raw)
                .putString("keyA", keyA).putString("keyB", keyB).putString("expectedHist", p.getString("hist", ""))
                .putString("expectedCsv", android.util.Base64.encodeToString(Core.historyCsv(c).getBytes(java.nio.charset.StandardCharsets.UTF_8), android.util.Base64.NO_WRAP)).commit(), "cannot persist cross-process evidence");
        check(p.edit().commit(), "cannot flush isolated preferences");
        QueryGate.invalidate();
    }

    private void reload(Context c) throws Exception {
        SharedPreferences evidence = c.getSharedPreferences("datatests_evidence", Context.MODE_PRIVATE);
        String expected = evidence.getString("expectedBackup", "");
        check(!expected.isEmpty(), "exercise phase evidence missing");
        check(expected.equals(canonical(ReadingStore.backupJson(c))), "storage changed across process restart");
        check(evidence.getString("expectedHist", "").equals(Core.sp(c).getString("hist", "")), "active history did not survive process restart");
        // XML-backed preferences normalize raw CR/LF text; encode the expected bytes, not a multiline fixture.
        String expectedCsv = new String(android.util.Base64.decode(evidence.getString("expectedCsv", ""), android.util.Base64.NO_WRAP), java.nio.charset.StandardCharsets.UTF_8);
        check(expectedCsv.equals(Core.historyCsv(c)), "CSV labels or bytes changed after process restart");
        check(evidence.getString("legacyRaw", "").equals(ReadingStore.backupJson(c).getJSONObject("legacy").getString("rawHist")), "raw legacy backup did not survive process restart");
        String keyA = evidence.getString("keyA", ""), keyB = evidence.getString("keyB", "");
        check(keyB.equals(ReadingStore.summary(c).getString("activeKey")), "active room changed after restart");
        check(archive(c, keyA).getJSONArray("readings").length() == 4 && archive(c, keyB).getJSONArray("readings").length() == 2, "A/B readings changed across restart");
        expectClaimRejected(c, "duplicate claim after process restart");
        String raw = evidence.getString("legacyRaw", "");
        ReadingStore.clearActive(c);
        check(history(c).length() == 0 && archive(c, keyA).getJSONArray("readings").length() == 4, "clearActive erased another room");
        check(raw.equals(ReadingStore.backupJson(c).getJSONObject("legacy").getString("rawHist")), "clearActive erased legacy backup");
        passed.add("real SharedPreferences survive process restart; claim stays locked; clear affects only active room");
    }

    private void expectClaimRejected(Context c, String label) throws Exception {
        Map<String, ?> before = new HashMap<>(Core.sp(c).getAll());
        boolean rejected = false;
        try { ReadingStore.claimLegacy(c); } catch (IllegalStateException expected) { rejected = true; }
        check(rejected, label + " was accepted");
        check(before.equals(Core.sp(c).getAll()), label + " mutated preferences");
    }

    private void assertCsv(String csv, String room, String otherRoom, String campus, String meter, int rows) {
        check(csv != null, "CSV missing");
        String[] lines = csv.split("\\r?\\n");
        check(lines.length == rows + 1, "CSV row count differs from active archive");
        List<String> header = csvCells(lines[0]);
        int roomColumn = -1;
        for (int i = 0; i < header.size(); i++) if (header.get(i).contains("宿舍")) { roomColumn = i; break; }
        check(roomColumn >= 0, "CSV has no room label column");
        for (int i = 1; i < lines.length; i++) {
            List<String> cells = csvCells(lines[i]);
            check(cells.size() == header.size(), "CSV quoting changed column count");
            check(cells.get(roomColumn).contains(room) && !cells.get(roomColumn).contains(otherRoom), "CSV contains another room label");
        }
        check(csv.contains(campus) && csv.contains(meter), "CSV omits campus or meter identity");
    }

    private static List<String> csvCells(String line) {
        List<String> cells = new ArrayList<>(); StringBuilder cell = new StringBuilder(); boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (ch == '"') {
                if (quoted && i + 1 < line.length() && line.charAt(i + 1) == '"') { cell.append('"'); i++; }
                else quoted = !quoted;
            } else if (ch == ',' && !quoted) { cells.add(cell.toString()); cell.setLength(0); }
            else cell.append(ch);
        }
        if (quoted) throw new AssertionError("unterminated CSV field");
        cells.add(cell.toString()); return cells;
    }

    /** No Activity lifecycle, credentials, UI, navigation or WebView is started. */
    private static final class DataActivity extends MainActivity {
        DataActivity(Context context) { attachBaseContext(context); }
    }

    private void rejectLateProductionCallback(Context c) throws Exception {
        Map<String, ?> before = new HashMap<>(Core.sp(c).getAll());
        long old = QueryGate.acquire("datatests-old");
        check(old != 0, "cannot acquire synthetic old query");
        QueryGate.invalidate();
        long current = QueryGate.acquire("datatests-current");
        check(current != 0 && !QueryGate.valid(old), "synthetic query was not invalidated");
        AtomicReference<Throwable> failure = new AtomicReference<>();
        runOnMainSync(() -> {
            DataActivity activity = null;
            try {
                activity = new DataActivity(c);
                Field ticket = MainActivity.class.getDeclaredField("queryTicket"); ticket.setAccessible(true); ticket.setLong(activity, old);
                Field prefs = MainActivity.class.getDeclaredField("sp"); prefs.setAccessible(true); prefs.set(activity, Core.sp(c));
                Method callback = MainActivity.class.getDeclaredMethod("onDriverResult", String.class); callback.setAccessible(true);
                callback.invoke(activity, reading("QA-STALE-ROOM", "QA-STALE-CAMPUS", "QA-STALE-METER", "999.0000元").toString());
                Field known = MainActivity.class.getDeclaredField("sessionKnown"); known.setAccessible(true);
                Field reason = MainActivity.class.getDeclaredField("failReason"); reason.setAccessible(true);
                check(!known.getBoolean(activity) && "".equals(reason.get(activity)), "stale callback reached success/error side effects");
            } catch (Throwable problem) { failure.set(problem); }
            finally {
                if (activity != null) try {
                    Field io = MainActivity.class.getDeclaredField("io"); io.setAccessible(true);
                    ((ExecutorService) io.get(activity)).shutdownNow();
                } catch (Throwable problem) { failure.compareAndSet(null, problem); }
            }
        });
        try {
            if (failure.get() != null) throw new AssertionError("production callback guard test failed", failure.get());
            check(before.equals(Core.sp(c).getAll()), "expired production callback committed or switched rooms");
            check(QueryGate.valid(current), "expired callback released the newer query");
        } finally { QueryGate.release(current); }
    }

    private static String canonical(Object value) throws Exception {
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value; TreeSet<String> keys = new TreeSet<>();
            java.util.Iterator<String> iterator = object.keys(); while (iterator.hasNext()) keys.add(iterator.next());
            StringBuilder out = new StringBuilder("{");
            for (String key : keys) { if (out.length() > 1) out.append(','); out.append(JSONObject.quote(key)).append(':').append(canonical(object.get(key))); }
            return out.append('}').toString();
        }
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value; StringBuilder out = new StringBuilder("[");
            for (int i = 0; i < array.length(); i++) { if (i > 0) out.append(','); out.append(canonical(array.get(i))); }
            return out.append(']').toString();
        }
        return value == null || value == JSONObject.NULL ? "null" : value instanceof String ? JSONObject.quote((String) value) : value.toString();
    }
}
