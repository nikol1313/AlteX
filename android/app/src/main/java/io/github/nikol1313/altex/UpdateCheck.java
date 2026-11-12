package io.github.nikol1313.altex;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Finds out whether a newer release than this app is on GitHub. It reads the redirect of
 * releases/latest (…/releases/tag/android-vX.Y.Z) instead of the REST API, whose 60 requests an hour
 * are shared by everyone behind one campus IP. At most one request every 6 hours; the last answer is
 * kept, so the banner still shows in between.
 */
final class UpdateCheck {
    static final String DOWNLOAD_URL = "https://github.com/nikol1313/AlteX-chrome-extension/releases/latest/download/AlteX.apk";
    private static final String LATEST_URL = "https://github.com/nikol1313/AlteX-chrome-extension/releases/latest";
    private static final Pattern TAG = Pattern.compile("/releases/tag/android-v(\\d+(?:\\.\\d+)*)");
    private static final long EVERY_MS = 6 * 60 * 60 * 1000L;
    private static final String PREFS = "altex";
    private static final String PREF_LATEST = "latest-version";
    private static final String PREF_CHECKED = "latest-checked-at";

    interface OnNewer { void show(String version); }

    /** Calls {@code onNewer} on the main thread when a newer version than {@code current} exists. */
    static void run(Activity activity, String current, OnNewer onNewer) {
        SharedPreferences prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String known = prefs.getString(PREF_LATEST, null);
        if (known != null && isNewer(known, current)) onNewer.show(known);
        if (System.currentTimeMillis() - prefs.getLong(PREF_CHECKED, 0) < EVERY_MS) return;

        new Thread(() -> {
            String latest = fetchLatest();
            if (latest == null) return;
            prefs.edit().putString(PREF_LATEST, latest).putLong(PREF_CHECKED, System.currentTimeMillis()).apply();
            if (isNewer(latest, current) && !latest.equals(known)) {
                activity.runOnUiThread(() -> { if (!activity.isFinishing()) onNewer.show(latest); });
            }
        }, "altex-update-check").start();
    }

    private static String fetchLatest() {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(LATEST_URL).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setRequestMethod("HEAD");
            c.setConnectTimeout(5000);
            c.setReadTimeout(5000);
            c.setRequestProperty("User-Agent", "AlteX-Android");
            String location = c.getResponseCode() / 100 == 3 ? c.getHeaderField("Location") : null;
            if (location == null) return null;
            Matcher m = TAG.matcher(location);
            return m.find() ? m.group(1) : null;
        } catch (IOException | RuntimeException e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** "3.10.0" > "3.9.2"; missing parts count as 0; anything unparsable is never newer. */
    static boolean isNewer(String candidate, String current) {
        try {
            String[] a = candidate.split("\\."), b = (current == null ? "0" : current).split("\\.");
            for (int i = 0; i < Math.max(a.length, b.length); i++) {
                int x = i < a.length ? Integer.parseInt(a[i]) : 0;
                int y = i < b.length ? Integer.parseInt(b[i].replaceAll("\\D.*$", "")) : 0;
                if (x != y) return x > y;
            }
            return false;
        } catch (NumberFormatException e) {
            return false;
        }
    }
}
