package io.github.nikol1313.altex;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.content.pm.PackageManager;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;
import android.graphics.Bitmap;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.SystemBarStyle;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.regex.Pattern;

/**
 * The student portal in a WebView, with the AlteX extension's scripts and styles injected into it.
 *
 * The extension's code runs on the portal's own origin, exactly like the desktop content scripts,
 * so it reads the portal's login token and calls the portal API directly. Nothing leaves the phone
 * except the portal's own traffic.
 */
public class MainActivity extends ComponentActivity {
    private static final long RESUME_RELOAD_MS = 60_000;
    private long pausedAt;
    private static final String PORTAL_HOST = "students.alte.edu.ge";
    private static final String PORTAL_ORIGIN = "https://" + PORTAL_HOST;
    /** Where the bundled CSS loads its fonts from; served from assets/fonts/ (see build.gradle.kts). */
    private static final String FONT_PATH = "/__altex/fonts/";
    private static final Pattern FONT_NAME = Pattern.compile("[a-z0-9-]+\\.woff2");

    /** Oldest WebView that renders AlteX fully (CSS color-mix() needs Chrome 111). */
    private static final int MIN_WEBVIEW = 111;

    private WebView web;
    private FrameLayout root;
    private View offline;
    private boolean mainFrameFailed;
    private ConnectivityManager.NetworkCallback onNetwork;
    private String bundle;
    private boolean injectAtDocumentStart;
    private ValueCallback<Uri[]> pendingUpload;

