package com.qlu.dianfei;

public final class QueryGateTest {
    public static void main(String[] args) throws Exception {
        QueryGate.invalidate();
        long foreground = QueryGate.acquire("foreground");
        require(foreground != 0, "foreground acquire");
        require(QueryGate.acquire("background") == 0, "background must not overlap after Home");
        QueryGate.invalidate();
        long background = QueryGate.acquire("background");
        require(background != foreground && !QueryGate.valid(foreground), "room/account change invalidates old result");
        QueryGate.release(foreground);
        require(QueryGate.valid(background), "late completion cannot release newer query");
        QueryGate.release(background);
        require(!QueryGate.valid(background), "duplicate result rejected");
        final int[] won = {0};
        Thread[] racers = new Thread[20];
        for (int i = 0; i < racers.length; i++) {
            racers[i] = new Thread(() -> { if (QueryGate.acquire("racer") != 0) synchronized (won) { won[0]++; } });
            racers[i].start();
        }
        for (Thread t : racers) t.join();
        require(won[0] == 1, "exactly one winner across concurrent requests");
        QueryGate.invalidate();
        System.out.println("QueryGate: 6 race/cancellation assertions passed");
    }
    private static void require(boolean yes, String name) { if (!yes) throw new AssertionError(name); }
}
