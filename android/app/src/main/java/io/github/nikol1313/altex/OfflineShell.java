package io.github.nikol1313.altex;

import android.content.Context;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Offline mode: a copy of the portal's page itself (index.html and the scripts, styles and assets it loads), so the
 * app still opens without a connection. The portal sends all of it with Cache-Control: no-store, so the WebView's own
 * cache keeps nothing. Only the public page is copied: it is fetched again without the WebView's cookies. The
 * student's data comes from js/api-cache.js, which answers the portal's reads from its saved copy while offline.
 */
final class OfflineShell {
    private static final String ORIGIN = "https://students.alte.edu.ge";
    /** A file of the page: same origin, a plain path with an extension (the API, /student/…, has none). */
    private static final Pattern FILE = Pattern.compile("/(?:[A-Za-z0-9._-]+/)*[A-Za-z0-9_-][A-Za-z0-9._-]*\\.(js|css|json|svg|png|jpg|ico|woff2|woff|ttf)");
    /** A file of the portal's build (main-HASH.js, chunk-HASH.js, styles-HASH.css): its name changes with its content,
     *  so a saved copy is never out of date and is used even online. */
    private static final Pattern BUILD = Pattern.compile("/[A-Za-z0-9-]+-[A-Za-z0-9_-]{8}\\.(js|css)");
    /** Files not asked for in this long are deleted (old builds of the portal); asked for again, they come back. */
    private static final long UNUSED_MS = 30L * 24 * 3600 * 1000;

    private final File dir;
    private final ExecutorService saver = Executors.newSingleThreadExecutor();
    /** Paths already saved or re-checked in this run: each is downloaded at most once per run. */
    private final Set<String> checked = ConcurrentHashMap.newKeySet();

    OfflineShell(Context context) {
        dir = new File(context.getFilesDir(), "offline");
        saver.execute(() -> {
            if (!dir.isDirectory() && !dir.mkdirs()) return;
            File[] files = dir.listFiles();
            long now = System.currentTimeMillis();
            if (files != null) for (File f : files) if (now - f.lastModified() > UNUSED_MS) f.delete();
        });
    }

    /** Online: the page asked for this, so keep (or refresh) its copy in the background. A saved build file is kept. */
    void saw(WebResourceRequest request) {
        String path = pathOf(request);
        if (path == null || (BUILD.matcher(path).matches() && fileOf(path).isFile())) return;
        if (checked.add(path)) saver.execute(() -> save(path));
    }

    /** The saved copy of what the page asks for: anything offline, a build file also online. Null otherwise (or
     *  when there is no copy): the WebView then loads it as usual. */
    WebResourceResponse open(WebResourceRequest request, boolean online) {
        String path = pathOf(request);
        if (path == null || (online && !BUILD.matcher(path).matches())) return null;
        File f = fileOf(path);
        if (!f.isFile()) return null;
        String mime = mimeOf(path);
        try {
            return new WebResourceResponse(mime, mime.startsWith("font/") || mime.startsWith("image/") ? null : "UTF-8",
                    new FileInputStream(f));
        } catch (IOException e) {
            return null;
        }
    }

    /** "/" for a page (the portal is one page for every address), the path for a file, null for anything else. */
    static String pathOf(WebResourceRequest request) {
        if (!"GET".equals(request.getMethod())) return null;
        if (request.isForMainFrame()) return "/";
        String path = request.getUrl().getPath();
        return path != null && FILE.matcher(path).matches() ? path : null;
    }

    private File fileOf(String path) {
        return new File(dir, "/".equals(path) ? "index.html" : path.substring(1).replace('/', '!'));
    }

    /** Module scripts are refused without a JavaScript type, so types are set here rather than guessed. */
    static String mimeOf(String path) {
        if ("/".equals(path)) return "text/html";
        Matcher m = FILE.matcher(path);
        switch (m.matches() ? m.group(1) : "") {
            case "js": return "text/javascript";
            case "css": return "text/css";
            case "json": return "application/json";
            case "svg": return "image/svg+xml";
            case "png": return "image/png";
            case "jpg": return "image/jpeg";
            case "ico": return "image/x-icon";
            case "woff2": return "font/woff2";
            case "woff": return "font/woff";
            case "ttf": return "font/ttf";
            default: return "application/octet-stream";
        }
    }

    /** Downloads one file, asking only for a change since the saved copy (304: kept, marked as used). */
    private void save(String path) {
        File f = fileOf(path), part = new File(dir, f.getName() + ".part");
        HttpURLConnection c = null;
        try {
            if (!dir.isDirectory() && !dir.mkdirs()) return;
            c = (HttpURLConnection) new URL(ORIGIN + path).openConnection();
            c.setConnectTimeout(10_000);
            c.setReadTimeout(20_000);
            c.setUseCaches(false);
            c.setRequestProperty("User-Agent", "AlteX-Android");
            // The copy's time is when it was saved, which is after the server's version of it.
            if (f.isFile()) c.setIfModifiedSince(f.lastModified());
            int code = c.getResponseCode();
            if (code == HttpURLConnection.HTTP_NOT_MODIFIED) {
                f.setLastModified(System.currentTimeMillis());
                return;
            }
            if (code != HttpURLConnection.HTTP_OK) return;
            try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(part)) {
                byte[] buf = new byte[16384];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            }
            // Whole or not at all: a half-written copy would break the page offline.
            if (!part.renameTo(f)) part.delete();
        } catch (IOException | RuntimeException e) {
            part.delete();
            checked.remove(path); // try again the next time the page asks for it
        } finally {
            if (c != null) c.disconnect();
        }
    }
}
