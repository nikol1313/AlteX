package io.github.nikol1313.altex;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.text.Html;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.CookieHandler;
import java.net.CookieManager;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * About once an hour, reads the student card the way js/core.js cardBooks does and posts a notification for every
 * subject whose total changed since the last look. It uses the portal token it got last time and signs in with the
 * saved login (LoginStore) only when the portal rejects that token. The first run only takes a snapshot.
 */
public final class GradeWorker extends Worker {
    private static final String ORIGIN = "https://students.alte.edu.ge";
    private static final String WORK = "grades";
    private static final String CHANNEL = "grades";
    private static final String PREFS = "altex";
    private static final String PREF_SNAPSHOT = "grade-snapshot";
    // Same rule as RETAKE in js/core.js: retake rows stand in for a part rather than add to it.
    private static final Pattern RETAKE = Pattern.compile("აღდგენ|განმეორებით|გადაბარებ");
    private static final Pattern LEADING_NUMBER = Pattern.compile("^\\s*([+-]?(?:\\d+\\.?\\d*|\\.\\d+))");

    /** The portal answered 401/403: the token is no longer good. */
    private static final class Rejected extends Exception {}

    public GradeWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    /** Safe to call on every app start: an already scheduled check keeps its timing. */
    static void schedule(Context context) {
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(GradeWorker.class, 1, TimeUnit.HOURS)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, req);
    }

    /** Log out: the next student starts from a fresh snapshot instead of seeing the last one's grades as changes. */
    static void forget(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(PREF_SNAPSHOT).apply();
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        LoginStore logins = new LoginStore(ctx);
        JSONObject login = logins.load();
        if (login == null || logins.backgroundRefused()) return Result.success();
        if (CookieHandler.getDefault() == null) CookieHandler.setDefault(new CookieManager());
        try {
            Map<String, Double> scores = new LinkedHashMap<>();
            Map<String, String> names = new LinkedHashMap<>();
            String token = logins.loadToken();
            boolean read = false;
            if (token != null) {
                try {
                    readCard(token, scores, names);
                    read = true;
                } catch (Rejected e) {
                    scores.clear();
                    names.clear();
                }
            }
            if (!read) {
                token = signIn(login.optString("u"), login.optString("p"));
                if (token == null) {
                    // Wrong password, an SMS code, anything else: trying again every hour could lock the account or
                    // text the student a code each time, so wait until a login in the app saves new details.
                    logins.refuseBackground();
                    return Result.success();
                }
                logins.saveToken(token);
                readCard(token, scores, names);
            }
            notifyChanges(ctx, scores, names);
        } catch (IOException | JSONException | Rejected | RuntimeException e) {
            // Offline, portal down or changed: the next hourly run tries again.
        }
        return Result.success();
    }

    /** The portal's own two-step sign-in (checkUsername, then login), as its login page does it. */
    private static String signIn(String user, String pass) throws IOException, JSONException {
        JSONObject form = new JSONObject().put("username", user).put("password", pass).put("smsCode", "")
                .put("token", "").put("authType", false).put("generateCode", "");
        try {
            if (!"yes".equals(call(null, "/student/checkUsername", form).optString("result"))) return null;
            JSONObject res = call(null, "/student/login", form);
            String token = res.optString("token");
            return "yes".equals(res.optString("result")) && !token.isEmpty() ? token : null;
        } catch (Rejected e) {
            return null;
        }
    }

    /** cardBooks in js/core.js: the newest semester's subjects get their graded parts added up. */
    private static void readCard(String token, Map<String, Double> scores, Map<String, String> names)
            throws IOException, JSONException, Rejected {
        JSONObject card = call(token, "/student/card", null).optJSONObject("card");
        JSONArray books = card == null ? null : card.optJSONArray("books");
        if (books == null) throw new JSONException("no card");
        int newest = 0;
        for (int i = 0; i < books.length(); i++) {
            JSONObject b = books.optJSONObject(i);
            if (b != null) newest = Math.max(newest, (int) orZero(num(b.optString("semester"))));
        }
        for (int i = 0; i < books.length(); i++) {
            JSONObject b = books.optJSONObject(i);
            if (b == null || b.isNull("id")) continue;
            String id = b.optString("id");
            double score = orZero(num(b.isNull("score") ? "" : b.optString("score").replace(',', '.')));
            if (newest != 0 && (int) orZero(num(b.optString("semester"))) == newest) {
                try {
                    JSONArray rows = call(token, "/student/getCardDetails", new JSONObject().put("resultId", b.get("id"))).optJSONArray("data");
                    score = Math.max(score, Math.round(partsTotal(rows) * 100) / 100.0);
                } catch (IOException | JSONException e) {
                    // the card's number stands until the next run
                }
            }
            scores.put(id, score);
            names.put(id, b.optString("name"));
        }
    }

    private static double partsTotal(JSONArray rows) {
        double sum = 0;
        for (int i = 0; rows != null && i < rows.length(); i++) {
            JSONObject r = rows.optJSONObject(i);
            Object type = r == null ? null : r.opt("componentType");
            if (!(type instanceof Number) || ((Number) type).doubleValue() != 1 || RETAKE.matcher(r.optString("name")).find()) continue;
            double v = num(plainText(r.isNull("result") ? "" : r.optString("result")).replace(',', '.'));
            if (!Double.isNaN(v)) sum += v;
        }
        return sum;
    }

    private static String plainText(String html) {
        return Html.fromHtml(html, Html.FROM_HTML_MODE_LEGACY).toString().replaceAll("\\s+", " ").trim();
    }

    /** JavaScript's parseFloat: the number at the start of the text, or NaN. */
    static double num(String s) {
        Matcher m = LEADING_NUMBER.matcher(s == null ? "" : s);
        return m.find() ? Double.parseDouble(m.group(1)) : Double.NaN;
    }

    private static double orZero(double v) {
        return Double.isNaN(v) ? 0 : v;
    }

    /**
     * Subjects to tell the student about: a total that moved, or a subject that appeared with points. Nothing
     * before there is a previous snapshot, so the first run (and the first after log out) stays quiet.
     */
    static List<String> changed(Map<String, Double> before, Map<String, Double> now) {
        List<String> out = new ArrayList<>();
        if (before == null) return out;
        for (Map.Entry<String, Double> e : now.entrySet()) {
            Double old = before.get(e.getKey());
            if (old == null ? e.getValue() > 0 : Math.abs(old - e.getValue()) > 0.001) out.add(e.getKey());
        }
        return out;
    }

    private static void notifyChanges(Context ctx, Map<String, Double> scores, Map<String, String> names) throws JSONException {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String saved = prefs.getString(PREF_SNAPSHOT, null);
        Map<String, Double> before = null;
        if (saved != null) {
            JSONObject o = new JSONObject(saved);
            before = new LinkedHashMap<>();
            for (java.util.Iterator<String> it = o.keys(); it.hasNext(); ) {
                String k = it.next();
                before.put(k, o.getDouble(k));
            }
        }
        List<String> ids = changed(before, scores);
        prefs.edit().putString(PREF_SNAPSHOT, new JSONObject(scores).toString()).apply();
        if (ids.isEmpty() || !canNotify(ctx)) return;

        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL,
                    ctx.getString(R.string.grades_channel), NotificationManager.IMPORTANCE_DEFAULT));
        }
        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        PendingIntent tap = open == null ? null : PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE);
        for (String id : ids) {
            Double old = before.get(id);
            String text = old == null ? ctx.getString(R.string.grade_new, fmt(scores.get(id)))
                    : ctx.getString(R.string.grade_changed, fmt(old), fmt(scores.get(id)));
            NotificationCompat.Builder n = new NotificationCompat.Builder(ctx, CHANNEL)
                    .setSmallIcon(R.drawable.ic_notification)
                    .setContentTitle(names.get(id))
                    .setContentText(text)
                    .setContentIntent(tap)
                    .setAutoCancel(true);
            // One per subject: a later change replaces it instead of piling up.
            NotificationManagerCompat.from(ctx).notify(WORK, id.hashCode(), n.build());
        }
    }

    private static boolean canNotify(Context ctx) {
        return (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) && NotificationManagerCompat.from(ctx).areNotificationsEnabled();
    }

    private static String fmt(double v) {
        return v == Math.rint(v) ? String.valueOf((long) v) : String.format(Locale.ROOT, "%.2f", v).replaceAll("0+$", "");
    }

    /** A JSON call to the portal API: POST when there is a body, else GET. */
    private static JSONObject call(String token, String path, JSONObject body) throws IOException, JSONException, Rejected {
        HttpURLConnection c = (HttpURLConnection) new URL(ORIGIN + path).openConnection();
        try {
            c.setConnectTimeout(15000);
            c.setReadTimeout(30000);
            c.setUseCaches(false);
            c.setRequestProperty("Accept", "application/json");
            if (token != null) c.setRequestProperty("Authorization", "Bearer " + token);
            if (body != null) {
                c.setRequestMethod("POST");
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                try (OutputStream out = c.getOutputStream()) {
                    out.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
            }
            int code = c.getResponseCode();
            if (code == 401 || code == 403) throw new Rejected();
            if (code / 100 != 2) throw new IOException(path + " " + code);
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                byte[] chunk = new byte[8192];
                for (int n; (n = in.read(chunk)) != -1; ) buf.write(chunk, 0, n);
                return new JSONObject(buf.toString("UTF-8"));
            }
        } finally {
            c.disconnect();
        }
    }
}
