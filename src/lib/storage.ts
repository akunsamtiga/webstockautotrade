// lib/storage.ts
// ✅ FIXED — Hybrid Storage: localStorage primary + Capacitor Preferences backup
// localStorage lebih reliable di Capacitor WebView, Preferences sebagai mirror

'use client';

// ── Session key constants ─────────────────────────────────────────────────────
export const SESSION_KEYS = {
  AUTHTOKEN:     'stc_token',
  USER_ID:       'stc_user_id',
  DEVICE_ID:     'stc_device_id',
  EMAIL:         'stc_email',
  USER_TIMEZONE: 'stc_timezone',
  USER_AGENT:    'stc_user_agent',
  DEVICE_TYPE:   'stc_device_type',
  CURRENCY:      'stc_currency',
  CURRENCY_ISO:  'stc_currency_iso',
  IS_LOGGED_IN:  'stc_is_logged_in',
} as const;

// ── UserSession type ──────────────────────────────────────────────────────────
export interface UserSession {
  authtoken:     string;
  userId:        string;
  deviceId:      string;
  email:         string;
  userTimezone:  string;
  userAgent:     string;
  deviceType:    string;
  currency:      string;
  currencyIso:   string;
}

// ── Helper: Check if Capacitor is ready ──────────────────────────────────────
function isCapacitorReady(): boolean {
  return typeof window !== 'undefined' && 
         (window as any).Capacitor?.isNativePlatform?.() === true;
}

// ── storageGet: localStorage primary, Capacitor fallback ────────────────────
async function storageGet(key: string): Promise<string | null> {
  // ✅ WAIT: Tunggu DOM ready untuk memastikan localStorage accessible
  if (typeof window !== 'undefined' && document.readyState === 'loading') {
    await new Promise<void>(resolve => {
      document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
    });
  }

  // ✅ PRIMARY: Selalu cek localStorage dulu (paling reliable di WebView)
  if (typeof window !== 'undefined') {
    try {
      const localValue = localStorage.getItem(key);
      if (localValue !== null && localValue !== '') {
        return localValue;
      }
    } catch (e) {
      console.warn(`[Storage] localStorage get error for key "${key}":`, e);
    }
  }
  
  // ✅ FALLBACK: Coba Capacitor Preferences jika tersedia
  if (isCapacitorReady()) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      const { value } = await Preferences.get({ key });
      
      // ✅ SYNC BACK: Jika ada di Preferences tapi tidak di localStorage, sync ke localStorage
      if (value && typeof window !== 'undefined') {
        try {
          localStorage.setItem(key, value);
        } catch { /* ignore */ }
      }
      
      return value;
    } catch (e) {
      console.warn(`[Storage] Capacitor Preferences get error for key "${key}":`, e);
    }
  }
  
  return null;
}

// ── storageSet: Dual-write ke localStorage + Capacitor ──────────────────────
async function storageSet(key: string, value: string): Promise<void> {
  // ✅ ALWAYS: Simpan ke localStorage (primary)
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, value);
  }
  
  // ✅ MIRROR: Juga simpan ke Capacitor Preferences jika tersedia
  if (isCapacitorReady()) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key, value });
    } catch (e) {
      console.warn(`[Storage] Capacitor Preferences set error for key "${key}":`, e);
      // Tidak throw error - localStorage sudah berhasil
    }
  }
}

// ── storageRemove: Hapus dari both storage ───────────────────────────────────
async function storageRemove(key: string): Promise<void> {
  // Hapus dari localStorage
  if (typeof window !== 'undefined') {
    localStorage.removeItem(key);
  }
  
  // Hapus dari Capacitor Preferences
  if (isCapacitorReady()) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.remove({ key });
    } catch (e) {
      console.warn(`[Storage] Capacitor Preferences remove error for key "${key}":`, e);
    }
  }
}

// ── Exported storage object ─────────────────────────────────────────────────
export const storage = {
  get:    storageGet,
  set:    storageSet,
  remove: storageRemove,
};

