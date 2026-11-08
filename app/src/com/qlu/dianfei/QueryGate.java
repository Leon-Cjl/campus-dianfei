package com.qlu.dianfei;

/** One active school session, across Activity, alarm and shortcuts. Pure Java for race tests. */
final class QueryGate {
    private static long serial, active;
    private static String owner = "";
    private QueryGate() {}

    static synchronized long acquire(String who) {
        if (active != 0) return 0;
        owner = who;
        return active = ++serial;
    }
    static synchronized boolean valid(long ticket) { return ticket != 0 && ticket == active; }
    static synchronized boolean busy() { return active != 0; }
    static synchronized String owner() { return owner; }
    static synchronized void release(long ticket) {
        if (valid(ticket)) { active = 0; owner = ""; }
    }
    static synchronized void invalidate() { ++serial; active = 0; owner = ""; }
}
