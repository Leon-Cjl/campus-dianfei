import com.qlu.dianfei.CoreTestAccess;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;

/**
 * 记录压缩（Core.compactKeep）的性质测试，随机生成大量读数历史（含长时间不变、同一天多次查询、充值、超过 120 天的老数据）：
 *  1. 除最新一条外不留 120 天以前的点；总数不超过上限；
 *  2. 最新一条一定保留；
 *  3. 120 天内的「日期集合」不变（每天至少留一条）；
 *  4. 120 天内余额下降的总量、充值次数与总额不变；
 *  5. 日均用电 rate() 的结果不变（未触发数量上限时）。
 */
public class CompactTest {
    static final long H = 3600_000L, D = 24 * H, NOW = 1_792_650_000_000L, CUT = NOW - 120 * D;

    public static void main(String[] a) {
        Random r = new Random(20261022);
        int cases = 0, bad = 0;
        long before = 0, after = 0;
        for (int c = 0; c < 400; c++) {
            List<long[]> ts = new ArrayList<>();
            List<Double> bs = new ArrayList<>();
            long t = NOW - (long) (r.nextInt(200) + 1) * D;
            double b = 20 + r.nextDouble() * 100;
            while (t < NOW) {
                ts.add(new long[]{t});
                bs.add(b);
                // 一半概率很快再查一次（余额常常没变），一半概率隔几小时到几天
                t += r.nextBoolean() ? (long) (r.nextDouble() * 3 * H) + 60_000 : (long) ((2 + r.nextDouble() * 60) * H);
                if (r.nextDouble() < 0.45) b -= r.nextDouble() * 2.5;
                if (r.nextDouble() < 0.04) b += 50;
                b = Math.max(0, Math.round(b * 1e6) / 1e6);
            }
            int n = ts.size();
            long[] T = new long[n];
            double[] B = new double[n];
            for (int i = 0; i < n; i++) { T[i] = ts.get(i)[0]; B[i] = bs.get(i); }
            boolean[] keep = CoreTestAccess.compactKeep(T, B, NOW);

            List<Long> kt = new ArrayList<>();
            List<Double> kb = new ArrayList<>();
            for (int i = 0; i < n; i++) if (keep[i]) { kt.add(T[i]); kb.add(B[i]); }
            // 只看 120 天内的原始数据做对比
            List<Long> wt = new ArrayList<>();
            List<Double> wb = new ArrayList<>();
            for (int i = 0; i < n; i++) if (T[i] >= CUT) { wt.add(T[i]); wb.add(B[i]); }

            List<String> err = new ArrayList<>();
            for (int i = 0; i < kt.size() - 1; i++) if (kt.get(i) < CUT) err.add("留了 120 天以前的点");
            if (kt.size() > 800) err.add("超过上限");
            if (!kt.isEmpty() && kt.get(kt.size() - 1) != T[n - 1]) err.add("最新一条没保留");
            if (!days(wt).equals(days(kt))) err.add("日期集合变了");
            double[] s1 = sums(wb), s2 = sums(kb);
            if (Math.abs(s1[0] - s2[0]) > 1e-6) err.add("用电总量变了 " + s1[0] + " → " + s2[0]);
            if (s1[1] != s2[1] || Math.abs(s1[2] - s2[2]) > 1e-6) err.add("充值统计变了");
            double r1 = CoreTestAccess.rate(arr(wt), arrD(wb), NOW), r2 = CoreTestAccess.rate(arr(kt), arrD(kb), NOW);
            if (!(Double.isNaN(r1) && Double.isNaN(r2)) && Math.abs(r1 - r2) > 1e-9) err.add("日均用电变了 " + r1 + " → " + r2);

            cases++;
            before += wt.size();
            after += kt.size();
            if (!err.isEmpty()) { bad++; if (bad <= 5) System.out.println("第 " + c + " 组：" + err); }
        }
        // 边界：全部读数都在 120 天以前（很久没查），最新一条也要留下
        long[] oldT = {NOW - 200 * D, NOW - 150 * D, NOW - 130 * D};
        double[] oldB = {50, 48, 47};
        boolean[] ok = CoreTestAccess.compactKeep(oldT, oldB, NOW);
        cases++;
        if (!ok[2] || ok[0] || ok[1]) { bad++; System.out.println("很久没查：应只保留最新一条"); }
        System.out.println(cases + " 组压缩测试，" + (cases - bad) + " 组通过；120 天内读数 " + before + " 条 → 保留 " + after + " 条");
        System.exit(bad == 0 ? 0 : 1);
    }

    static Set<String> days(List<Long> t) { Set<String> s = new HashSet<>(); for (long x : t) s.add(CoreTestAccess.dayKey(x)); return s; }

    /** {下降总量, 充值次数, 充值总额}：只在相邻点之间算，和界面、通知用的口径一致 */
    static double[] sums(List<Double> b) {
        double drop = 0, rech = 0, amt = 0;
        for (int i = 1; i < b.size(); i++) {
            double d = b.get(i - 1) - b.get(i);
            if (d > 0.0005) drop += d; else if (d < -0.0005) { rech++; amt -= d; }
        }
        return new double[]{drop, rech, amt};
    }

    static long[] arr(List<Long> l) { long[] a = new long[l.size()]; for (int i = 0; i < a.length; i++) a[i] = l.get(i); return a; }
    static double[] arrD(List<Double> l) { double[] a = new double[l.size()]; for (int i = 0; i < a.length; i++) a[i] = l.get(i); return a; }
}
