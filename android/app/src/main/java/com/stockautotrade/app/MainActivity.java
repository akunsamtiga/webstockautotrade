package com.stockautotrade.app;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.stockautotrade.app.plugins.StcWebViewPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StcWebViewPlugin.class);
        super.onCreate(savedInstanceState);

        // ── Warna status bar = background app ─────────────────────────────────
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            getWindow().setStatusBarColor(0xFF0a0a0a);
        }

        // ── Icon status bar putih (untuk background gelap) ────────────────────
        // WindowInsetsControllerCompat = cara modern, tidak deprecated, API 21-35+
        View decorView = getWindow().getDecorView();
        WindowInsetsControllerCompat ctrl =
                new WindowInsetsControllerCompat(getWindow(), decorView);
        ctrl.setAppearanceLightStatusBars(false); // false = icon putih

    }
}