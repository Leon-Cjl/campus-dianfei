package com.qlu.dianfei;
import android.os.Handler;
import java.util.*;
import java.util.concurrent.Executor;

public final class ArchitectureTest {
    private static int assertions;
    private static void check(boolean ok, String msg) { assertions++; if (!ok) throw new AssertionError(msg); }
    private static final class Queue implements Executor {
        final Deque<Runnable> queue = new ArrayDeque<>();
        public void execute(Runnable r) { queue.add(r); }
        void drain() { while (!queue.isEmpty()) queue.remove().run(); }
    }
    public static void main(String[] args) {
        Queue worker = new Queue(), main = new Queue();
        List<String> seen = new ArrayList<>(); int[] reads = {0}, errors = {0};
        boolean[] fail = {false};
        LatestSnapshot<String> store = new LatestSnapshot<>(worker, main, () -> {
            reads[0]++; if (fail[0]) throw new Exception("synthetic"); return "data-" + reads[0];
        }, new LatestSnapshot.Observer<String>() {
            public void changed(String s) { seen.add(s); }
            public void failed() { errors[0]++; }
        });
        for (int i=0;i<100;i++) store.refresh();
        check(worker.queue.size()==1, "100 invalidations must coalesce");
        check(reads[0]==0, "loading must be off the caller thread");
        worker.drain();
        store.refresh(); // Old data is already queued for delivery; a new archive was selected.
        main.drain();
        check(seen.isEmpty(), "obsolete queued archive result must be suppressed");
        worker.drain(); main.drain();
        check(seen.equals(List.of("data-2")), "only latest archive delivered");
        fail[0]=true; store.refresh(); worker.drain(); main.drain();
        check(errors[0]==1 && seen.size()==1, "read failure must retain previous data");
        fail[0]=false; store.refresh(); worker.drain(); main.drain();
        check(seen.size()==2, "read failure can recover");
        store.refresh(); worker.drain(); store.close(); main.drain();
        check(seen.size()==2, "closed store must not deliver queued result");
        store.refresh(); check(worker.queue.isEmpty(), "closed store cannot schedule");
        // Change arrives inside source.read(), not merely before/after the worker task.
        final LatestSnapshot<String>[] racing = new LatestSnapshot[1]; int[] passes={0};
        racing[0] = new LatestSnapshot<>(worker,main,()->{
            if (++passes[0]==1) racing[0].refresh();
            return "race-"+passes[0];
        }, new LatestSnapshot.Observer<String>() {
            public void changed(String s) { seen.add(s); }
            public void failed() { throw new AssertionError(); }
        });
        racing[0].refresh(); worker.drain(); main.drain();
        check(passes[0]==2 && seen.get(seen.size()-1).equals("race-2"), "in-flight invalidation must reread");
        racing[0].close();

        Handler handler = new Handler(); List<String> states = new ArrayList<>();
        ElectricityViewModel vm = new ElectricityViewModel(handler, states::add);
        check(vm.state().contains("\"dataReady\":false"), "initial state must distinguish loading from empty");
        vm.data("{\"hist\":[[1,12]],\"prefs\":{\"theme\":\"dark\"}}");
        check(handler.size()==0, "inactive UI never renders");
        vm.start();
        vm.environment("{\"fetch\":\"working\",\"fetchStep\":\"balance\"}");
        vm.environment("{\"fetch\":\"ok\",\"queryMs\":42}");
        check(handler.size()==1, "same-frame states must coalesce");
        handler.drain();
        check(states.size()==1 && states.get(0).contains("\"fetch\":\"ok\"") && states.get(0).contains("[[1,12]]"), "complete state combines data and query");
        vm.replay(); handler.drain();
        check(states.size()==2, "page readiness replays latest state without a data change");
        String previous=vm.state(); vm.environment("{\"fetch\":\"ok\",\"queryMs\":42}");
        check(handler.size()==0 && vm.state().equals(previous), "equal state must not emit/revise");
        vm.failed(); handler.drain();
        check(vm.state().contains("[[1,12]]") && vm.state().contains("\"dataError\":true"), "failure must retain cached readings");
        vm.data("{\"hist\":[[2,11]],\"prefs\":{}}");
        vm.stop(); handler.drain(); int count=states.size();
        check(vm.state().contains("[[2,11]]"), "inactive state still advances");
        vm.start(); handler.drain(); check(states.size()==count+1 && states.get(count).contains("[[2,11]]"), "resume renders latest cache once");
        vm.close(); vm.environment("{}"); handler.drain();
        check(states.size()==count+1, "destroyed UI cannot render");
        check(!SchoolPagePolicy.revealPage(19999,false,false,"/"), "allow initial homepage bootstrap to finish");
        check(SchoolPagePolicy.revealPage(20000,false,false,"/"), "stalled homepage reveals the original school page without stripping SSO parameters");
        check(!SchoolPagePolicy.revealPage(50000,true,false,"/"), "known school sessions must never be forced back to login");
        check(!SchoolPagePolicy.revealPage(50000,false,true,"/"), "fallback must happen only once");
        check(!SchoolPagePolicy.revealPage(50000,false,false,"/SL200000"), "never reload a user's login form");
        check(!SchoolPagePolicy.revealPage(50000,false,false,"/SL321110"), "never interrupt balance or campus routes");
        check(!SchoolPagePolicy.revealPage(50000,false,false,null), "unknown documents do not trigger navigation");
        String sso = "https://sso.mp.sinojy.cn/oauth2.0/authorize?redirect_uri=https%3A%2F%2Fqlgydx.mp.sinojy.cn%2F";
        check(SchoolNavigationPolicy.navigate(sso), "real SSO authorization hop must be allowed");
        check(!SchoolNavigationPolicy.school(sso), "SSO navigation never grants driver/credential access");
        check(SchoolNavigationPolicy.school("https://qlgydx.mp.sinojy.cn/SL200000?ssoLogin=true"), "school login remains trusted");
        check(SchoolNavigationPolicy.navigate("https://sso.mp.sinojy.cn:443/oauth2.0/authorize"), "default HTTPS port allowed");
        for (String invalid : new String[]{null, "", "not a url", "http://sso.mp.sinojy.cn/oauth2.0/authorize",
                "https://sso.mp.sinojy.cn:8443/", "https://sso.mp.sinojy.cn.evil.example/", "https://evil.example/sso.mp.sinojy.cn",
                "https://user@sso.mp.sinojy.cn/", "https://sso.mp.sinojy.cn@evil.example/", "javascript:alert(1)"})
            check(!SchoolNavigationPolicy.navigate(invalid), "reject untrusted SSO navigation: " + invalid);
        System.out.println(assertions+" architecture assertions passed");
    }
}