// ── saveUserSession ───────────────────────────────────────────────────────────
export async function saveUserSession(session: UserSession): Promise<void> {
  await Promise.all([
    storageSet(SESSION_KEYS.AUTHTOKEN,     session.authtoken),
    storageSet(SESSION_KEYS.USER_ID,       session.userId),
    storageSet(SESSION_KEYS.DEVICE_ID,     session.deviceId),
    storageSet(SESSION_KEYS.EMAIL,         session.email),
    storageSet(SESSION_KEYS.USER_TIMEZONE, session.userTimezone),
    storageSet(SESSION_KEYS.USER_AGENT,    session.userAgent),
    storageSet(SESSION_KEYS.DEVICE_TYPE,   session.deviceType),
    storageSet(SESSION_KEYS.CURRENCY,      session.currency),
    storageSet(SESSION_KEYS.CURRENCY_ISO,  session.currencyIso),
    storageSet(SESSION_KEYS.IS_LOGGED_IN,  'true'),
  ]);
}

// ── getUserSession ────────────────────────────────────────────────────────────
export async function getUserSession(): Promise<UserSession | null> {
  const isLoggedIn = await storageGet(SESSION_KEYS.IS_LOGGED_IN);
  if (isLoggedIn !== 'true') return null;

  return {
    authtoken:    (await storageGet(SESSION_KEYS.AUTHTOKEN))     ?? '',
    userId:       (await storageGet(SESSION_KEYS.USER_ID))       ?? '',
    deviceId:     (await storageGet(SESSION_KEYS.DEVICE_ID))     ?? '',
    email:        (await storageGet(SESSION_KEYS.EMAIL))         ?? '',
    userTimezone: (await storageGet(SESSION_KEYS.USER_TIMEZONE)) ?? 'Asia/Bangkok',
    userAgent:    (await storageGet(SESSION_KEYS.USER_AGENT))    ?? '',
    deviceType:   (await storageGet(SESSION_KEYS.DEVICE_TYPE))   ?? 'web',
    currency:     (await storageGet(SESSION_KEYS.CURRENCY))      ?? 'IDR',
    currencyIso:  (await storageGet(SESSION_KEYS.CURRENCY_ISO))  ?? 'IDR',
  };
}

// ── saveCurrencyWithIso ───────────────────────────────────────────────────────
export async function saveCurrencyWithIso(currency: string, iso: string): Promise<void> {
  await storageSet(SESSION_KEYS.CURRENCY,     currency);
  await storageSet(SESSION_KEYS.CURRENCY_ISO, iso);
}

// ── sessionLogout ─────────────────────────────────────────────────────────────
export async function sessionLogout(): Promise<void> {
  await Promise.all(
    Object.values(SESSION_KEYS).map(key => storageRemove(key))
  );
}

// ── isSessionValid: Cek apakah session valid (token + isLoggedIn) ─────────────
export async function isSessionValid(): Promise<boolean> {
  try {
    const [isLoggedIn, token] = await Promise.all([
      storageGet(SESSION_KEYS.IS_LOGGED_IN),
      storageGet(SESSION_KEYS.AUTHTOKEN),
    ]);
    
    // Session valid jika IS_LOGGED_IN = 'true' DAN token ada
    const valid = isLoggedIn === 'true' && !!token && token.length > 10;
    
    if (!valid) {
      console.log('[Storage] Session invalid - isLoggedIn:', isLoggedIn, 'hasToken:', !!token);
    }
    
    return valid;
  } catch (e) {
    console.error('[Storage] isSessionValid error:', e);
    return false;
  }
}

// ── getAuthToken: Ambil token dengan validasi ────────────────────────────────
export async function getAuthToken(): Promise<string | null> {
  const isValid = await isSessionValid();
  if (!isValid) return null;
  return storageGet(SESSION_KEYS.AUTHTOKEN);
}
