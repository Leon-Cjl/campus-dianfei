package com.qlu.dianfei;

import java.util.Calendar;
import java.util.TimeZone;

public final class BalanceAlarmTest {
    private static int assertions;
    public static void main(String[] args) {
        money("−12.5001 元", "-12.5001");
        money("￥12.0001", "12.0001");
        money(" 12.5 CNY ", "12.5");
        money("-0.0001", "-0.0001");
        for (String bad : new String[]{"12.5度","12 kWh","12 USD","12.5 13","余额12元","12.00001元","NaN","Infinity","--2元","1,234.50元","1e4元"}) {
            boolean rejected = false;
            try { BalanceParser.parse(bad, BalanceParser.SCHOOL_CNY); } catch (IllegalArgumentException e) { rejected = true; }
            check(rejected, "strict rejection: " + bad);
        }
        boolean rejected = false;
        try { BalanceParser.parse("12.5", "unknown-adapter"); } catch (IllegalArgumentException e) { rejected = true; }
        check(rejected, "unitless number needs explicit adapter contract");
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Shanghai"));
        Calendar c = Calendar.getInstance();
        c.clear(); c.set(2026, Calendar.NOVEMBER, 2, 11, 59, 30);
        long now = c.getTimeInMillis();
        c.set(Calendar.HOUR_OF_DAY,12); c.set(Calendar.MINUTE,0); c.set(Calendar.SECOND,0);
        long noon = c.getTimeInMillis();
        check(DailyAlarmPlan.due(now,"12:00","") == noon, "11:59:30 must keep today's noon");
        check(DailyAlarmPlan.due(noon+30000,"12:00","") == noon, "unfinished overdue task can catch up");
        c.add(Calendar.DATE,1);
        check(DailyAlarmPlan.due(now,"12:00",DailyAlarmPlan.day(now)) == c.getTimeInMillis(), "completed day schedules tomorrow");
        check(DailyAlarmPlan.time("99:20").equals("12:00"), "invalid hour fallback");
        check(DailyAlarmPlan.time("8:05").equals("08:05"), "canonical time");
        System.out.println("Balance/Alarm: " + assertions + " assertions passed");
    }
    private static void money(String raw, String expected) {
        check(BalanceParser.parse(raw,BalanceParser.SCHOOL_CNY).cny.toPlainString().equals(expected),raw);
    }
    private static void check(boolean ok, String why) { assertions++; if (!ok) throw new AssertionError(why); }
}
