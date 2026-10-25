import com.qlu.dianfei.CoreTestAccess;

import java.io.BufferedReader;
import java.io.FileReader;
import java.util.ArrayList;
import java.util.List;

/** 读 cases.txt（每组：now 一行，然后若干 "t b" 行，空行分隔），输出 Core.rate() 结果，供与 JS 对拍。 */
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
        int n = b.size() - 1;
        long[] t = new long[n];
        double[] v = new double[n];
        for (int i = 0; i < n; i++) { String[] p = b.get(i + 1).split(" "); t[i] = Long.parseLong(p[0]); v[i] = Double.parseDouble(p[1]); }
        double x = CoreTestAccess.rate(t, v, now);
        return Double.isNaN(x) ? "null" : String.format(java.util.Locale.ROOT, "%.9f", x);
    }
}
