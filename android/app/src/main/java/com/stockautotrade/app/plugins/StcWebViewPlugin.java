package com.stockautotrade.app.plugins;

import android.app.Dialog;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Arrays;
import java.util.List;

@CapacitorPlugin(name = "StcWebView")
public class StcWebViewPlugin extends Plugin {

    private Dialog     webViewDialog       = null;
    private PluginCall savedCall           = null;
    private boolean    successAlreadyFired = false;
    private boolean    hasClickedDaftar    = false;
    private boolean    pageFullyLoaded     = false;
    private boolean    autoClickInjected   = false;
    private String     initialUrl          = "";
    private final Handler mainHandler      = new Handler(Looper.getMainLooper());
    private WebView    currentWebView      = null;

    // Progress bar state
    private final int[] animProg    = {0};
    private final int[] targetProg  = {0};
    private Runnable    animRunnable = null;
    private View        currentOverlay = null;

    // Token polling
    private Runnable tokenPollRunnable = null;
    private static final int TOKEN_POLL_INTERVAL_MS = 1500;
    private static final int TOKEN_POLL_MAX_DURATION_MS = 120000;

    private static final List<String> AUTH_COOKIE_NAMES = Arrays.asList(
            "authorization_token", "authorization-token",
            "auth_token", "authToken", "authtoken",
            "access_token", "accessToken", "token",
            "jwt", "session", "session_id"
    );
    private static final List<String> DEVICE_COOKIE_NAMES = Arrays.asList(
            "device_id", "device-id", "deviceId", "did"
    );

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) { call.reject("URL is required"); return; }
        savedCall           = call;
        successAlreadyFired = false;
        hasClickedDaftar    = false;
        pageFullyLoaded     = false;
        autoClickInjected   = false;
        initialUrl          = url;
        animProg[0]         = 0;
        targetProg[0]       = 0;
        animRunnable        = null;
        currentOverlay      = null;
        tokenPollRunnable   = null;
        call.setKeepAlive(true);

        CookieManager.getInstance().removeSessionCookies(null);
        getActivity().runOnUiThread(() -> showWebViewDialog(url));
    }

    @PluginMethod
    public void close(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            stopTokenPolling();
            if (webViewDialog != null) { webViewDialog.dismiss(); webViewDialog = null; }
            call.resolve();
        });
    }

    /**
     * clearSession — dipanggil saat user logout dari StockAutoTrade.
     *
     * Menghapus semua jejak sesi stockity.id agar WebView register
     * tidak bisa auto-login ketika dibuka kembali.
     *
     * Yang dihapus:
     *   1. Semua cookies (CookieManager shared — berlaku untuk semua WebView)
     *   2. Disk cache WebView + history navigasi + form data
     *   3. localStorage & sessionStorage via JS (jika WebView masih terbuka)
     *   4. WebStorage API — IndexedDB, Application Cache, dll
     */
    @PluginMethod
    public void clearSession(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            // ── 1. Hapus SEMUA cookies (termasuk stockity.id) ──────────────────
            // CookieManager adalah singleton — shared antara Capacitor WebView
            // utama dan StcWebView in-app. Hapus di sini = hapus di keduanya.
            CookieManager cm = CookieManager.getInstance();
            cm.removeAllCookies(null);   // null = tidak perlu callback
            cm.flush();                  // Pastikan ditulis ke disk, bukan hanya memory

            android.util.Log.d("StcWebView", "clearSession: all cookies removed & flushed");

            // ── 2. Hapus cache + history + form data dari WebView aktif ────────
            if (currentWebView != null) {
                // clearCache(true) = hapus disk cache juga (bukan hanya memory)
                currentWebView.clearCache(true);
                currentWebView.clearHistory();
                currentWebView.clearFormData();

                // ── 3. Hapus localStorage + sessionStorage via JavaScript ───────
                // Dijalankan di thread yang sama (UI thread) agar aman
                currentWebView.evaluateJavascript(
                        "(function(){" +
                                "  try { localStorage.clear(); } catch(e) {}" +
                                "  try { sessionStorage.clear(); } catch(e) {}" +
                                "})();",
                        result -> android.util.Log.d("StcWebView", "clearSession: JS storage cleared")
                );
            }

            // ── 4. Hapus WebStorage (IndexedDB, App Cache, dll) ───────────────
            // Ini berlaku untuk semua instance WebView yang pernah ada
            android.webkit.WebStorage.getInstance().deleteAllData();

            android.util.Log.d("StcWebView", "clearSession: cache, history, WebStorage cleared");

            call.resolve();
        });
    }

    private void showWebViewDialog(String url) {
        Dialog dialog = new Dialog(getActivity(), android.R.style.Theme_Black_NoTitleBar_Fullscreen);
        dialog.setCancelable(false);

        FrameLayout root = new FrameLayout(getActivity());
        root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.setBackgroundColor(Color.WHITE);

        WebView webView = new WebView(getActivity());
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        currentWebView = webView;

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUserAgentString(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                        "AppleWebKit/537.36 (KHTML, like Gecko) " +
                        "Chrome/138.0.0.0 Safari/537.36");

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);

        currentOverlay = new View(getActivity()) {
            private float dp(float v) {
                return v * getContext().getResources().getDisplayMetrics().density;
            }
            @Override
            protected void onDraw(Canvas canvas) {
                super.onDraw(canvas);
                int w = getWidth(), h = getHeight();
                int p = animProg[0];

                canvas.drawColor(Color.argb(250, 10, 10, 15));

                float cx = w / 2f, cy = h / 2f - dp(24);
                float r  = Math.min(w, h) * 0.16f;
                float st = r * 0.11f;

                Paint tp = new Paint(Paint.ANTI_ALIAS_FLAG);
                tp.setStyle(Paint.Style.STROKE);
                tp.setStrokeWidth(st);
                tp.setColor(Color.argb(50, 255, 255, 255));
                RectF oval = new RectF(cx - r, cy - r, cx + r, cy + r);
                canvas.drawArc(oval, -90, 360, false, tp);

                int arcColor;
                if (p < 90) {
                    arcColor = Color.argb(255, 59, 130, 246);
                } else {
                    float t = (p - 90) / 10f;
                    arcColor = Color.argb(255,
                            (int)(59  + (34  - 59)  * t),
                            (int)(130 + (197 - 130) * t),
                            (int)(246 + (94  - 246) * t));
                }
                Paint ap = new Paint(Paint.ANTI_ALIAS_FLAG);
                ap.setStyle(Paint.Style.STROKE);
                ap.setStrokeWidth(st);
                ap.setStrokeCap(Paint.Cap.ROUND);
                ap.setColor(arcColor);
                canvas.drawArc(oval, -90, 360f * p / 100f, false, ap);

                Paint pp = new Paint(Paint.ANTI_ALIAS_FLAG);
                pp.setColor(Color.WHITE);
                pp.setTextSize(r * 0.52f);
                pp.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
                pp.setTextAlign(Paint.Align.CENTER);
                canvas.drawText(p + "%", cx, cy - (pp.descent() + pp.ascent()) / 2f, pp);

                Paint lp = new Paint(Paint.ANTI_ALIAS_FLAG);
                lp.setColor(Color.argb(180, 255, 255, 255));
                lp.setTextSize(r * 0.27f);
                lp.setTextAlign(Paint.Align.CENTER);
                String statusText = p < 100 ? "Memuat halaman pendaftaran..." : "Siap!";
                canvas.drawText(statusText, cx, cy + r + st + r * 0.55f, lp);

                if (p < 100) {
                    Paint sub = new Paint(Paint.ANTI_ALIAS_FLAG);
                    sub.setColor(Color.argb(90, 255, 255, 255));
                    sub.setTextSize(r * 0.21f);
                    sub.setTextAlign(Paint.Align.CENTER);
                    canvas.drawText("Harap tunggu sebentar", cx, cy + r + st + r * 1.0f, sub);

                    float btnR  = dp(20);
                    float btnCx = w - dp(24) - btnR;
                    float btnCy = dp(24) + btnR;

                    Paint btnBg = new Paint(Paint.ANTI_ALIAS_FLAG);
                    btnBg.setColor(Color.argb(80, 255, 255, 255));
                    canvas.drawCircle(btnCx, btnCy, btnR, btnBg);

                    Paint xPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
                    xPaint.setColor(Color.WHITE);
                    xPaint.setStrokeWidth(dp(2f));
                    xPaint.setStrokeCap(Paint.Cap.ROUND);
                    float xSize = dp(8);
                    canvas.drawLine(btnCx - xSize, btnCy - xSize, btnCx + xSize, btnCy + xSize, xPaint);
                    canvas.drawLine(btnCx + xSize, btnCy - xSize, btnCx - xSize, btnCy + xSize, xPaint);
                }
            }
        };
        currentOverlay.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        currentOverlay.setOnTouchListener((v, event) -> {
            if (event.getAction() == android.view.MotionEvent.ACTION_UP) {
                float density = getActivity().getResources().getDisplayMetrics().density;
                float btnR  = 20 * density;
                float btnCx = v.getWidth()  - (24 * density) - btnR;
                float btnCy = (24 * density) + btnR;
                float dx = event.getX() - btnCx;
                float dy = event.getY() - btnCy;
                if (Math.sqrt(dx * dx + dy * dy) <= btnR + (8 * density)) {
                    dialog.dismiss();
                    return true;
                }
            }
            return true;
        });

        animRunnable = new Runnable() {
            @Override public void run() {
                if (animProg[0] < targetProg[0]) {
                    animProg[0] = Math.min(animProg[0] + 1, targetProg[0]);
                    currentOverlay.invalidate();
                }
                if (animProg[0] < 100) mainHandler.postDelayed(this, 16);
            }
        };

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                if (req != null && req.getUrl() != null) {
                    String newUrl = req.getUrl().toString();
                    pageFullyLoaded   = false;
                    autoClickInjected = false;
                    android.util.Log.d("StcWebView", "URL change: " + newUrl);
                    checkForTokenImmediate(newUrl, dialog);
                }
                return false;
            }

            @Override
            public void onPageStarted(WebView view, String pageUrl, Bitmap favicon) {
                super.onPageStarted(view, pageUrl, favicon);
                pageFullyLoaded   = false;
                autoClickInjected = false;
                // ✅ FIX: Reset progress target saat halaman baru mulai load,
                // supaya animasi progress bar bisa berjalan lagi untuk halaman baru.
                // Jangan reset kalau overlay sudah disembunyikan (hasClickedDaftar=true)
                // karena user sedang mengisi form — cukup biarkan WebView tampil normal.
                if (!hasClickedDaftar && animProg[0] < 100) {
                    animProg[0]   = 0;
                    targetProg[0] = 0;
                    if (currentOverlay != null) {
                        currentOverlay.setVisibility(View.VISIBLE);
                        currentOverlay.invalidate();
                    }
                }
                if (pageUrl != null) {
                    android.util.Log.d("StcWebView", "Page started: " + pageUrl);
                }
            }

            @Override
            public void onPageFinished(WebView view, String pageUrl) {
                super.onPageFinished(view, pageUrl);
                android.util.Log.d("StcWebView", "Page finished: " + pageUrl);
                if (pageUrl != null && !successAlreadyFired) {
                    checkForTokenImmediate(pageUrl, dialog);
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                int mapped = newProgress < 100
                        ? (int)(newProgress * 0.90f)
                        : 90;
                if (mapped > targetProg[0]) {
                    targetProg[0] = mapped;
                    mainHandler.removeCallbacks(animRunnable);
                    mainHandler.post(animRunnable);
                }

                if (newProgress >= 100) {
                    if (!pageFullyLoaded) {
                        pageFullyLoaded = true;
                        android.util.Log.d("StcWebView", "Page fully loaded: " + view.getUrl());

                        if (!autoClickInjected && !hasClickedDaftar && !successAlreadyFired) {
                            autoClickInjected = true;
                            injectAutoClickScript(webView);
                        }

                        startTokenPolling(view.getUrl(), dialog);
                    }
                }
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage msg) {
                if (msg == null) return true;
                String m = msg.message();
                if (m == null) return true;

                if (m.equals("DAFTAR_BUTTON_CLICKED")) {
                    hasClickedDaftar = true;

                    // ✅ FIX: Animasikan ke 100% lalu sembunyikan overlay
                    // supaya form registrasi yang terbuka bisa diisi user.
                    // Token polling tetap berjalan di background.
                    targetProg[0] = 100;
                    mainHandler.removeCallbacks(animRunnable);
                    mainHandler.post(animRunnable);

                    JSObject data = new JSObject();
                    data.put("daftarClicked", true);
                    notifyListeners("daftarButtonClicked", data);
                    android.util.Log.d("StcWebView", "Daftar clicked! Hiding overlay so form is visible.");

                    // Sembunyikan overlay setelah animasi selesai (~700ms)
                    // agar user bisa mengisi form registrasi
                    mainHandler.postDelayed(() -> {
                        if (currentOverlay != null && !successAlreadyFired) {
                            currentOverlay.setVisibility(View.GONE);
                            android.util.Log.d("StcWebView", "Overlay hidden — form registration visible");
                        }
                    }, 700);

                    // TIDAK perlu checkForTokenImmediate di sini:
                    // form baru dibuka, user belum mengisi apapun.
                    // Token polling di background sudah menangani deteksi token
                    // setelah user selesai submit form.
                }
                if (m.startsWith("REGDATA_") || m.contains("DAFTAR") || m.contains("Current URL"))
                    android.util.Log.d("StcWebView", "Console: " + m);
                return true;
            }
        });

        root.addView(webView);
        root.addView(currentOverlay);
        dialog.setContentView(root);

        dialog.setOnKeyListener((di, keyCode, event) -> {
            if (keyCode == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP) {
                if (currentOverlay != null && currentOverlay.getVisibility() == View.VISIBLE) {
                    dialog.dismiss();
                } else if (currentWebView != null && currentWebView.canGoBack()) {
                    currentWebView.goBack();
                } else {
                    dialog.dismiss();
                }
                return true;
            }
            return false;
        });

        if (dialog.getWindow() != null) {
            dialog.getWindow().setLayout(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            dialog.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            dialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP)
                dialog.getWindow().setStatusBarColor(Color.TRANSPARENT);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
                dialog.getWindow().setDecorFitsSystemWindows(false);
        }

        dialog.setOnDismissListener(d -> {
            stopTokenPolling();
            webViewDialog  = null;
            currentWebView = null;
            if (!successAlreadyFired) {
                mainHandler.removeCallbacksAndMessages(null);
                JSObject data = new JSObject();
                data.put("finished",  true);
                data.put("cancelled", true);
                notifyListeners("browserFinished", data);
            }
        });

        dialog.show();
        webViewDialog = dialog;
        webView.loadUrl(url);
    }

    private void startTokenPolling(String url, Dialog dialog) {
        if (tokenPollRunnable != null) return;

        final long startTime = System.currentTimeMillis();

        tokenPollRunnable = new Runnable() {
            @Override
            public void run() {
                if (successAlreadyFired) {
                    android.util.Log.d("StcWebView", "Polling stopped: success already fired");
                    return;
                }

                if (System.currentTimeMillis() - startTime > TOKEN_POLL_MAX_DURATION_MS) {
                    android.util.Log.d("StcWebView", "Token polling timeout reached");
                    stopTokenPolling();
                    return;
                }

                if (webViewDialog == null || !webViewDialog.isShowing()) {
                    android.util.Log.d("StcWebView", "Polling stopped: dialog dismissed");
                    stopTokenPolling();
                    return;
                }

                String currentUrl = currentWebView != null ? currentWebView.getUrl() : url;
                if (currentUrl != null && !currentUrl.equals("about:blank")) {
                    checkForTokenImmediate(currentUrl, dialog);
                }

                if (!successAlreadyFired && tokenPollRunnable != null) {
                    mainHandler.postDelayed(tokenPollRunnable, TOKEN_POLL_INTERVAL_MS);
                }
            }
        };

        mainHandler.postDelayed(tokenPollRunnable, TOKEN_POLL_INTERVAL_MS);
    }

    private void stopTokenPolling() {
        if (tokenPollRunnable != null) {
            mainHandler.removeCallbacks(tokenPollRunnable);
            tokenPollRunnable = null;
        }
    }

    private void checkForTokenImmediate(String url, Dialog dialog) {
        if (successAlreadyFired) return;
        if (url == null || url.isEmpty() || url.equals("about:blank")) return;

        CookieManager cm  = CookieManager.getInstance();
        String cookies    = collectAllCookies(cm, url);
        String token      = extractCookieValue(cookies, AUTH_COOKIE_NAMES);
        String deviceId   = extractCookieValue(cookies, DEVICE_COOKIE_NAMES);

        android.util.Log.d("StcWebView", "Token check - URL: " + url.substring(0, Math.min(url.length(), 60)) + " | cookiesLen: " + cookies.length() + " | tokenFound: " + (token != null && !token.isEmpty()));

        if (token != null && !token.isEmpty()) {
            android.util.Log.d("StcWebView", "TOKEN DITEMUKAN - fireSuccess!");
            fireSuccess(url, dialog, "token_found");
        }
    }

    private void fireSuccess(String url, Dialog dialog, String reason) {
        if (successAlreadyFired) return;
        successAlreadyFired = true;

        stopTokenPolling();

        android.util.Log.d("StcWebView", "fireSuccess: reason=" + reason + " url=" + url);

        mainHandler.removeCallbacksAndMessages(null);

        CookieManager cm  = CookieManager.getInstance();
        String cookies    = collectAllCookies(cm, url);
        String authToken  = extractCookieValue(cookies, AUTH_COOKIE_NAMES);
        String deviceId   = extractCookieValue(cookies, DEVICE_COOKIE_NAMES);
        if (authToken == null) authToken = "";
        if (deviceId  == null) deviceId  = "";

        final String fToken   = authToken;
        final String fDevice  = deviceId;
        final String fCookies = cookies;
        final String fUrl     = url;

        targetProg[0] = 100;
        mainHandler.post(() -> {
            mainHandler.removeCallbacks(animRunnable);
            mainHandler.post(animRunnable);
        });

        mainHandler.postDelayed(() -> {
            if (currentOverlay != null) {
                currentOverlay.setVisibility(View.GONE);
            }
            if (dialog != null && dialog.isShowing()) {
                dialog.dismiss();
            }

            mainHandler.postDelayed(() -> {
                JSObject res = new JSObject();
                res.put("url",       fUrl);
                res.put("authToken", fToken);
                res.put("deviceId",  fDevice);
                res.put("cookies",   fCookies);
                res.put("success",   true);
                if (savedCall != null) savedCall.resolve(res);
            }, 150);
        }, 700);
    }

    private String collectAllCookies(CookieManager cm, String currentUrl) {
        StringBuilder cookies = new StringBuilder();

        // Cek domain spesifik Stockity
        String[] stockityDomains = {
                "https://stockity.id",
                "https://www.stockity.id",
                "https://api.stockity.id",
                "https://trade.stockity.id",
                "https://app.stockity.id",
                "https://auth.stockity.id",
        };
        for (String domain : stockityDomains) {
            String c = cm.getCookie(domain);
            if (c != null && !c.isEmpty()) {
                cookies.append(c).append("; ");
                android.util.Log.d("StcWebView", "Cookie from " + domain + ": " + c.substring(0, Math.min(c.length(), 100)));
            }
        }

        // Cek domain dari URL saat ini
        try {
            java.net.URL parsedUrl = new java.net.URL(currentUrl);
            String currentDomain   = parsedUrl.getProtocol() + "://" + parsedUrl.getHost();
            String c = cm.getCookie(currentDomain);
            if (c != null && !c.isEmpty()) {
                cookies.append(c).append("; ");
                android.util.Log.d("StcWebView", "Cookie from current " + currentDomain + ": " + c.substring(0, Math.min(c.length(), 100)));
            }

            // Cek juga subdomain .stockity.id
            if (parsedUrl.getHost().contains("stockity.id")) {
                String rootDomain = parsedUrl.getProtocol() + "://.stockity.id";
                String rootCookie = cm.getCookie(rootDomain);
                if (rootCookie != null && !rootCookie.isEmpty()) {
                    cookies.append(rootCookie).append("; ");
                }
            }
        } catch (Exception e) {
            android.util.Log.w("StcWebView", "Error parsing URL: " + e.getMessage());
        }

        return cookies.toString();
    }

    private void injectAutoClickScript(WebView webView) {
        String script =
                "(function(){" +
                        "var b=document.querySelectorAll('button,a,input[type=\"button\"],input[type=\"submit\"]');" +
                        "for(var i=0;i<b.length;i++){" +
                        "  var el=b[i];" +
                        "  var t=(el.innerText||el.textContent||el.value||'').trim().toLowerCase();" +
                        "  if(t.indexOf('daftar')>=0){" +
                        "    try{el.scrollIntoView({behavior:'instant',block:'center'});el.focus();el.click();" +
                        "    console.log('DAFTAR_BUTTON_CLICKED');return true;}" +
                        "    catch(e){console.log('err:'+e.message);}" +
                        "  }" +
                        "}" +
                        "return false;})();";

        webView.evaluateJavascript(script, r ->
                android.util.Log.d("StcWebView", "Auto-click: " + r));

        for (int i = 1; i <= 10; i++) {
            final int n = i;
            mainHandler.postDelayed(() -> {
                if (!hasClickedDaftar && !successAlreadyFired)
                    webView.evaluateJavascript(script, r ->
                            android.util.Log.d("StcWebView", "Retry #" + n + ": " + r));
            }, (long) i * 800);
        }
    }

    private String extractCookieValue(String cookies, List<String> names) {
        if (cookies == null || cookies.isEmpty()) return null;
        for (String name : names) {
            for (String pair : cookies.split(";")) {
                String t = pair.trim();
                if (t.toLowerCase().startsWith(name.toLowerCase() + "=")) {
                    String v = t.substring(name.length() + 1).trim();
                    if (!v.isEmpty()) return v;
                }
            }
        }
        return null;
    }

    @Override
    protected void handleOnDestroy() {
        stopTokenPolling();
        if (webViewDialog != null) { webViewDialog.dismiss(); webViewDialog = null; }
        currentWebView = null;
        mainHandler.removeCallbacksAndMessages(null);
        super.handleOnDestroy();
    }
}