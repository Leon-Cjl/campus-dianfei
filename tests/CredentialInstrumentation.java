package com.qlu.dianfei;

import android.app.Instrumentation;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Base64;
import org.json.JSONObject;

/** 独立测试应用的 UID/Keystore，不接触正式应用的账号、记录或网络。 */
public class CredentialInstrumentation extends Instrumentation {
    private String phase;
    private static final String USER = "TEST_ACCOUNT_ONLY", PASS = "TEST_PASSWORD_ONLY_\"'\\\n中文";

    @Override public void onCreate(Bundle args) {
        super.onCreate(args);
        phase = args == null ? "save" : args.getString("phase", "save");
        start();
    }

    private void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            Context context = getTargetContext();
            CredentialStore store = new CredentialStore(context);
            SharedPreferences prefs = context.getSharedPreferences("df_credentials", Context.MODE_PRIVATE);
            if ("save".equals(phase)) {
                store.clear();
                store.save(USER, PASS, true);
                check(store.hasSaved() && store.autoLogin(), "save or auto flag missing");
                String disk = new JSONObject(prefs.getAll()).toString();
                check(!disk.contains(USER) && !disk.contains("TEST_PASSWORD"), "plaintext in preferences");
                check(prefs.getAll().size() == 3, "unexpected stored fields");
                result.putString("stream", "PASS: Android Keystore encryption; no plaintext account/password on disk.\n");
            } else {
                JSONObject account = store.read();
                check(account != null && USER.equals(account.getString("username")) && PASS.equals(account.getString("password")), "restart roundtrip mismatch");
                JSONObject meta = store.metadata();
                check(!meta.toString().contains(USER) && !meta.toString().contains("password"), "metadata exposes secrets");
                String original = prefs.getString("data", "");
                byte[] damaged = Base64.decode(original, Base64.NO_WRAP);
                damaged[0] ^= 1;
                prefs.edit().putString("data", Base64.encodeToString(damaged, Base64.NO_WRAP)).commit();
                boolean rejected = false;
                try { store.read(); } catch (Exception expected) { rejected = true; }
                check(rejected && store.metadata().optBoolean("unavailable"), "tampered ciphertext accepted");
                prefs.edit().putString("data", original).commit();
                store.setAutoLogin(false);
                check(!new CredentialStore(context).autoLogin() && store.hasSaved(), "auto-off discarded account");
                store.setAutoLogin(true);
                check(store.autoLogin(), "auto-on failed");
                store.setNeedsAttention(true);
                check(new CredentialStore(context).needsAttention(), "rejection state did not persist");
                store.save(USER, PASS, true);
                check(!store.needsAttention(), "saving corrected credentials did not resume auto login");
                store.clear();
                check(!store.hasSaved() && !store.autoLogin() && store.read() == null && prefs.getAll().isEmpty(), "clear failed");
                result.putString("stream", "PASS: process restart persistence; masked metadata; tamper rejection; auto on/off; credential and key deletion.\n");
            }
            finish(-1, result);
        } catch (Throwable failure) {
            result.putString("stream", "FAIL: " + failure.getClass().getSimpleName() + ": " + failure.getMessage() + "\n");
            finish(0, result);
        }
    }
}