    private final ActivityResultLauncher<Intent> filePicker = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(), result -> {
                if (pendingUpload == null) return;
                pendingUpload.onReceiveValue(
                        WebChromeClient.FileChooserParams.parseResult(result.getResultCode(), result.getData()));
                pendingUpload = null;
            });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this,
                SystemBarStyle.dark(Color.TRANSPARENT),
                SystemBarStyle.dark(Color.TRANSPARENT));

        int bg = getColor(R.color.bg);
        root = new FrameLayout(this);
        root.setBackgroundColor(bg);
        web = new WebView(this);
        web.setBackgroundColor(bg);
        root.addView(web);
        setContentView(root);
        // Keep the page clear of the status bar, navigation bar, notch and keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets i = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout()
                    | WindowInsetsCompat.Type.ime());
            v.setPadding(i.left, i.top, i.right, i.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        bundle = readAsset("altex.js");
        // Document start matches the extension's "run_at": "document_start". Older WebViews without it
        // get the bundle once the page has loaded; the extension's code handles both.
        injectAtDocumentStart = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);
        if (injectAtDocumentStart) {
            WebViewCompat.addDocumentStartJavaScript(web, bundle, Collections.singleton(PORTAL_ORIGIN));
        }
        // window.AltexApp for js/login.js ("remember me"), injected into the portal's own pages only.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            LoginStore logins = new LoginStore(this);
            WebViewCompat.addWebMessageListener(web, "AltexApp", Collections.singleton(PORTAL_ORIGIN),
                    (view, message, sourceOrigin, isMainFrame, reply) -> {
                        if (!isMainFrame || !PORTAL_ORIGIN.equals(sourceOrigin.toString())) return;
                        Uri page = view.getUrl() == null ? null : Uri.parse(view.getUrl());
                        boolean onLogin = page != null && isPortal(page) && page.getPath() != null && page.getPath().startsWith("/login");
                        onAppMessage(logins, message.getData(), reply, onLogin);
                    });
        }

        web.setWebViewClient(new PortalClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (pendingUpload != null) pendingUpload.onReceiveValue(null);
                pendingUpload = callback;
                try {
                    filePicker.launch(params.createIntent());
                    return true;
                } catch (ActivityNotFoundException e) {
                    pendingUpload = null;
                    return false;
                }
            }
        });
        // Files the portal serves by URL open in the browser, which has a download manager. blob: files
        // are caught in the page (js/app.js) and arrive as a "file" message; reaching here means that failed.
        web.setDownloadListener((url, userAgent, disposition, mimeType, length) -> {
            if (url.startsWith("blob:")) Toast.makeText(this, R.string.download_failed, Toast.LENGTH_SHORT).show();
            else openOutside(Uri.parse(url));
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (web.canGoBack()) {
                    web.goBack();
                } else {
                    // Let the system handle it (close / background), then keep handling back in the page.
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                    setEnabled(true);
                }
            }
        });

        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) {
            web.loadUrl(PORTAL_ORIGIN + "/");
        }
        UpdateCheck.run(this, installedVersion(), version -> showBanner("update",
                getString(R.string.update_available, version), () -> openOutside(Uri.parse(UpdateCheck.DOWNLOAD_URL))));
        checkWebView();
        // Back online while the offline screen shows: load again by itself.
        ConnectivityManager cm = getSystemService(ConnectivityManager.class);
        if (cm != null) {
            onNetwork = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    runOnUiThread(() -> { if (offline != null && offline.getVisibility() == View.VISIBLE) web.reload(); });
                }
            };
            try {
                cm.registerDefaultNetworkCallback(onNetwork);
            } catch (RuntimeException e) {
                onNetwork = null;
            }
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        pausedAt = System.currentTimeMillis();
        CookieManager.getInstance().flush();
    }

    /** Back after a while (the app stays open in the background for days): reload so the portal shows fresh data. */
    @Override
    protected void onResume() {
        super.onResume();
        boolean away = pausedAt != 0 && System.currentTimeMillis() - pausedAt > RESUME_RELOAD_MS;
        pausedAt = 0;
        if (!away || pendingUpload != null || (offline != null && offline.getVisibility() == View.VISIBLE)) return;
        // Something typed or a file picked and not sent yet: keep the page as it is rather than lose it.
        web.evaluateJavascript(UNSENT_INPUT_JS, result -> { if (!"true".equals(result)) web.reload(); });
    }

    /** True when the page holds text typed into a field, or a picked file, that a reload would throw away. */
    private static final String UNSENT_INPUT_JS = "(() => [...document.querySelectorAll("
            + "'textarea, input:not([type]), input[type=text], input[type=email], input[type=tel], input[type=number],"
            + " input[type=url], input[type=password], input[type=date], input[type=file], [contenteditable=\"true\"]')]"
            + ".some((f) => f.type === 'file' ? f.files && f.files.length > 0"
            + " : f.isContentEditable ? f.textContent.trim() !== '' : f.value !== f.defaultValue && f.value.trim() !== ''))()";

    @Override
    protected void onDestroy() {
        ConnectivityManager cm = getSystemService(ConnectivityManager.class);
        if (cm != null && onNetwork != null) cm.unregisterNetworkCallback(onNetwork);
        web.destroy();
        super.onDestroy();
    }

    /** Messages from the page: get (saved login, login page only), save, forget (js/login.js); file (js/app.js). */
    private void onAppMessage(LoginStore logins, String data, androidx.webkit.JavaScriptReplyProxy reply, boolean onLogin) {
        try {
            JSONObject msg = new JSONObject(data == null ? "" : data);
            switch (msg.optString("type")) {
                case "get": {
                    JSONObject saved = onLogin ? logins.load() : null;
                    reply.postMessage(new JSONObject().put("type", "login").put("login", saved == null ? JSONObject.NULL : saved).toString());
                    break;
                }
                case "save": {
                    JSONObject login = msg.optJSONObject("login");
                    String u = login == null ? "" : login.optString("u");
                    String p = login == null ? "" : login.optString("p");
                    if (!u.isEmpty() && !p.isEmpty()) logins.save(u, p);
                    break;
                }
                case "forget":
                    logins.clear();
                    break;
                case "file":
                    Downloads.save(this, msg.optString("name"), msg.optString("mime"), msg.optString("data"));
                    break;
                default:
                    break;
            }
        } catch (JSONException e) {
            // not one of ours
        }
    }

    private static boolean isPortal(Uri uri) {
        return "https".equals(uri.getScheme()) && PORTAL_HOST.equals(uri.getHost());
    }

    private class PortalClient extends WebViewClient {
        /** Portal pages stay in the app; every other link (LMS, lecturers' links, mail) opens outside. */
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isPortal(uri)) return false;
            openOutside(uri);
            return true;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String path = uri.getPath();
            if (!isPortal(uri) || path == null || !path.startsWith(FONT_PATH)) return null;
            String name = path.substring(FONT_PATH.length());
            if (!FONT_NAME.matcher(name).matches()) return null;
            try {
                return new WebResourceResponse("font/woff2", null, getAssets().open("fonts/" + name));
            } catch (IOException e) {
                return null;
            }
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            mainFrameFailed = false;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                mainFrameFailed = true;
                showOffline(true);
            }
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (!mainFrameFailed) showOffline(false);
            if (!injectAtDocumentStart && url != null && isPortal(Uri.parse(url))) {
                view.evaluateJavascript(bundle, null);
            }
        }
    }

    /** Full-screen "no connection" page with a retry button, over the WebView's own error page. */
    private void showOffline(boolean show) {
        if (!show) {
            if (offline != null) offline.setVisibility(View.GONE);
            return;
        }
        if (offline == null) {
            LinearLayout box = new LinearLayout(this);
            box.setOrientation(LinearLayout.VERTICAL);
            box.setGravity(Gravity.CENTER);
            box.setPadding(dp(32), dp(32), dp(32), dp(32));
            box.setBackgroundColor(getColor(R.color.bg));
            box.setClickable(true);

            TextView brand = new TextView(this);
            brand.setText(android.text.Html.fromHtml("Alte<font color='#9D6EE4'>X</font>", android.text.Html.FROM_HTML_MODE_LEGACY));
            brand.setTextColor(0xFFF2EDEF);
            brand.setTextSize(TypedValue.COMPLEX_UNIT_SP, 34);
            brand.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
            box.addView(brand);

            TextView title = new TextView(this);
            title.setText(R.string.offline_title);
            title.setTextColor(0xFFF2EDEF);
            title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
            title.setGravity(Gravity.CENTER);
            title.setPadding(0, dp(28), 0, dp(8));
            box.addView(title);

            TextView sub = new TextView(this);
            sub.setText(R.string.offline_sub);
            sub.setTextColor(0xFFA6A6AA);
            sub.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
            sub.setGravity(Gravity.CENTER);
            box.addView(sub);

            TextView retry = new TextView(this);
            retry.setText(R.string.offline_retry);
            retry.setTextColor(0xFFFFFFFF);
            retry.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
            retry.setGravity(Gravity.CENTER);
            retry.setPadding(dp(28), 0, dp(28), 0);
            GradientDrawable pill = new GradientDrawable();
            pill.setColor(getColor(R.color.update));
            pill.setCornerRadius(dp(26));
            retry.setBackground(pill);
            retry.setOnClickListener(v -> web.reload());
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(52));
            lp.topMargin = dp(28);
            box.addView(retry, lp);

            offline = box;
            root.addView(offline, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        offline.setVisibility(View.VISIBLE);
    }

    /** WebViews before 111 drop AlteX's color-mix() styles (plain boxes): point to the WebView update. */
    private void checkWebView() {
        PackageInfo pkg = WebViewCompat.getCurrentWebViewPackage(this);
        if (pkg == null || pkg.versionName == null) return;
        int major;
        try {
            major = Integer.parseInt(pkg.versionName.split("\\.")[0]);
        } catch (NumberFormatException e) {
            return;
        }
        if (major >= MIN_WEBVIEW) return;
        String id = pkg.packageName;
        showBanner("webview", getString(R.string.webview_old), () -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + id)));
            } catch (ActivityNotFoundException e) {
                openOutside(Uri.parse("https://play.google.com/store/apps/details?id=" + id));
            }
        });
    }

    private String installedVersion() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return null;
        }
    }

    /** Purple bar at the bottom (new version, old WebView): tap for the action, ✕ to hide it until the next launch. */
    private void showBanner(String tag, String message, Runnable action) {
        if (root.findViewWithTag(tag) != null) return;
        int pad = dp(14);
        LinearLayout bar = new LinearLayout(this);
        bar.setTag(tag);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(18), pad, dp(6), pad);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(getColor(R.color.update));
        bg.setCornerRadius(dp(16));
        bar.setBackground(bg);
        bar.setElevation(dp(6));

        TextView text = new TextView(this);
        text.setText(message);
        text.setTextColor(0xFFFFFFFF);
        text.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        bar.addView(text, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));

        TextView close = new TextView(this);
        close.setText("✕");
        close.setTextColor(0xFFFFFFFF);
        close.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        close.setGravity(Gravity.CENTER);
        close.setContentDescription(getString(R.string.update_dismiss));
        close.setOnClickListener(v -> root.removeView(bar));
        bar.addView(close, new LinearLayout.LayoutParams(dp(44), dp(44)));

        bar.setOnClickListener(v -> action.run());
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        lp.setMargins(dp(12), 0, dp(12), dp(12));
        root.addView(bar, lp);
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private void openOutside(Uri uri) {
        String scheme = uri.getScheme();
        if (!"https".equals(scheme) && !"http".equals(scheme)
                && !"mailto".equals(scheme) && !"tel".equals(scheme)) {
            return;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show();
        }
    }

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        } catch (IOException e) {
            throw new IllegalStateException("Missing asset " + name, e);
        }
    }
}
