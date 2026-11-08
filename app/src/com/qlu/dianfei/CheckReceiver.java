package com.qlu.dianfei;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 每日提醒的闹钟到点：先排好第二天；能在后台查就真查一次余额（BgQuery，约 15 秒，最多 50 秒），按真实读数提醒；
 * 查不了（没开自动登录、在假期、应用正开着等）或没查到，就按记录估算一次。查完即退出，不常驻。
 * 不对外导出，只有本应用的闹钟能唤起它。
 */
public class CheckReceiver extends BroadcastReceiver {
    static final String ACTION = "com.qlu.dianfei.CHECK";

    @Override
    public void onReceive(Context c, Intent i) {
        if (i == null || !ACTION.equals(i.getAction())) return;
        android.util.Log.i("dianfei", "daily check alarm");
        Core.noteAlarm(c);
        Core.scheduleDaily(c);
        DianfeiWidget.update(c); // 小组件上的「还能用几天」按今天重新估算
        String skip = BgQuery.skipReason(c);
        if (skip != null) {
            if (!"off".equals(skip)) BgQuery.record(c, "skip:" + skip);
            Core.dailyCheck(c, false);
            return;
        }
        PendingResult pr = goAsync(); // 延长广播处理期；厂商省电限制仍可能使查询失败
        BgQuery.run(c, pr::finish);
    }
}
