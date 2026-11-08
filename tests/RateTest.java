import com.qlu.dianfei.CoreTestAccess;

import java.io.BufferedReader;
import java.io.FileReader;
import java.util.ArrayList;
import java.util.List;

/**
 * 读 cases.txt（每组：now 一行，可选 "away 离校 返校 …" 一行，然后若干 "t b" 行，空行分隔），
 * 每组输出一行「Core.rate() 结果 + 空格 + Core.spike() 结果」，供与 JS 对拍。
 */
public class RateTest {
    public static void main(String[] a) throws Exception {
        BufferedReader r = new BufferedReader(new FileReader(a[0]));
        List<String> block = new ArrayList<>();
        String line;
        StringBuilder out = new StringBuilder();
        while ((line = r.readLine()) != null) {
            if (line.trim().isEmpty()) { if (!block.isEmpty()) out.append(run(block)).append('\n'); block.clear(); }
            else block.add(line.trim());
        }
        if (!block.isEmpty()) out.append(run(block)).append('\n');
        System.out.print(out);
    }

    static String run(List<String> b) {
        long now = Long.parseLong(b.get(0));
        int k = 1;
        long[][] aw = new long[0][];
        if (b.size() > 1 && b.get(1).startsWith("away")) {
            String[] p = b.get(1).split(" ");
            aw = new long[(p.length - 1) / 2][];
            for (int i = 0; i < aw.length; i++) aw[i] = new long[]{Long.parseLong(p[1 + 2 * i]), Long.parseLong(p[2 + 2 * i])};
            k = 2;
        }
        int n = b.size() - k;
        long[] t = new long[n];
        double[] v = new double[n];
        for (int i = 0; i < n; i++) { String[] p = b.get(i + k).split(" "); t[i] = Long.parseLong(p[0]); v[i] = Double.parseDouble(p[1]); }
        double x = CoreTestAccess.rate(t, v, now, aw);
        double[] s = CoreTestAccess.spike(t, v, aw);
        return (Double.isNaN(x) ? "null" : String.format(java.util.Locale.ROOT, "%.9f", x)) + " " +
                (s == null ? "null" : String.format(java.util.Locale.ROOT, "%.9f/%.9f/%d", s[0], s[2], (long) s[3]));
    }
}
