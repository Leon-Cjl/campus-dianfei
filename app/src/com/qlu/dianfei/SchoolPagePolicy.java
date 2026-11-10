package com.qlu.dianfei;

/** Reveal a stalled homepage without navigating away from its SSO bootstrap context. */
final class SchoolPagePolicy {
    static final long PROBE_MS = 400L;
    static final long BOOTSTRAP_GRACE_MS = 20000L;
    private SchoolPagePolicy() {}
    static boolean revealPage(long elapsed, boolean knownSession, boolean fallbackUsed, String path) {
        return elapsed >= BOOTSTRAP_GRACE_MS && !knownSession && !fallbackUsed
                && ("/".equals(path) || "".equals(path));
    }
}
