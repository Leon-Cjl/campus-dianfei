package com.qlu.dianfei;

import android.os.Handler;

/** Lifecycle-bound state holder, following NiA's UDF contract with the existing Java/WebView runtime.
 * This is not an AndroidX ViewModel: the Activity handles configuration changes itself.
 * Only immutable serialized snapshots cross the JavascriptInterface thread boundary.
 */
final class ElectricityViewModel implements AutoCloseable {
    interface Observer { void render(String state); }
    private final Handler main;
    private final Observer observer;
    private String data = "{\"hist\":[],\"prefs\":{}}", environment = "{}", payload = "";
    private volatile String current = "{\"hist\":[],\"prefs\":{},\"dataReady\":false}";
    private boolean ready, error, active, closed, pending;
    private long revision;
    private final Runnable publish;

    ElectricityViewModel(Handler main, Observer observer) {
        this.main = main; this.observer = observer;
        publish = () -> {
            pending = false;
            if (active && !closed) this.observer.render(current);
        };
    }
    String state() { return current; }
    void data(String json) { data = json; ready = true; error = false; rebuild(); }
    void failed() { error = true; rebuild(); } // Preserve the last good readings on a local read failure.
    void environment(String json) { environment = json; rebuild(); }
    void start() { active = true; schedule(); }
    void replay() { schedule(); }
    void stop() { active = false; main.removeCallbacks(publish); pending = false; }

    private void rebuild() {
        if (closed) return;
        String env = environment.length() > 2 ? "," + environment.substring(1, environment.length() - 1) : "";
        String next = data.substring(0, data.length() - 1) + env
                + ",\"dataReady\":" + ready + ",\"dataError\":" + error;
        if (next.equals(payload)) return;
        payload = next;
        current = next + ",\"stateRevision\":" + (++revision) + "}";
        schedule();
    }
    private void schedule() {
        if (active && !closed && !pending) { pending = true; main.postDelayed(publish, 16); }
    }
    @Override public void close() { stop(); closed = true; }
}
