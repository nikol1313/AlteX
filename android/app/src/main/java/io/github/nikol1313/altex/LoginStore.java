package io.github.nikol1313.altex;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONException;
import org.json.JSONObject;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * The student's saved portal login ("დამახსოვრება"), encrypted with an AES-GCM key that lives in the
 * Android Keystore and never leaves it; GradeWorker's portal token is sealed the same way. The ciphertext sits in
 * app-private preferences (not backed up:
 * allowBackup is off). Anything unreadable, e.g. after the key was reset, counts as no saved login.
 */
final class LoginStore {
    private static final String KEY_ALIAS = "altex-login";
    private static final String PREFS = "altex";
    private static final String PREF_LOGIN = "login";
    private static final String PREF_TOKEN = "bg-token";
    private static final String PREF_BG_REFUSED = "bg-login-refused";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SharedPreferences prefs;

    LoginStore(Context context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** {"u": …, "p": …}, or null when nothing (readable) is saved. */
    JSONObject load() {
        String plain = open(PREF_LOGIN);
        try {
            return plain == null ? null : new JSONObject(plain);
        } catch (JSONException e) {
            clear();
            return null;
        }
    }

    void save(String username, String password) {
        try {
            JSONObject before = load();
            // New details: GradeWorker may try signing in again (see refuseBackground).
            if (before == null || !username.equals(before.optString("u")) || !password.equals(before.optString("p"))) {
                prefs.edit().remove(PREF_BG_REFUSED).apply();
            }
            seal(PREF_LOGIN, new JSONObject().put("u", username).put("p", password).toString());
        } catch (JSONException e) {
            clear();
        }
    }

    /** Log out: the login and everything GradeWorker kept for it. */
    void clear() {
        prefs.edit().remove(PREF_LOGIN).remove(PREF_TOKEN).remove(PREF_BG_REFUSED).apply();
    }

    /** The portal token GradeWorker signed in with last, so it does not sign in every hour. */
    String loadToken() {
        return open(PREF_TOKEN);
    }

    void saveToken(String token) {
        seal(PREF_TOKEN, token);
    }

    /** The saved login did not work in the background; stop trying until it changes. */
    void refuseBackground() {
        prefs.edit().putBoolean(PREF_BG_REFUSED, true).remove(PREF_TOKEN).apply();
    }

    boolean backgroundRefused() {
        return prefs.getBoolean(PREF_BG_REFUSED, false);
    }

    private String open(String pref) {
        String stored = prefs.getString(pref, null);
        if (stored == null) return null;
        try {
            ByteBuffer in = ByteBuffer.wrap(Base64.decode(stored, Base64.NO_WRAP));
            byte[] iv = new byte[IV_BYTES];
            in.get(iv);
            byte[] sealed = new byte[in.remaining()];
            in.get(sealed);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(sealed), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException | java.nio.BufferUnderflowException e) {
            clear();
            return null;
        }
    }

    private void seal(String pref, String plain) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] iv = cipher.getIV();
            byte[] sealed = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            byte[] out = ByteBuffer.allocate(iv.length + sealed.length).put(iv).put(sealed).array();
            prefs.edit().putString(pref, Base64.encodeToString(out, Base64.NO_WRAP)).apply();
        } catch (GeneralSecurityException e) {
            clear();
        }
    }

    private static SecretKey key() throws GeneralSecurityException {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        try {
            ks.load(null);
        } catch (java.io.IOException e) {
            throw new GeneralSecurityException(e);
        }
        java.security.Key existing = ks.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;
        KeyGenerator gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        gen.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return gen.generateKey();
    }
}
