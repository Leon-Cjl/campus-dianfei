package com.qlu.dianfei;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** 凭据只以密文写入应用私有目录，密钥留在 Android Keystore。 */
final class CredentialStore {
    private static final String ALIAS = "dianfei.login.v1";
    private final SharedPreferences prefs;
    // 界面显示用的遮盖账号只在内存里缓存，避免每次推送界面状态都走一遍 Keystore 解密（也少让密码明文进内存）
    private String masked;

    CredentialStore(Context context) {
        prefs = context.getSharedPreferences("df_credentials", Context.MODE_PRIVATE);
    }

    boolean hasSaved() { return prefs.contains("data"); }
    boolean autoLogin() { return hasSaved() && prefs.getBoolean("auto", true); }

    boolean needsAttention() { return prefs.getBoolean("attention", false); }
    void setNeedsAttention(boolean value) { prefs.edit().putBoolean("attention", value).commit(); }

    private SecretKey key(boolean create) throws Exception {
        if (Build.VERSION.SDK_INT < 23) throw new IllegalStateException("需要 Android 6.0 或以上系统才能安全保存账号");
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(ALIAS)) return (SecretKey) ks.getKey(ALIAS, null);
        if (!create) throw new IllegalStateException("保存的账号已失效，请重新填写");
        KeyGenerator gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        gen.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return gen.generateKey();
    }

    synchronized JSONObject read() throws Exception {
        if (!hasSaved()) return null;
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(false),
                new GCMParameterSpec(128, Base64.decode(prefs.getString("iv", ""), Base64.NO_WRAP)));
        byte[] clear = cipher.doFinal(Base64.decode(prefs.getString("data", ""), Base64.NO_WRAP));
        try { return new JSONObject(new String(clear, StandardCharsets.UTF_8)); }
        finally { java.util.Arrays.fill(clear, (byte) 0); }
    }

    synchronized void save(String username, String password, boolean auto) throws Exception {
        if (username == null || username.trim().isEmpty() || password == null || password.isEmpty())
            throw new IllegalArgumentException("请填写账号和密码");
        masked = null;
        JSONObject value = new JSONObject().put("username", username.trim()).put("password", password);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key(true));
        byte[] clear = value.toString().getBytes(StandardCharsets.UTF_8);
        byte[] encrypted;
        try { encrypted = cipher.doFinal(clear); }
        finally { java.util.Arrays.fill(clear, (byte) 0); }
        if (!prefs.edit().putString("data", Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .putBoolean("auto", auto).remove("attention").commit()) throw new IllegalStateException("手机未能保存账号，请重试");
    }

    void setAutoLogin(boolean enabled) {
        prefs.edit().putBoolean("auto", enabled && hasSaved()).apply();
    }

    synchronized void clear() throws Exception {
        masked = null;
        if (!prefs.edit().clear().commit()) throw new IllegalStateException("清除失败，请重试");
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(ALIAS)) ks.deleteEntry(ALIAS);
    }

    synchronized JSONObject metadata() {
        JSONObject result = new JSONObject();
        try {
            result.put("saved", hasSaved()).put("auto", autoLogin()).put("attention", needsAttention());
            if (hasSaved()) {
                try {
                    if (masked == null) {
                        String name = read().getString("username");
                        masked = name.length() < 5 ? "****" : name.substring(0, 2) + "****" + name.substring(name.length() - 2);
                    }
                    result.put("account", masked);
                } catch (Exception ex) { result.put("unavailable", true); }
            }
        } catch (Exception ignored) {}
        return result;
    }
}
