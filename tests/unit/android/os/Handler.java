package android.os;
import java.util.ArrayDeque;
import java.util.Deque;
/** Test-only scheduler, never packaged. */
public final class Handler {
    private final Deque<Runnable> queue = new ArrayDeque<>();
    public boolean post(Runnable r) { queue.add(r); return true; }
    public boolean postDelayed(Runnable r, long delay) { return post(r); }
    public void removeCallbacks(Runnable r) { queue.removeIf(item -> item == r); }
    public void drain() { while (!queue.isEmpty()) queue.remove().run(); }
    public int size() { return queue.size(); }
}
