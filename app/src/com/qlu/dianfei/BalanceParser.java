package com.qlu.dianfei;

import java.math.BigDecimal;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Strict CNY grammar. Never remove arbitrary text to manufacture a number. */
final class BalanceParser {
    static final String SCHOOL = "qlu-sinojy";
    // Contract of the existing QLU SL321110 adapter's remaining-balance field.
    static final String SCHOOL_CNY = "qlu-sinojy:SL321110:remaining:CNY:v1";
    private static final String UNIT = "(?:人民币元|人民币|CNY|RMB|[¥￥]|元)";
    private static final Pattern MONEY = Pattern.compile(
            "^([+-]?)\\s*(" + UNIT + ")?\\s*([+-]?)\\s*([0-9]+(?:\\.[0-9]{1,4})?)\\s*(" + UNIT + ")?$",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    static final class Amount {
        final BigDecimal cny;
        final String source;
        Amount(BigDecimal cny, String source) { this.cny = cny; this.source = source; }
    }

    static Amount parse(String raw, String bareContract) {
        if (raw == null || raw.length() > 128) throw new IllegalArgumentException("余额格式无效");
        String s = raw.replace('\u2212', '-').replace('\uff0d', '-').replace('\ufe63', '-')
                .replace('\u00a0', ' ').replace('\u202f', ' ').replace('\u3000', ' ').trim();
        Matcher m = MONEY.matcher(s);
        if (!m.matches() || (!m.group(1).isEmpty() && !m.group(3).isEmpty()))
            throw new IllegalArgumentException("余额须为人民币金额，最多四位小数");
        boolean explicit = m.group(2) != null || m.group(5) != null;
        if (!explicit && !SCHOOL_CNY.equals(bareContract))
            throw new IllegalArgumentException("无单位余额缺少学校 CNY 契约");
        BigDecimal amount = new BigDecimal(m.group(1) + m.group(3) + m.group(4));
        double value = amount.doubleValue();
        if (Double.isNaN(value) || Double.isInfinite(value) || BigDecimal.valueOf(value).compareTo(amount) != 0)
            throw new IllegalArgumentException("余额超出可精确保存范围");
        return new Amount(amount, explicit ? "explicit:CNY" : SCHOOL_CNY);
    }

    private BalanceParser() {}
}
