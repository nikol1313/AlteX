package io.github.nikol1313.altex;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
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
    private static final String PORTAL_HOST = "students.alte.edu.ge";
    private static final String PORTAL_ORIGIN = "https://" + PORTAL_HOST;
    /** Where the bundled CSS loads its fonts from; served from assets/fonts/ (see build.gradle.kts). */
    private static final String FONT_PATH = "/__altex/fonts/";
    private static final Pattern FONT_NAME = Pattern.compile("[a-z0-9-]+\\.woff2");

    private WebView web;
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
        FrameLayout root = new FrameLayout(this);
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
        // Files the portal serves by URL open in the browser, which has a download manager.
        web.setDownloadListener((url, userAgent, disposition, mimeType, length) -> openOutside(Uri.parse(url)));

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (web.canGoBack()) {
                    web.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });

        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) {
            web.loadUrl(PORTAL_ORIGIN + "/");
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
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
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
        public void onPageFinished(WebView view, String url) {
            if (!injectAtDocumentStart && url != null && isPortal(Uri.parse(url))) {
                view.evaluateJavascript(bundle, null);
            }
        }
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
