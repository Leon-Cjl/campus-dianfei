package com.qlu.dianfei;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Local data source of truth. UI snapshots contain no credentials and never load the school website. */
final class ElectricityRepository implements AutoCloseable {
    private final Context app;
    private final SharedPreferences preferences;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final LatestSnapshot<String> snapshots;
    private final SharedPreferences.OnSharedPreferenceChangeListener listener = (p, key) -> refresh();
    private boolean observing;

    ElectricityRepository(Context context, Handler main, LatestSnapshot.Observer<String> observer) {
        app = context.getApplicationContext();
        preferences = Core.sp(app);
        snapshots = new LatestSnapshot<>(worker, r -> main.post(r), this::readSnapshot, observer);
    }

    static void initialize(Context context) {
        ReadingStore.migrate(context);
        Core.migrate(context);
    }

    // Both foreground and background adapters persist through the same validation/storage path.
    // Query callbacks and identity changes run on Android's main thread, so the ticket check and
    // synchronous transaction cannot interleave with a new identity. Do not move this write to IO
    // without also making invalidation and storage commit one transaction.
    static double saveResult(Context context, long ticket, String json) throws Exception {
        if (!QueryGate.valid(ticket)) throw new IllegalStateException("obsolete query");
        return Core.saveResult(context, json);
    }

    void detach() { ReadingStore.detach(app); refresh(); }
    void clearActive() { ReadingStore.clearActive(app); refresh(); }
    void claimLegacy() throws Exception { ReadingStore.claimLegacy(app); refresh(); }
    String historyCsv() throws Exception { return Core.historyCsv(app); }
    String backupJson() { return ReadingStore.backupJson(app).toString(); }
    void setPreference(String key, String value) {
        if (key != null) preferences.edit().putString("p_" + key, value == null ? "" : value).apply();
    }

    void start() {
        if (!observing) { preferences.registerOnSharedPreferenceChangeListener(listener); observing = true; }
        refresh();
    }
    void stop() {
        if (observing) { preferences.unregisterOnSharedPreferenceChangeListener(listener); observing = false; }
    }
    void refresh() { snapshots.refresh(); }

    private String readSnapshot() throws Exception {
        // Archive identity, readings and summary are read under the same lock as archive writes.
        synchronized (ReadingStore.class) {
            Map<String, ?> values = preferences.getAll();
            JSONObject out = new JSONObject();
            JSONArray hist = new JSONArray(values.containsKey("hist") ? (String) values.get("hist") : "[]");
            out.put("hist", hist).put("storage", ReadingStore.summary(app));
            for (String key : new String[]{"room", "campus", "addr", "meter", "status", "bgLast"})
                out.put(key, values.containsKey(key) ? values.get(key) : "");
            long last = hist.length() == 0 ? 0 : hist.getJSONArray(hist.length() - 1).getLong(0);
            out.put("lastFetch", values.containsKey("lastFetch") ? values.get("lastFetch") : last);
            out.put("nextAuto", values.containsKey("nextAuto") ? values.get("nextAuto") : 0);
            out.put("alarmMiss", values.containsKey("alarmMiss") ? values.get("alarmMiss") : 0);
            JSONObject prefs = new JSONObject();
            for (Map.Entry<String, ?> entry : values.entrySet())
                if (entry.getKey().startsWith("p_")) prefs.put(entry.getKey().substring(2), String.valueOf(entry.getValue()));
            return out.put("prefs", prefs).toString();
        }
    }

    @Override public void close() { stop(); snapshots.close(); worker.shutdown(); }
}
