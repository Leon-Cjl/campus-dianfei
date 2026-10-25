package com.qlu.dianfei;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 桌面小组件：剩余电费、按最近用电速度估算的「今天大约还能用几天」、宿舍、上次更新时间。
 * 不定时自更新，不联网：查到新读数、每日估算提醒、打开应用时由应用调用 update() 刷新显示。
 * 配色规则与界面一致：满足提醒条件为红，离提醒不远为黄。
 */
public class DianfeiWidget extends AppWidgetProvider {
    private static final long DAY = 24 * 3600 * 1000L;

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        update(c);
    }

    static void update(Context c) {
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            ComponentName cn = new ComponentName(c, DianfeiWidget.class);
            if (m.getAppWidgetIds(cn).length == 0) return;
            m.updateAppWidget(cn, views(c));
        } catch (Exception ignore) {}
    }

    private static RemoteViews views(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_dianfei);
        SharedPreferences p = Core.sp(c);
        double[] s = Core.estimate(c, System.currentTimeMillis());
        long last = p.getLong("lastFetch", 0);
        String room = p.getString("room", "");
        v.setTextViewText(R.id.w_room, room);

        if (Double.isNaN(s[0])) {
            v.setTextViewText(R.id.w_balance, "—");
            v.setTextViewText(R.id.w_days, "点开查一次电费");
            v.setTextColor(R.id.w_days, col(c, R.color.widget_accent));
            v.setTextViewText(R.id.w_time, "");
        } else {
            v.setTextViewText(R.id.w_balance, String.format(Locale.CHINA, "¥%.2f", s[0]));
            // 和应用首页一致：上次读数超过一天，大数字是那天查到的余额，不是现在的
            boolean stale = last > 0 && System.currentTimeMillis() - last >= DAY;
            v.setTextViewText(R.id.w_label, stale ? new SimpleDateFormat("M月d日", Locale.CHINA).format(new Date(last)) + "的余额" : "剩余电费");
            // 估算今天的情况：从上次读数起按日均用电扣掉（假期里的时间不扣）
            double est = s[2], estDays = s[3];
            double thr = parse(Core.pref(c, "thr", "10"), 10);
            int alertDays = (int) parse(Core.pref(c, "alertDays", "3"), 3);

            String daysTxt = Double.isNaN(estDays) ? "用电速度计算中"
                    : estDays >= 99 ? "还能用 99+ 天"
                    : estDays < 1 ? "不到 1 天就用完" : "约还能用 " + (int) Math.floor(estDays) + " 天";
            boolean alert = est <= thr || (alertDays > 0 && !Double.isNaN(estDays) && estDays <= alertDays);
            boolean near = !alert && (Double.isNaN(estDays) ? est <= thr * 2 : estDays <= Math.max(7, 2 * alertDays));
            int color = alert ? R.color.widget_err : near ? R.color.widget_warn : R.color.widget_ok;
            v.setTextViewText(R.id.w_days, daysTxt);
            v.setTextColor(R.id.w_days, col(c, color));
            v.setTextColor(R.id.w_balance, col(c, alert ? R.color.widget_err : R.color.widget_text));
            v.setTextViewText(R.id.w_time, last > 0 ? when(last) : "");
        }

        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(c, 21, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return v;
    }

    private static String when(long t) {
        long now = System.currentTimeMillis();
        if (Core.dayKey(t).equals(Core.dayKey(now)))
            return "今天 " + new SimpleDateFormat("HH:mm", Locale.CHINA).format(new Date(t)) + " 查询";
        if (Core.dayKey(t + DAY).equals(Core.dayKey(now)))
            return "昨天 " + new SimpleDateFormat("HH:mm", Locale.CHINA).format(new Date(t)) + " 查询";
        return new SimpleDateFormat("M月d日 HH:mm", Locale.CHINA).format(new Date(t)) + " 查询";
    }

    /** Context.getColor 要 Android 6.0；应用支持到 5.0，这里按版本取色 */
    @SuppressWarnings("deprecation")
    private static int col(Context c, int id) {
        return android.os.Build.VERSION.SDK_INT >= 23 ? c.getColor(id) : c.getResources().getColor(id);
    }

    private static double parse(String s, double def) {
        try { return Double.parseDouble(s); } catch (Exception e) { return def; }
    }
}
