package com.qlu.dianfei;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 每日提醒的闹钟到点：能在后台查就排一次后台查询（CheckJob，等有网时跑，查完按真实余额提醒）；
 * 查不了（没开自动登录、在假期、应用正开着等）就按记录估算一次。再排好第二天。几毫秒就结束，不常驻。
 * 不对外导出，只有本应用的闹钟能唤起它。
 */
public class CheckReceiver extends BroadcastReceiver {
    static final String ACTION = "com.qlu.dianfei.CHECK";

    @Override
    public void onReceive(Context c, Intent i) {
        if (i == null || !ACTION.equals(i.getAction())) return;
        DianfeiWidget.update(c); // 小组件上的「还能用几天」按今天重新估算
        if (CheckJob.eligible(c)) CheckJob.schedule(c);
        else Core.dailyCheck(c, false);
        Core.scheduleDaily(c);
    }
}
