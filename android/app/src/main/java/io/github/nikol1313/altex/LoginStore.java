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
 * Android Keystore and never leaves it. The ciphertext sits in app-private preferences (not backed up:
 * allowBackup is off). Anything unreadable, e.g. after the key was reset, counts as no saved login.
 */
final class LoginStore {
    private static final String KEY_ALIAS = "altex-login";
    private static final String PREFS = "altex";
    private static final String PREF_LOGIN = "login";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SharedPreferences prefs;

    LoginStore(Context context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** {"u": …, "p": …}, or null when nothing (readable) is saved. */
    JSONObject load() {
        String stored = prefs.getString(PREF_LOGIN, null);
        if (stored == null) return null;
        try {
            ByteBuffer in = ByteBuffer.wrap(Base64.decode(stored, Base64.NO_WRAP));
            byte[] iv = new byte[IV_BYTES];
            in.get(iv);
            byte[] sealed = new byte[in.remaining()];
            in.get(sealed);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(TAG_BITS, iv));
            return new JSONObject(new String(cipher.doFinal(sealed), StandardCharsets.UTF_8));
        } catch (GeneralSecurityException | JSONException | IllegalArgumentException | java.nio.BufferUnderflowException e) {
            clear();
            return null;
        }
    }

    void save(String username, String password) {
        try {
            JSONObject login = new JSONObject().put("u", username).put("p", password);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] iv = cipher.getIV();
            byte[] sealed = cipher.doFinal(login.toString().getBytes(StandardCharsets.UTF_8));
            byte[] out = ByteBuffer.allocate(iv.length + sealed.length).put(iv).put(sealed).array();
            prefs.edit().putString(PREF_LOGIN, Base64.encodeToString(out, Base64.NO_WRAP)).apply();
        } catch (GeneralSecurityException | JSONException e) {
            clear();
        }
    }

    void clear() {
        prefs.edit().remove(PREF_LOGIN).apply();
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
