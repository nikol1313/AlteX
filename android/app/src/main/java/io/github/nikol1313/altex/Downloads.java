package io.github.nikol1313.altex;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/**
 * Files the portal builds inside the page (blob: links, which a WebView cannot download on its own).
 * js/app.js reads the blob and sends it here. Android 10+: saved to Downloads; older: a private
 * cache copy shared through FileProvider. Either way it then opens in a matching app.
 */
final class Downloads {
    private static final int MAX_BYTES = 30 * 1024 * 1024;

    private Downloads() {}

    static void save(Activity activity, String name, String mime, String base64) {
        String fileName = cleanName(name);
        String type = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
        new Thread(() -> {
            Uri uri = null;
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                if (data.length > MAX_BYTES) throw new IOException("too large");
                uri = Build.VERSION.SDK_INT >= 29 ? toDownloads(activity, fileName, type, data) : toCache(activity, fileName, data);
            } catch (IOException | IllegalArgumentException | SecurityException e) {
                uri = null;
            }
            Uri saved = uri;
            activity.runOnUiThread(() -> {
                if (saved == null) {
                    Toast.makeText(activity, R.string.download_failed, Toast.LENGTH_SHORT).show();
                    return;
                }
                Toast.makeText(activity, activity.getString(R.string.download_saved, fileName), Toast.LENGTH_SHORT).show();
                try {
                    activity.startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(saved, type)
                            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK));
                } catch (ActivityNotFoundException e) {
                    // Saved; nothing installed can open this type.
                }
            });
        }, "altex-download").start();
    }

    private static Uri toDownloads(Activity activity, String name, String type, byte[] data) throws IOException {
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, name);
        values.put(MediaStore.Downloads.MIME_TYPE, type);
        Uri uri = activity.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IOException("no Downloads entry");
        try (OutputStream out = activity.getContentResolver().openOutputStream(uri)) {
            if (out == null) throw new IOException("cannot write");
            out.write(data);
        }
        return uri;
    }

    private static Uri toCache(Activity activity, String name, byte[] data) throws IOException {
        File dir = new File(activity.getCacheDir(), "downloads");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("no cache dir");
        File file = new File(dir, name);
        try (OutputStream out = new FileOutputStream(file)) {
            out.write(data);
        }
        return FileProvider.getUriForFile(activity, activity.getPackageName() + ".files", file);
    }

    /** Keeps letters (any script), digits and . _ - ( ) and spaces; never a path. */
    static String cleanName(String name) {
        String n = name == null ? "" : name.replaceAll("[^\\p{L}\\p{N} ._()\\-]", "_").replaceAll("^[ .]+", "").trim();
        if (n.length() > 120) n = n.substring(n.length() - 120);
        return n.isEmpty() ? "AlteX-file" : n;
    }
}
