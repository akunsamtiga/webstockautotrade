// src/plugins/StcWebViewPlugin.ts
//
// JS/TS interface untuk StcWebViewPlugin.java
// Digunakan di register/page.tsx sebagai pengganti @capacitor/browser
//
// ✅ FIXED v2:
//   - Tambah window event emission untuk token detection
//   - Popup sukses muncul langsung tanpa nunggu WebView ditutup
//   - Auto-click hanya helper, bukan prerequisite

import { registerPlugin, PluginListenerHandle } from '@capacitor/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StcWebViewOpenOptions {
  /** URL yang akan dibuka di in-app WebView */
  url: string;
}

export interface StcWebViewOpenResult {
  /** URL terakhir saat success terdeteksi */
  url:        string;
  /** Authorization token dari cookie (kosong jika tidak ditemukan) */
  authToken:  string;
  /** Device ID dari cookie (kosong jika tidak ditemukan) */
  deviceId:   string;
  /** Raw cookie string — untuk debug */
  cookies?:   string;
  /** true jika success URL terdeteksi */
  success:    boolean;
}

export interface StcWebViewBrowserFinishedEvent {
  finished:   boolean;
  /** true jika user menutup manual tanpa registrasi selesai */
  cancelled?: boolean;
}

export interface StcWebViewDaftarClickedEvent {
  /** true jika tombol daftar berhasil diklik via auto-click */
  daftarClicked: boolean;
}

// ── Plugin Interface ───────────────────────────────────────────────────────────
export interface StcWebViewPlugin {
  open(options: StcWebViewOpenOptions): Promise<StcWebViewOpenResult>;
  close(): Promise<void>;
  /** Hapus cookies + cache WebView — dipanggil saat logout */
  clearSession(): Promise<void>;
  addListener(
    eventName: string,
    listenerFunc: (event: unknown) => void
  ): Promise<PluginListenerHandle>;
}

// ── Register plugin ────────────────────────────────────────────────────────────
const StcWebViewNative = registerPlugin<StcWebViewPlugin>('StcWebView', {
  web: () => import('./StcWebViewWeb').then(m => new m.StcWebViewWeb()),
});

// ── Helper: deteksi native ────────────────────────────────────────────────────
function isNative(): boolean {
  return typeof window !== 'undefined' &&
    (window as any).Capacitor?.isNativePlatform?.() === true;
}

// ✅ HELPER: Emit window event untuk token detection
function emitTokenDetected(authToken: string, deviceId: string, url: string) {
  if (typeof window === 'undefined') return;
  const event = new CustomEvent('stc:register:success', {
    detail: { authToken, deviceId, url },
  });
  window.dispatchEvent(event);
}

// ✅ HELPER: Emit window event untuk daftar clicked
function emitDaftarClicked() {
  if (typeof window === 'undefined') return;
  const event = new CustomEvent('stc:register:daftarClicked', {
    detail: { daftarClicked: true },
  });
  window.dispatchEvent(event);
}

// ── stcWebView: unified API ─────────────────────────────────────────────────────
export const stcWebView = {
  async open(options: StcWebViewOpenOptions): Promise<StcWebViewOpenResult> {
    if (isNative()) {
      // ✅ PERUBAHAN: Setup listener untuk token detection DAN daftar clicked
      // sebelum open() dipanggil, agar event tidak terlewat

      // Listener untuk browserFinished
      StcWebViewNative.addListener('browserFinished', (event: unknown) => {
        const e = event as StcWebViewBrowserFinishedEvent;
        if (e.finished && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('stc:register:finished', { detail: e }));
        }
      }).catch(() => {});

      // ✅ Listener untuk daftarButtonClicked — percepat token check
      StcWebViewNative.addListener('daftarButtonClicked', (event: unknown) => {
        const e = event as StcWebViewDaftarClickedEvent;
        if (e.daftarClicked) {
          emitDaftarClicked();
        }
      }).catch(() => {});

      const result = await StcWebViewNative.open(options);

      // ✅ PERUBAHAN: Kalau token ditemukan di result, emit event langsung
      // sebelum return, agar popup muncul tanpa nunggu WebView ditutup
      if (result.success && result.authToken) {
        emitTokenDetected(result.authToken, result.deviceId, result.url);
      }

      return result;
    }

    // Web fallback
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: options.url, presentationStyle: 'fullscreen' });
    } catch {
      window.open(options.url, '_blank', 'noopener,noreferrer');
    }
    return { url: options.url, authToken: '', deviceId: '', success: false };
  },

  async close(): Promise<void> {
    if (isNative()) {
      return StcWebViewNative.close();
    }
  },

  /**
   * Hapus cookies & cache WebView saat logout.
   *
   * Di Android, CookieManager dipakai bersama antara Capacitor WebView
   * dan StcWebView in-app — sehingga clearAllCookies() efektif untuk keduanya.
   *
   * Urutan:
   *   1. CapacitorCookies.clearAllCookies()  → hapus semua cookie native
   *   2. StcWebViewNative.clearSession()     → jika ada impl Java (opsional)
   *   3. Hapus cookie di domain stockity.id  → defence-in-depth
   */
  async clearSession(): Promise<void> {
    if (!isNative()) return;

    // 1. Hapus semua cookie via CapacitorCookies (native Android CookieManager)
    try {
      const { CapacitorCookies } = await import('@capacitor/core');
      await CapacitorCookies.clearAllCookies();
    } catch (e) {
      console.warn('[StcWebView] clearAllCookies error:', e);
    }

    // 2. Panggil clearSession() di native plugin jika sudah diimplementasi di Java
    //    (graceful — tidak error kalau belum ada)
    try {
      await (StcWebViewNative as any).clearSession?.();
    } catch { /* ignore — method mungkin belum ada di Java */ }

    // 3. Defence-in-depth: hapus cookie per-domain stockity.id
    const STOCKITY_DOMAINS = [
      'https://stockity.id',
      'https://api.stockity.id',
      'https://www.stockity.id',
    ];
    for (const url of STOCKITY_DOMAINS) {
      try {
        const { CapacitorCookies } = await import('@capacitor/core');
        await CapacitorCookies.clearCookies({ url });
      } catch { /* ignore */ }
    }
  },

  async addListenerBrowserFinished(
    fn: (e: StcWebViewBrowserFinishedEvent) => void
  ): Promise<PluginListenerHandle> {
    if (isNative()) {
      return StcWebViewNative.addListener('browserFinished', fn as (event: unknown) => void);
    }
    try {
      const { Browser } = await import('@capacitor/browser');
      const handle = await Browser.addListener('browserFinished', () =>
        fn({ finished: true, cancelled: true })
      );
      return handle;
    } catch {
      return { remove: async () => {} };
    }
  },

  async addListenerDaftarClicked(
    fn: (e: StcWebViewDaftarClickedEvent) => void
  ): Promise<PluginListenerHandle> {
    if (isNative()) {
      return StcWebViewNative.addListener('daftarButtonClicked', fn as (event: unknown) => void);
    }
    return { remove: async () => {} };
  },
};