import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stockautotrade.app',
  appName: 'stockautotrade',
  webDir: 'out',
  plugins: {
    StatusBar: {
      // ✅ FIX: overlaysWebView: false diperlukan agar setBackgroundColor
      //    benar-benar mengubah warna background status bar di Android.
      //    Tanpa ini, status bar "overlay" di atas WebView dan warna tidak bisa di-set.
      overlaysWebView: false,
      // Initial color sebelum JS berjalan — cocok dengan dark default app
      backgroundColor: '#000000',
      style: 'dark',
    },
  },
};
 
export default config;