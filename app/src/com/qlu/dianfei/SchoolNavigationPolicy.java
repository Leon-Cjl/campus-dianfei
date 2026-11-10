package com.qlu.dianfei;

import java.net.URI;

/** Navigation trust is wider than credential/driver trust: SSO is only a redirect hop. */
final class SchoolNavigationPolicy {
    private SchoolNavigationPolicy() {}
    static boolean school(String url) { return origin(url, "qlgydx.mp.sinojy.cn"); }
    static boolean navigate(String url) {
        return school(url) || origin(url, "sso.mp.sinojy.cn");
    }
    private static boolean origin(String url, String host) {
        if (url == null) return false;
        try {
            URI uri = new URI(url);
            return "https".equalsIgnoreCase(uri.getScheme()) && host.equalsIgnoreCase(uri.getHost())
                    && uri.getRawUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (Exception ignored) { return false; }
    }
}
