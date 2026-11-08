package com.qlu.dianfei;

/** 测试用：从包外调用 Core 里包内可见的纯函数 */
public final class CoreTestAccess {
    public static double rate(long[] t, double[] b, long now) { return Core.rate(t, b, now); }
    public static double rate(long[] t, double[] b, long now, long[][] aw) { return Core.rate(t, b, now, aw); }
    public static double[] spike(long[] t, double[] b, long[][] aw) { return Core.spike(t, b, aw); }
    public static boolean[] compactKeep(long[] t, double[] b, long now) { return Core.compactKeep(t, b, now); }
    public static String dayKey(long t) { return Core.dayKey(t); }
}
