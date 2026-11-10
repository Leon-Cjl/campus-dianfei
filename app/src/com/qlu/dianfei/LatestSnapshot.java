package com.qlu.dianfei;

import java.util.concurrent.Executor;

/** Coalesced immutable snapshots. No Android dependency; deterministic race tests use fake executors. */
final class LatestSnapshot<T> implements AutoCloseable {
    interface Source<T> { T read() throws Exception; }
    interface Observer<T> { void changed(T value); void failed(); }
    private final Executor worker, delivery;
    private final Source<T> source;
    private final Observer<T> observer;
    private long revision;
    private boolean scheduled, closed;

    LatestSnapshot(Executor worker, Executor delivery, Source<T> source, Observer<T> observer) {
        this.worker = worker; this.delivery = delivery; this.source = source; this.observer = observer;
    }

    synchronized void refresh() {
        if (closed) return;
        revision++;
        if (scheduled) return;
        scheduled = true;
        worker.execute(this::readLatest);
    }

    private void readLatest() {
        while (true) {
            final long version;
            synchronized (this) { if (closed) return; version = revision; }
            T value = null;
            boolean success = true;
            try { value = source.read(); } catch (Exception ex) { success = false; }
            synchronized (this) {
                if (closed) return;
                if (version != revision) continue;
                scheduled = false;
            }
            final T snapshot = value;
            final boolean ok = success;
            delivery.execute(() -> {
                synchronized (LatestSnapshot.this) {
                    if (closed || version != revision) return;
                    if (ok) observer.changed(snapshot); else observer.failed();
                }
            });
            return;
        }
    }

    @Override public synchronized void close() { closed = true; revision++; }
}
