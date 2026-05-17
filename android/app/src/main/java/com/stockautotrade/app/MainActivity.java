package com.stockautotrade.app;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;

import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.stockautotrade.app.plugins.StcWebViewPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StcWebViewPlugin.class);
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            // ✅ FIX: Hapus FLAG_TRANSLUCENT_NAVIGATION agar warna nav bar bisa di-set
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);

            // Status bar atas — warna awal sebelum JS/Capacitor sync
            getWindow().setStatusBarColor(0xFF000000);

            // ✅ FIX: Navigation bar bawah — tanpa ini Android 15 edge-to-edge
            //    membuat tombol navigasi tidak terlihat karena warna tidak di-set.
            //    JS (@capacitor/navigation-bar) akan override ini setelah tema dimuat,
            //    tapi nilai ini penting sebagai fallback saat cold start.
            getWindow().setNavigationBarColor(0xFF000000);
        }

        View decorView = getWindow().getDecorView();
        WindowInsetsControllerCompat ctrl =
                new WindowInsetsControllerCompat(getWindow(), decorView);

        // Icon status bar = putih (untuk background gelap)
        // JS akan update ini via @capacitor/status-bar sesuai tema aktif
        ctrl.setAppearanceLightStatusBars(false);

        // ✅ FIX: Icon navigation bar bawah = putih (untuk background gelap)
        // JS akan update ini via @capacitor/navigation-bar sesuai tema aktif
        ctrl.setAppearanceLightNavigationBars(false);
    }
}