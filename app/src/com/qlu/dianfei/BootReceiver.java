package com.qlu.dianfei;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 手机重启或应用更新后系统闹钟会被清空：重新排好每日查询，设完即退出，不常驻。 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String a = i == null ? null : i.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(a) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) return;
        Core.migrate(c);
        Core.scheduleDaily(c);
        DianfeiWidget.update(c);
    }
}
