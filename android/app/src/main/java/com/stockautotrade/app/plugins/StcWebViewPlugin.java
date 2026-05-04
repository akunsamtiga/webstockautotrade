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
    private String     initialUrl          = "";   // URL pertama yang dibuka
    private final Handler mainHandler      = new Handler(Looper.getMainLooper());
    private WebView   currentWebView       = null;

    // Pola URL yang PASTI sukses (halaman trading platform)
    private static final List<String> SUCCESS_URL_PATTERNS = Arrays.asList(
            "/trading", "/onboarding", "/welcome", "/dashboard",
            "/home", "/account", "/main", "/member", "/profile",
            "/user", "/app", "/portal", "/logged", "/trade",
            "/verified", "/success", "/complete", "/finish",
            "/registered", "/confirm"
    );

    // Pola URL yang harus DIABAIKAN (masih halaman registrasi)
    private static final List<String> REGISTRATION_DOMAINS = Arrays.asList(
            "stockity.id/registered",
            "stockity.id/register",
            "stockity.id/sign-up",
            "stockity.id/signup"
    );

    private static final List<String> AUTH_COOKIE_NAMES = Arrays.asList(
            "authorization_token", "authorization-token",
            "auth_token", "authToken", "authtoken",
            "access_token", "accessToken", "token"
    );
    private static final List<String> DEVICE_COOKIE_NAMES = Arrays.asList(
            "device_id", "device-id", "deviceId"
    );

    // ─── open ─────────────────────────────────────────────────────────────────
    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) { call.reject("URL is required"); return; }
        savedCall           = call;
        successAlreadyFired = false;
        hasClickedDaftar    = false;
        initialUrl          = url;
        call.setKeepAlive(true);
        getActivity().runOnUiThread(() -> showWebViewDialog(url));
    }

    // ─── close ────────────────────────────────────────────────────────────────
    @PluginMethod
    public void close(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (webViewDialog != null) { webViewDialog.dismiss(); webViewDialog = null; }
            // ✅ FIX: resolve() di dalam runOnUiThread — dialog pasti sudah dismiss
            // sebelum JS promise selesai, sehingga modal React langsung terlihat.
            call.resolve();
        });
    }

    // ─── showWebViewDialog ────────────────────────────────────────────────────
    private void showWebViewDialog(String url) {
        Dialog dialog = new Dialog(getActivity(), android.R.style.Theme_Black_NoTitleBar_Fullscreen);
        dialog.setCancelable(false);

        FrameLayout root = new FrameLayout(getActivity());
        root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.setBackgroundColor(Color.WHITE);

        // ── WebView fullscreen ────────────────────────────────────────────────
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

        // ── Loading overlay ───────────────────────────────────────────────────
        final int[] animProg   = {0};
        final int[] targetProg = {0};

        View overlay = new View(getActivity()) {
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
                canvas.drawText(p < 100 ? "Memuat halaman pendaftaran..." : "✓ Siap!",
                        cx, cy + r + st + r * 0.55f, lp);

                if (p < 100) {
                    Paint sub = new Paint(Paint.ANTI_ALIAS_FLAG);
                    sub.setColor(Color.argb(90, 255, 255, 255));
                    sub.setTextSize(r * 0.21f);
                    sub.setTextAlign(Paint.Align.CENTER);
                    canvas.drawText("Harap tunggu sebentar", cx, cy + r + st + r * 1.0f, sub);

                    // Tombol X pojok kanan atas
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
        overlay.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        overlay.setOnTouchListener((v, event) -> {
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

        // Animasi smooth 60fps
        Runnable anim = new Runnable() {
            @Override public void run() {
                if (animProg[0] < targetProg[0]) {
                    animProg[0] = Math.min(animProg[0] + 1, targetProg[0]);
                    overlay.invalidate();
                }
                if (animProg[0] < 100) mainHandler.postDelayed(this, 16);
            }
        };

        // ── WebViewClient ─────────────────────────────────────────────────────
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                if (req != null && req.getUrl() != null) {
                    String newUrl = req.getUrl().toString();
                    android.util.Log.d("StcWebView", "URL change: " + newUrl);
                    checkForSuccess(newUrl, dialog, overlay);
                }
                return false;
            }

            @Override
            public void onPageStarted(WebView view, String pageUrl, Bitmap favicon) {
                super.onPageStarted(view, pageUrl, favicon);
                if (pageUrl != null) {
                    android.util.Log.d("StcWebView", "Page started: " + pageUrl);
                    checkForSuccess(pageUrl, dialog, overlay);
                }
            }

            @Override
            public void onPageFinished(WebView view, String pageUrl) {
                super.onPageFinished(view, pageUrl);
                if (pageUrl != null) {
                    android.util.Log.d("StcWebView", "Page finished: " + pageUrl);
                    checkForSuccess(pageUrl, dialog, overlay);
                    // ✅ TAMBAHAN: cek cookie token setiap halaman selesai load —
                    // jika token sudah ada, langsung tutup tanpa perlu URL berubah.
                    checkForToken(pageUrl, dialog, overlay);
                }
            }
        });

        // ── WebChromeClient ───────────────────────────────────────────────────
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                int mapped = (int)(newProgress * 0.9f);
                if (mapped > targetProg[0]) {
                    targetProg[0] = mapped;
                    mainHandler.removeCallbacks(anim);
                    mainHandler.post(anim);
                }
                if (newProgress >= 100 && !hasClickedDaftar && !successAlreadyFired)
                    injectAutoClickScript(webView);
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage msg) {
                if (msg == null) return true;
                String m = msg.message();
                if (m == null) return true;

                if (m.equals("DAFTAR_BUTTON_CLICKED")) {
                    hasClickedDaftar = true;
                    targetProg[0]    = 100;
                    mainHandler.removeCallbacks(anim);
                    mainHandler.post(anim);
                    mainHandler.postDelayed(() -> overlay.setVisibility(View.GONE), 700);

                    JSObject data = new JSObject();
                    data.put("daftarClicked", true);
                    notifyListeners("daftarButtonClicked", data);
                    android.util.Log.d("StcWebView", "✅ Daftar clicked!");
                }
                if (m.startsWith("REGDATA_") || m.contains("DAFTAR") || m.contains("Current URL"))
                    android.util.Log.d("StcWebView", "Console: " + m);
                return true;
            }
        });

        root.addView(webView);
        root.addView(overlay);
        dialog.setContentView(root);

        // ── Tombol back hardware ──────────────────────────────────────────────
        dialog.setOnKeyListener((di, keyCode, event) -> {
            if (keyCode == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP) {
                if (overlay.getVisibility() == View.VISIBLE) {
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
            webViewDialog  = null;
            currentWebView = null;
            if (!successAlreadyFired) {
                // Hanya cancel pending dan kirim browserFinished jika bukan karena sukses
                mainHandler.removeCallbacksAndMessages(null);
                JSObject data = new JSObject();
                data.put("finished",  true);
                data.put("cancelled", true);
                notifyListeners("browserFinished", data);
            }
            // Jika successAlreadyFired, biarkan postDelayed resolve tetap berjalan
        });

        dialog.show();
        webViewDialog = dialog;
        webView.loadUrl(url);
    }

    // ─── isRegistrationUrl — cek apakah URL masih halaman registrasi ──────────
    private boolean isRegistrationUrl(String url) {
        String low = url.toLowerCase();
        for (String reg : REGISTRATION_DOMAINS) {
            if (low.contains(reg)) return true;
        }
        // Cek apakah sama persis dengan initialUrl (termasuk query param)
        String initialBase = initialUrl.split("\\?")[0].toLowerCase();
        String currentBase = url.split("\\?")[0].toLowerCase();
        return currentBase.equals(initialBase);
    }

    // ─── checkForSuccess — deteksi sukses dari perubahan URL ─────────────────
    private void checkForSuccess(String url, Dialog dialog, View overlay) {
        if (successAlreadyFired) return;
        if (url == null || url.isEmpty() || url.equals("about:blank")) return;

        String low = url.toLowerCase();

        // Abaikan jika masih di halaman registrasi
        if (isRegistrationUrl(url)) return;

        // Cara 1: URL cocok pola sukses
        boolean matchPattern = false;
        for (String p : SUCCESS_URL_PATTERNS) {
            if (low.contains(p)) { matchPattern = true; break; }
        }

        // Cara 2: URL berubah ke domain/path berbeda dari initialUrl
        boolean urlChanged = false;
        if (!initialUrl.isEmpty()) {
            String initialBase = initialUrl.split("\\?")[0].toLowerCase();
            String currentBase = url.split("\\?")[0].toLowerCase();
            urlChanged = !currentBase.equals(initialBase) && !currentBase.contains("about:");
        }

        if (!matchPattern && !urlChanged) return;

        fireSuccess(url, dialog, overlay, "url_change");
    }

    // ─── checkForToken — deteksi sukses dari keberadaan token di cookie ──────
    // Dipanggil di onPageFinished — jika token sudah ada di cookie meski URL
    // belum berubah, webview langsung ditutup dan popup sukses ditampilkan.
    private void checkForToken(String url, Dialog dialog, View overlay) {
        if (successAlreadyFired) return;
        if (url == null || url.equals("about:blank")) return;

        CookieManager cm  = CookieManager.getInstance();
        String cookies    = collectCookies(cm, url);
        String token      = extractCookieValue(cookies, AUTH_COOKIE_NAMES);

        if (token != null && !token.isEmpty()) {
            android.util.Log.d("StcWebView", "✅ Token ditemukan di cookie! Menutup webview...");
            fireSuccess(url, dialog, overlay, "token_found");
        }
    }

    // ─── fireSuccess — tutup dialog DULU, resolve JS sesudahnya ──────────────
    // Ini satu-satunya titik yang boleh resolve savedCall dengan success=true.
    // Urutan: dismiss dialog → tunggu window fokus kembali → resolve JS.
    // Dengan urutan ini, saat React render modal sukses, native Dialog
    // sudah pasti hilang dari layar.
    private void fireSuccess(String url, Dialog dialog, View overlay, String reason) {
        if (successAlreadyFired) return;
        successAlreadyFired = true;

        android.util.Log.d("StcWebView", "🚀 fireSuccess: reason=" + reason + " url=" + url);

        CookieManager cm  = CookieManager.getInstance();
        String cookies    = collectCookies(cm, url);
        String authToken  = extractCookieValue(cookies, AUTH_COOKIE_NAMES);
        String deviceId   = extractCookieValue(cookies, DEVICE_COOKIE_NAMES);
        if (authToken == null) authToken = "";
        if (deviceId  == null) deviceId  = "";

        android.util.Log.d("StcWebView", "authToken: " + authToken);

        final String fToken   = authToken;
        final String fDevice  = deviceId;
        final String fCookies = cookies;
        final String fUrl     = url;

        // ✅ KUNCI: Dismiss dialog SEGERA di UI thread (callbacks WebViewClient
        // sudah berjalan di UI thread, jadi tidak perlu post()).
        // Setelah dialog hilang, Activity window fokus kembali ke Capacitor WebView.
        overlay.setVisibility(View.GONE);
        if (dialog.isShowing()) dialog.dismiss();

        // Resolve JS setelah jeda singkat — memberi waktu Activity window
        // untuk benar-benar aktif kembali sebelum React merender modal.
        mainHandler.postDelayed(() -> {
            JSObject res = new JSObject();
            res.put("url",       fUrl);
            res.put("authToken", fToken);
            res.put("deviceId",  fDevice);
            res.put("cookies",   fCookies);
            res.put("success",   true);
            if (savedCall != null) savedCall.resolve(res);
        }, 150);
    }

    // ─── collectCookies — kumpulkan semua cookie dari domain Stockity ─────────
    private String collectCookies(CookieManager cm, String currentUrl) {
        String cookies = "";
        String[] domains = {
                "https://stockity.id",
                "https://api.stockity.id",
                "https://trade.stockity.id",
                "https://app.stockity.id",
        };
        for (String domain : domains) {
            String c = cm.getCookie(domain);
            if (c != null && !c.isEmpty()) cookies += c + "; ";
        }
        try {
            java.net.URL parsedUrl = new java.net.URL(currentUrl);
            String currentDomain   = parsedUrl.getProtocol() + "://" + parsedUrl.getHost();
            String c = cm.getCookie(currentDomain);
            if (c != null && !c.isEmpty()) cookies += c + "; ";
        } catch (Exception ignored) {}
        return cookies;
    }

    // ─── injectAutoClickScript ────────────────────────────────────────────────
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

    // ─── extractCookieValue ───────────────────────────────────────────────────
    private String extractCookieValue(String cookies, List<String> names) {
        if (cookies == null || cookies.isEmpty()) return null;
        for (String name : names)
            for (String pair : cookies.split(";")) {
                String t = pair.trim();
                if (t.toLowerCase().startsWith(name.toLowerCase() + "=")) {
                    String v = t.substring(name.length() + 1).trim();
                    if (!v.isEmpty()) return v;
                }

            }
        return null;
    }

    @Override
    protected void handleOnDestroy() {
        if (webViewDialog != null) { webViewDialog.dismiss(); webViewDialog = null; }
        currentWebView = null;
        mainHandler.removeCallbacksAndMessages(null);
        super.handleOnDestroy();
    }
}