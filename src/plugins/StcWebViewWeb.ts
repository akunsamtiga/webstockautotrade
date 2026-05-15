// src/plugins/StcWebViewWeb.ts
// Web fallback saat plugin tidak tersedia (browser/web mode)
import { WebPlugin, PluginListenerHandle } from '@capacitor/core';
import type { 
  StcWebViewPlugin, 
  StcWebViewOpenOptions, 
  StcWebViewOpenResult,
} from './StcWebViewPlugin';

export class StcWebViewWeb extends WebPlugin implements StcWebViewPlugin {
  async open(options: StcWebViewOpenOptions): Promise<StcWebViewOpenResult> {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: options.url, presentationStyle: 'fullscreen' });
    } catch {
      window.open(options.url, '_blank', 'noopener,noreferrer');
    }
    return { url: options.url, authToken: '', deviceId: '', success: false };
  }

  async close(): Promise<void> {
    // no-op on web
  }

  /** Web fallback: hapus cookie via document.cookie (best-effort) */
  async clearSession(): Promise<void> {
    // Di browser, hapus semua cookie yang accessible via JS
    if (typeof document !== 'undefined') {
      document.cookie.split(';').forEach(cookie => {
        const eqPos = cookie.indexOf('=');
        const name  = eqPos > -1 ? cookie.slice(0, eqPos).trim() : cookie.trim();
        // Hapus dengan semua kombinasi path/domain yang mungkin
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=stockity.id`;
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.stockity.id`;
      });
    }
  }

  // Implement addListener dari WebPlugin base class
  async addListener(
    _eventName: string,
    _listenerFunc: (event: unknown) => void
  ): Promise<PluginListenerHandle> {
    // Web fallback tidak mendukung listener native
    // Return dummy remove function dengan Promise<void>
    return { remove: async () => {} };
  }
}