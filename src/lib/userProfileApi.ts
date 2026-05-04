// lib/userProfileApi.ts
// ✅ FIXED — Gunakan CapacitorHttp untuk bypass CORS di native Android
//
// PERUBAHAN dari versi lama:
//   - Semua fetch() diganti httpGet()/httpPost() via CapacitorHttp
//   - Di web/browser tetap pakai fetch() biasa (CapacitorHttp fallback otomatis)
//   - Ini mengatasi error "failed to fetch" yang terjadi karena CORS di Capacitor WebView

const STOCKITY_BASE_URL =
  process.env.NEXT_PUBLIC_STOCKITY_API_URL ?? 'https://api.stockity.id/';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id:           number;
  email:        string;
  firstName:    string;
  lastName:     string;
  username?:    string;
  nickname?:    string;
  phone?:       string;
  gender?:      string;
  country?:     string;
  birthday?:    string;
  registeredAt?: string;
  avatar?:      string;
}

export interface UserProfileResponse {
  data: UserProfile | null;
}

export interface LoginRequest {
  email:    string;
  password: string;
}

export interface LoginResponse {
  data?: {
    authorizationToken?: string;
    accessToken?:        string;
    deviceId?:           string;
    userId?:             string | number;
  };
}

interface CurrencyItem {
  iso:   string;
  unit:  string;
  name?: string;
}

interface CurrencyData {
  current: string;
  list:    CurrencyItem[];
}

interface CurrencyResponse {
  data?: CurrencyData;
}

export interface FetchedCurrency {
  currency:    string;
  currencyIso: string;
}

/** Mirrors: userProfile.getFullName() di Kotlin */
export function getFullName(p: UserProfile): string {
  const full = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
  return full || p.nickname || p.username || p.email;
}

// ── buildStockityHeaders ──────────────────────────────────────────────────────
function buildStockityHeaders(
  authToken: string,
  deviceId:  string,
  extra:     Record<string, string> = {},
): Record<string, string> {
  return {
    'device-id':           deviceId,
    'device-type':         'web',
    'user-timezone':       'Asia/Bangkok',
    'authorization-token': authToken,
    'User-Agent':          USER_AGENT,
    'Accept':              'application/json, text/plain, */*',
    'Origin':              'https://stockity.id',
    'Referer':             'https://stockity.id/',
    ...extra,
  };
}

// ── httpGet — wrapper CapacitorHttp dengan fallback ke fetch ──────────────────
// CapacitorHttp membuat request lewat native Android → tidak ada CORS
async function httpGet(url: string, headers: Record<string, string>): Promise<unknown> {
  try {
    // Coba CapacitorHttp (native Android / iOS)
    const { CapacitorHttp } = await import('@capacitor/core');
    const res = await CapacitorHttp.get({ url, headers });
    if (res.status >= 400) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.data;
  } catch (capErr: unknown) {
    // Jika CapacitorHttp tidak tersedia (browser/web), fallback ke fetch biasa
    const isNotAvailable =
      capErr instanceof Error &&
      (capErr.message.includes('not implemented') ||
       capErr.message.includes('CapacitorHttp') ||
       capErr.message.includes('undefined'));

    if (isNotAvailable) {
      const res = await fetch(url, { method: 'GET', headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    }
    throw capErr;
  }
}

// ── httpPost — wrapper CapacitorHttp dengan fallback ke fetch ─────────────────
async function httpPost(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Promise<unknown> {
  try {
    const { CapacitorHttp } = await import('@capacitor/core');
    const res = await CapacitorHttp.post({
      url,
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: body,
    });
    if (res.status >= 400) {
      const status = res.status;
      if (status === 401 || status === 403)
        throw new Error('Email atau password salah untuk akun Stockity');
      if (status === 423)
        throw new Error('Akun Stockity diblokir');
      if (status >= 500)
        throw new Error('Server Stockity error');
      throw new Error(`Login gagal (${status})`);
    }
    return res.data;
  } catch (capErr: unknown) {
    const isNotAvailable =
      capErr instanceof Error &&
      (capErr.message.includes('not implemented') ||
       capErr.message.includes('CapacitorHttp') ||
       capErr.message.includes('undefined'));

    if (isNotAvailable) {
      const res = await fetch(url, {
        method:  'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403)
          throw new Error('Email atau password salah untuk akun Stockity');
        if (res.status === 423)
          throw new Error('Akun Stockity diblokir');
        if (res.status >= 500)
          throw new Error('Server Stockity error');
        throw new Error(`Login gagal (${res.status})`);
      }
      return res.json();
    }
    throw capErr;
  }
}

// ── fetchUserProfile ──────────────────────────────────────────────────────────
// Mirrors: UserProfileApiService.getUserProfile()
export async function fetchUserProfile(
  authToken: string,
  deviceId:  string,
  locale     = 'id',
): Promise<UserProfile> {
  const url = `${STOCKITY_BASE_URL}passport/v1/user_profile?locale=${locale}`;

  const json = await httpGet(url, buildStockityHeaders(authToken, deviceId)) as UserProfileResponse;

  if (!json.data) {
    throw new Error('Terjadi kesalahan saat memproses akun (data kosong)');
  }

  return json.data;
}

// ── fetchUserCurrency ─────────────────────────────────────────────────────────
// Mirrors: CurrencyRepository.fetchUserCurrency()
export async function fetchUserCurrency(
  authToken: string,
  deviceId:  string,
  locale     = 'id',
): Promise<FetchedCurrency> {
  try {
    const url  = `${STOCKITY_BASE_URL}currency/v1/user_currency?locale=${locale}`;
    const json = await httpGet(url, buildStockityHeaders(authToken, deviceId)) as CurrencyResponse;
    const data = json.data;

    if (!data) return { currency: 'IDR', currencyIso: 'Rp' };

    const currentCode = data.current ?? 'IDR';
    const currentItem = data.list?.find(c => c.iso === currentCode);
    const unitSymbol  = currentItem?.unit ?? 'Rp';

    return { currency: currentCode, currencyIso: unitSymbol };
  } catch (e) {
    console.warn('[Currency] fetchUserCurrency error:', e);
    return { currency: 'IDR', currencyIso: 'Rp' };
  }
}

// ── loginToStockity ───────────────────────────────────────────────────────────
// Mirrors: LoginApiService.login()
export async function loginToStockity(
  email:    string,
  password: string,
  deviceId: string,
  locale    = 'id',
): Promise<{ authToken: string; deviceId: string }> {
  const url = `${STOCKITY_BASE_URL}passport/v2/sign_in?locale=${locale}`;

  const json = await httpPost(
    url,
    {
      'device-id':     deviceId,
      'device-type':   'web',
      'user-timezone': 'Asia/Bangkok',
      'User-Agent':    USER_AGENT,
      'Accept':        'application/json',
      'Origin':        'https://stockity.id',
      'Referer':       'https://stockity.id/',
    },
    { email, password },
  ) as LoginResponse;

  const token    = json.data?.authorizationToken ?? json.data?.accessToken ?? '';
  const retDevId = json.data?.deviceId ?? deviceId;

  if (!token) throw new Error('Token tidak ditemukan dalam response login');

  return { authToken: token, deviceId: retDevId };
}