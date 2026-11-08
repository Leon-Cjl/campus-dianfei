package com.qlu.dianfei;

import java.util.Calendar;

/** Pure calendar policy, independently testable without an Android runtime. */
final class DailyAlarmPlan {
    static String time(String raw) {
        if (raw != null && raw.matches("[0-9]{1,2}:[0-9]{2}")) {
            String[] parts = raw.split(":");
            int hour = Integer.parseInt(parts[0]), minute = Integer.parseInt(parts[1]);
            if (hour < 24 && minute < 60) return String.format(java.util.Locale.US, "%02d:%02d", hour, minute);
        }
        return "12:00";
    }

    static long due(long now, String time, String doneDay) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(now);
        String[] parts = time(time).split(":");
        cal.set(Calendar.HOUR_OF_DAY, Integer.parseInt(parts[0]));
        cal.set(Calendar.MINUTE, Integer.parseInt(parts[1]));
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        // Today's unfinished due remains today, including when overdue. Android catches it up.
        if (day(now).equals(doneDay)) cal.add(Calendar.DAY_OF_MONTH, 1);
        return cal.getTimeInMillis();
    }

    static String day(long timestamp) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(timestamp);
        return cal.get(Calendar.YEAR) + "-" + (cal.get(Calendar.MONTH) + 1) + "-" + cal.get(Calendar.DAY_OF_MONTH);
    }

    private DailyAlarmPlan() {}
}
