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