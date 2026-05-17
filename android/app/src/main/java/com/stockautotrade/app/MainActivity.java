package com.stockautotrade.app;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;

import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.stockautotrade.app.plugins.ApkInstallerPlugin;
import com.stockautotrade.app.plugins.StcWebViewPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // ✅ Daftarkan kedua plugin sebelum super.onCreate()
        registerPlugin(StcWebViewPlugin.class);
        registerPlugin(ApkInstallerPlugin.class);   // ← BARU: plugin download + install APK
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);

            // Status bar atas — warna awal sebelum JS/Capacitor sync
            getWindow().setStatusBarColor(0xFF000000);

            // Navigation bar bawah — fallback saat cold start
            getWindow().setNavigationBarColor(0xFF000000);
        }

        View decorView = getWindow().getDecorView();
        WindowInsetsControllerCompat ctrl =
                new WindowInsetsControllerCompat(getWindow(), decorView);

        // Icon status bar = putih (untuk background gelap)
        ctrl.setAppearanceLightStatusBars(false);

        // Icon navigation bar bawah = putih (untuk background gelap)
        ctrl.setAppearanceLightNavigationBars(false);
    }
}