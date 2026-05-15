'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  storage,
  saveUserSession,
  saveCurrencyWithIso,
} from '@/lib/storage';
import {
  fetchUserProfile,
  fetchUserCurrency,
  getFullName,
  checkHasTradingHistory,
} from '@/lib/userProfileApi';
import {
  getWhitelistUserByEmail,
  getWhitelistUserByUserId,
  updateLastLogin,
  addWhitelistUser,
  getRegistrationConfig,
} from '@/lib/supabaseRepository';
import { stcWebView } from '@/plugins/StcWebViewPlugin';

function isNativeApp(): boolean {
  return typeof window !== 'undefined' &&
    (window as any).Capacitor?.isNativePlatform?.() === true;
}

const DEFAULT_REGISTRATION_URL = 'https://stockity.id/registered?a=25db72fbbc00';
const DEFAULT_WHATSAPP_URL     = 'https://t.me/sanx_id';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

async function getOrCreateDeviceId(): Promise<string> {
  const stored = await storage.get('stc_device_id');
  if (stored) return stored;
  try {
    const { Device } = await import('@capacitor/device');
    const info = await Device.getId();
    const id   = (info as any).identifier ?? (info as any).uuid ?? crypto.randomUUID();
    await storage.set('stc_device_id', id);
    return id;
  } catch {
    const id = crypto.randomUUID();
    await storage.set('stc_device_id', id);
    return id;
  }
}

interface WhitelistResult {
  success:    boolean;
  error?:     string;
  isBlocked?: boolean;
  userId?:    string;
  email?:     string;
}

async function saveUserToWhitelistAndLogin(
  authToken: string,
  deviceId:  string,
): Promise<WhitelistResult> {
  let userProfile;
  try {
    userProfile = await fetchUserProfile(authToken, deviceId);
  } catch (e: unknown) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Terjadi kesalahan saat memproses akun',
    };
  }

  const userId = String(userProfile.id);

  const byEmail = await getWhitelistUserByEmail(userProfile.email);
  if (byEmail) {
    if (!byEmail.isActive)
      return {
        success: false,
        isBlocked: true,
        error: 'Akun kamu belum aktif. Silahkan hubungi admin untuk aktivasi StockAutoTrade.',
      };
    await updateLastLogin(byEmail.userId);
    return { success: true, userId: byEmail.userId, email: userProfile.email };
  }

  const byUserId = await getWhitelistUserByUserId(userId);
  if (byUserId) {
    if (!byUserId.isActive)
      return {
        success: false,
        isBlocked: true,
        error: 'Akun Anda saat ini belum terhubung ke sistem StockAutoTrade. Hubungi admin untuk proses aktivasi.',
      };
    await updateLastLogin(byUserId.userId);
    return { success: true, userId: byUserId.userId, email: userProfile.email };
  }

  // ── Tolak jika sudah punya riwayat trading (bukan akun baru) ──────────────
  const hasTradingHistory = await checkHasTradingHistory(authToken, deviceId);
  if (hasTradingHistory) {
    return {
      success:   false,
      isBlocked: false,
      error:
        'Akun Stockity Anda sudah memiliki riwayat trading.\n\n' +
        'Pendaftaran StockAutoTrade hanya tersedia untuk akun Stockity baru. ' +
        'Jika Anda merasa ini keliru, silakan hubungi admin.',
    };
  }

  await addWhitelistUser({
    email:             userProfile.email,
    name:              getFullName(userProfile),
    userId,
    deviceId,
    isActive:          true,
    createdAt:         Date.now(),
    lastLogin:         Date.now(),
    addedBy:           'web_registration',
    addedAt:           Date.now(),
    fcmToken:          '',
    fcmTokenUpdatedAt: 0,
  });

  return { success: true, userId, email: userProfile.email };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SavingDialog({ message = 'Mohon tunggu sebentar...' }: { message?: string }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.45)',
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "-apple-system, 'SF Pro Display', BlinkMacSystemFont, sans-serif",
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.92)',
        borderRadius: 24,
        padding: '32px 28px',
        width: 280,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
        boxShadow: '0 24px 64px rgba(0,0,0,0.18), 0 0 0 0.5px rgba(0,0,0,0.08)',
        border: '1px solid rgba(255,255,255,0.5)',
      }}>
        <style>{`@keyframes sv-spin { to { transform:rotate(360deg); } }`}</style>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          border: '3px solid rgba(0,122,255,0.15)', borderTopColor: '#007AFF',
          animation: 'sv-spin 0.8s linear infinite',
        }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: '#1c1c1e', marginBottom: 4, letterSpacing: '-0.01em' }}>Menghubungkan</div>
          <div style={{ fontSize: 13, color: '#6e6e73', fontWeight: 400 }}>{message}</div>
        </div>
      </div>
    </div>
  );
}

// ── FIX 1: Hapus tombol "Lanjut Trading di Stockity" ─────────────────────────
function ModernSuccessDialog({
  email,
  onLoginClick,
}: {
  email: string;
  onLoginClick: () => void;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setTimeout(() => setVisible(true), 80); }, []);

  return (
    <>
      <style>{`
        @keyframes msd-bg { from{opacity:0} to{opacity:1} }
        @keyframes msd-scale { from{opacity:0;transform:scale(0.92) translateY(12px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes icon-pop { 0%{transform:scale(0.8);opacity:0} 60%{transform:scale(1.05)} 100%{transform:scale(1);opacity:1} }
      `}</style>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: visible ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0)',
        backdropFilter: visible ? 'blur(16px) saturate(180%)' : 'blur(0px)',
        WebkitBackdropFilter: visible ? 'blur(16px) saturate(180%)' : 'blur(0px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 24px',
        transition: 'background 0.35s ease, backdrop-filter 0.35s ease',
        fontFamily: "-apple-system, 'SF Pro Display', BlinkMacSystemFont, sans-serif",
        WebkitFontSmoothing: 'antialiased',
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.95)',
          borderRadius: 28,
          padding: '36px 28px 28px',
          width: '100%', maxWidth: 360,
          animation: visible ? 'msd-scale 0.45s cubic-bezier(0.22,1,0.36,1) forwards' : 'none',
          boxShadow: '0 24px 64px rgba(0,0,0,0.18), 0 0 0 0.5px rgba(0,0,0,0.06)',
          border: '1px solid rgba(255,255,255,0.6)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: 22,
            background: 'linear-gradient(135deg, #34C759 0%, #30D158 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 20,
            boxShadow: '0 6px 20px rgba(52,199,89,0.30)',
            animation: 'icon-pop 0.5s cubic-bezier(0.22,1,0.36,1) 0.15s both',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
              stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>

          <div style={{ fontSize: 24, fontWeight: 700, color: '#1c1c1e', letterSpacing: '-0.5px', marginBottom: 6, textAlign: 'center' }}>
            Registrasi Berhasil
          </div>
          <div style={{ fontSize: 15, color: '#34C759', fontWeight: 600, marginBottom: 14 }}>
            Selamat datang di StockAutoTrade
          </div>

          <div style={{ fontSize: 14, color: '#6e6e73', textAlign: 'center', lineHeight: 1.5, marginBottom: 16, padding: '0 4px' }}>
            Akun Stockity Anda telah berhasil didaftarkan.
          </div>

          {email ? (
            <div style={{
              marginBottom: 24, padding: '10px 16px', borderRadius: 14,
              background: 'rgba(0,122,255,0.06)', border: '1px solid rgba(0,122,255,0.14)',
              width: '100%', textAlign: 'center',
            }}>
              <p style={{ fontSize: 11, color: '#6e6e73', marginBottom: 3, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Email terdaftar</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#1c1c1e', wordBreak: 'break-all', letterSpacing: '-0.2px' }}>{email}</p>
            </div>
          ) : (
            <div style={{ marginBottom: 24 }} />
          )}

          {/* Hanya satu tombol — tombol "Lanjut Trading di Stockity" dihapus */}
          <div style={{ width: '100%' }}>
            <button onClick={onLoginClick} style={{
              width: '100%', height: 50, borderRadius: 14,
              background: '#007AFF', color: '#fff', border: 'none',
              fontSize: 16, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 2px 12px rgba(0,122,255,0.28)',
              fontFamily: 'inherit', letterSpacing: '-0.2px',
              transition: 'transform 0.12s ease, opacity 0.15s ease',
            }} onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')} onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')} onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              Login ke StockAutoTrade
            </button>
          </div>

          <div style={{ marginTop: 16, fontSize: 12, color: '#aeaeb2', display: 'flex', alignItems: 'center', gap: 6, textAlign: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Gunakan password Stockity saat login
          </div>
        </div>
      </div>
    </>
  );
}

function ErrorDialog({
  message,
  isBlocked,
  onContactAdmin,
  onBack,
}: {
  message: string;
  isBlocked: boolean;
  onContactAdmin: () => void;
  onBack: () => void;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.45)',
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px',
      fontFamily: "-apple-system, 'SF Pro Display', BlinkMacSystemFont, sans-serif",
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.95)', borderRadius: 24, padding: '28px 24px',
        width: '100%', maxWidth: 360,
        boxShadow: '0 16px 48px rgba(0,0,0,0.18), 0 0 0 0.5px rgba(0,0,0,0.06)',
        border: '1px solid rgba(255,255,255,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'rgba(255,59,48,0.10)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF3B30" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#1c1c1e', letterSpacing: '-0.3px' }}>{isBlocked ? 'Akun Diblokir' : 'Proses Gagal'}</span>
        </div>
        <p style={{ fontSize: 14, color: '#6e6e73', lineHeight: 1.5, marginBottom: 24, whiteSpace: 'pre-line' }}>{message}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onBack} style={{
            flex: 1, height: 44, borderRadius: 12,
            background: 'rgba(120,120,128,0.10)', color: '#1c1c1e',
            border: 'none', fontSize: 15,
            fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
            transition: 'transform 0.1s',
          }} onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')} onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}>Kembali</button>
          <button onClick={onContactAdmin} style={{
            flex: 1, height: 44, borderRadius: 12,
            background: '#34C759', color: '#fff', border: 'none',
            fontSize: 15, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit',
            transition: 'transform 0.1s',
          }} onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')} onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
            </svg>
            Hubungi Admin
          </button>
        </div>
      </div>
    </div>
  );
}

function WebRegisterModal({
  registrationUrl,
  onSuccess,
  onClose,
}: {
  registrationUrl: string;
  onSuccess: (email: string) => void;
  onClose: () => void;
}) {
  const [visible,   setVisible]   = useState(false);
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [step,      setStep]      = useState('');
  const [error,     setError]     = useState('');

  useEffect(() => { setTimeout(() => setVisible(true), 60); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setError('');
    setLoading(true);

    try {
      setStep('Memverifikasi akun Stockity…');
      const { loginToStockity, checkHasTradingHistory: checkHistory } = await import('@/lib/userProfileApi');
      const { api } = await import('@/lib/api');

      const resolvedDevice = await getOrCreateDeviceId();

      // Dapatkan Stockity auth token langsung (untuk cek riwayat trading)
      const { authToken: stockityToken, deviceId: stockityDevice } =
        await loginToStockity(email, password, resolvedDevice);

      const resolvedStockityDevice = stockityDevice || resolvedDevice;

      // Login ke STC backend (untuk session STC)
      const res = await api.login(email, password);

      const resolvedEmail  = res.email  || email;
      const resolvedUserId = res.userId || '';
      const resolvedDevice2 = res.deviceId || resolvedStockityDevice;

      setStep('Memeriksa akses whitelist…');

      const byEmail = await getWhitelistUserByEmail(resolvedEmail);
      if (byEmail) {
        if (!byEmail.isActive)
          throw new Error('Akun kamu belum aktif. Silahkan hubungi admin untuk aktivasi StockAutoTrade.');
        await updateLastLogin(byEmail.userId ?? resolvedUserId);
        onSuccess(resolvedEmail);
        return;
      }

      const byUserId = await getWhitelistUserByUserId(resolvedUserId);
      if (byUserId) {
        if (!byUserId.isActive)
          throw new Error('Akun Anda saat ini belum terhubung ke sistem StockAutoTrade. Hubungi admin untuk proses aktivasi.');
        await updateLastLogin(byUserId.userId ?? resolvedUserId);
        onSuccess(resolvedEmail);
        return;
      }

      // ── Cek riwayat trading (hanya untuk pendaftar baru) ─────────────────────
      setStep('Memeriksa riwayat trading…');
      const hasTradingHistory = await checkHistory(stockityToken, resolvedStockityDevice);
      if (hasTradingHistory) {
        throw new Error(
          'Akun Stockity Anda sudah memiliki riwayat trading.\n\n' +
          'Pendaftaran STC AutoTrade hanya tersedia untuk akun Stockity baru. ' +
          'Jika Anda merasa ini keliru, silakan hubungi admin.',
        );
      }

      setStep('Mendaftarkan ke sistem STC…');
      await addWhitelistUser({
        email:             resolvedEmail,
        name:              resolvedEmail,
        userId:            resolvedUserId,
        deviceId:          resolvedDevice2,
        isActive:          true,
        createdAt:         Date.now(),
        lastLogin:         Date.now(),
        addedBy:           'web_registration',
        addedAt:           Date.now(),
        fcmToken:          '',
        fcmTokenUpdatedAt: 0,
      });

      setStep('Berhasil! Mengarahkan…');
      onSuccess(resolvedEmail);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan. Silakan coba lagi.');
      setStep('');
    } finally {
      setLoading(false);
    }
  };

  const font = "-apple-system, 'SF Pro Display', BlinkMacSystemFont, 'Helvetica Neue', sans-serif";

  return (
    <>
      <style>{`
        @keyframes wrm-in  { from{opacity:0;transform:translateY(32px) scale(0.96)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes wrm-spin{ to{transform:rotate(360deg)} }
        .wrm-input:focus { outline: none; border-color: #007aff !important; box-shadow: 0 0 0 4px rgba(0,122,255,0.10) !important; }
        .wrm-btn-close:hover { background: rgba(0,0,0,0.06) !important; }
      `}</style>

      <div
        onClick={loading ? undefined : onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 400,
          background: visible ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0)',
          backdropFilter: visible ? 'blur(16px) saturate(180%)' : 'blur(0px)',
          WebkitBackdropFilter: visible ? 'blur(16px) saturate(180%)' : 'blur(0px)',
          transition: 'background 0.3s ease, backdrop-filter 0.3s ease',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          fontFamily: font, WebkitFontSmoothing: 'antialiased',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'rgba(255,255,255,0.96)',
            borderRadius: '28px 28px 0 0',
            padding: '0 0 max(env(safe-area-inset-bottom),24px)',
            width: '100%', maxWidth: 480,
            animation: visible ? 'wrm-in 0.42s cubic-bezier(0.22,1,0.36,1) forwards' : 'none',
            boxShadow: '0 -8px 48px rgba(0,0,0,0.15), 0 0 0 0.5px rgba(0,0,0,0.06)',
            border: '1px solid rgba(255,255,255,0.5)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.12)' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 0' }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1c1c1e', margin: 0, letterSpacing: '-0.5px' }}>
                Verifikasi Akun Stockity
              </h2>
              <p style={{ fontSize: 13, color: '#6e6e73', margin: '4px 0 0' }}>
                Masukkan kredensial Stockity Anda
              </p>
            </div>
            <button
              className="wrm-btn-close"
              onClick={loading ? undefined : onClose}
              disabled={loading}
              style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(0,0,0,0.05)', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: loading ? 'not-allowed' : 'pointer', transition: 'background 0.15s',
                opacity: loading ? 0.4 : 1,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6e6e73" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div style={{
            margin: '16px 20px 0',
            padding: '10px 14px',
            borderRadius: 12,
            background: 'rgba(0,122,255,0.06)',
            border: '1px solid rgba(0,122,255,0.12)',
            display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p style={{ fontSize: 12.5, color: '#007aff', lineHeight: 1.5, margin: 0 }}>
              Gunakan email & password akun <strong>stockity.id</strong> Anda.{' '}
              Belum punya akun?{' '}
              <a
                href={registrationUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#007aff', fontWeight: 600, textDecoration: 'underline' }}
              >
                Daftar di sini
              </a>
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate style={{ padding: '16px 20px 0' }}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#aeaeb2', marginBottom: 6 }}>
                Email Stockity
              </label>
              <input
                className="wrm-input"
                type="email"
                placeholder="contoh@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="email"
                autoCapitalize="none"
                style={{
                  width: '100%', height: 48, borderRadius: 12,
                  border: '1.5px solid rgba(0,0,0,0.10)',
                  padding: '0 14px', fontSize: 16, color: '#1c1c1e',
                  fontFamily: font, background: 'rgba(118,118,128,0.05)',
                  transition: 'border-color 0.18s, box-shadow 0.18s',
                  boxSizing: 'border-box', appearance: 'none',
                  opacity: loading ? 0.6 : 1,
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#aeaeb2', marginBottom: 6 }}>
                Password Stockity
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  className="wrm-input"
                  type={showPass ? 'text' : 'password'}
                  placeholder="Password akun Stockity"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                  style={{
                    width: '100%', height: 48, borderRadius: 12,
                    border: '1.5px solid rgba(0,0,0,0.10)',
                    padding: '0 44px 0 14px', fontSize: 16, color: '#1c1c1e',
                    fontFamily: font, background: 'rgba(118,118,128,0.05)',
                    letterSpacing: showPass ? 'normal' : '3px',
                    transition: 'border-color 0.18s, box-shadow 0.18s',
                    boxSizing: 'border-box', appearance: 'none',
                    opacity: loading ? 0.6 : 1,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  tabIndex={-1}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#aeaeb2', padding: 4, display: 'flex', alignItems: 'center',
                  }}
                >
                  {showPass ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                background: 'rgba(255,59,48,0.06)', border: '1px solid rgba(255,59,48,0.14)',
                borderRadius: 10, padding: '10px 12px', marginBottom: 14,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff3b30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p style={{ fontSize: 13, color: '#ff3b30', margin: 0, lineHeight: 1.4 }}>{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              style={{
                width: '100%', height: 50, borderRadius: 14,
                background: loading || !email || !password ? 'rgba(0,122,255,0.35)' : '#007aff',
                color: '#fff', border: 'none',
                fontSize: 16, fontWeight: 600, cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                fontFamily: font, boxShadow: loading ? 'none' : '0 2px 12px rgba(0,122,255,0.25)',
                transition: 'background 0.15s, box-shadow 0.15s, transform 0.12s',
                letterSpacing: '-0.2px',
              }}
            >
              {loading ? (
                <>
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%',
                    border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
                    animation: 'wrm-spin 0.7s linear infinite',
                  }} />
                  <span style={{ fontSize: 14, opacity: 0.9 }}>{step || 'Memproses…'}</span>
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                  Verifikasi & Daftarkan
                </>
              )}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 14, fontSize: 12.5, color: '#aeaeb2', padding: '0 20px' }}>
            Dengan mendaftar, akun Stockity Anda akan ditambahkan ke sistem StockAutoTrade.
          </p>
        </div>
      </div>
    </>
  );
}

// ─── Register Landing UI ──────────────────────────────────────────────────────

function RegisterLanding({
  onOpenWebView,
  onAlreadyRegistered,
  onGoLogin,
  isWeb,
  onShowWebModal,
  registrationUrl,
}: {
  onOpenWebView: () => void;
  onAlreadyRegistered: () => void;
  onGoLogin: () => void;
  isWeb?: boolean;
  onShowWebModal?: () => void;
  registrationUrl?: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setTimeout(() => setVisible(true), 80); }, []);

  return (
    <>
      <style>{`
        @keyframes rl-rise { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
        @keyframes rl-orb  { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(3%,2%) scale(1.03)} }
        @keyframes step-in { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:translateX(0)} }
        .rl-btn-primary { transition: transform 0.12s ease, opacity 0.15s ease; }
        .rl-btn-primary:active { transform: scale(0.97); opacity: 0.9; }
        .rl-btn-outline { transition: transform 0.12s ease, opacity 0.15s ease; }
        .rl-btn-outline:active { transform: scale(0.97); opacity: 0.9; }
        .step-row { animation: step-in 0.4s cubic-bezier(0.22,1,0.36,1) forwards; opacity: 0; }
        .step-row:nth-child(1) { animation-delay: 0.15s; }
        .step-row:nth-child(2) { animation-delay: 0.25s; }
        .step-row:nth-child(3) { animation-delay: 0.35s; }
      `}</style>
      <div style={{
        position: 'fixed', inset: 0,
        background: '#f2f2f7',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px 20px max(env(safe-area-inset-bottom), 24px)',
        fontFamily: "-apple-system, 'SF Pro Display', BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
        WebkitFontSmoothing: 'antialiased',
        overflow: 'hidden',
      }}>
        {/* Ambient orbs */}
        <div style={{
          position: 'fixed', width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,122,255,0.09) 0%, transparent 70%)',
          top: '-22%', right: '-15%', filter: 'blur(90px)',
          animation: 'rl-orb 22s ease-in-out infinite alternate', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'fixed', width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(48,209,88,0.06) 0%, transparent 70%)',
          bottom: '-18%', left: '-12%', filter: 'blur(80px)',
          animation: 'rl-orb 26s ease-in-out infinite alternate-reverse', pointerEvents: 'none',
        }} />

        <div style={{
          position: 'relative', zIndex: 2,
          width: '100%', maxWidth: 360,
          opacity: visible ? 1 : 0,
          animation: visible ? 'rl-rise 0.7s cubic-bezier(0.22,1,0.36,1) forwards' : 'none',
        }}>
          {/* Brand Header */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              width: 90, height: 90, borderRadius: 26, margin: '0 auto 20px',
              background: '#ffffff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)',
              position: 'relative',
              overflow: 'hidden',
            }}>
              <Image
                src="/logo.png"
                alt="STC AutoTrade"
                width={52}
                height={52}
                style={{ objectFit: 'contain', display: 'block' }}
                priority
              />
            </div>
            <h1 style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: '-0.8px',
              color: '#1c1c1e',
              margin: '0 0 8px',
              lineHeight: 1.2,
            }}>
              StockAutoTrade
            </h1>
            <p style={{
              fontSize: 15,
              color: '#8e8e93',
              lineHeight: 1.5,
              margin: 0,
              fontWeight: 400,
              padding: '0 16px',
              letterSpacing: '-0.1px',
            }}>
              Daftarkan akun Stockity Anda untuk mulai menggunakan bot trading otomatis
            </p>
          </div>

          {/* Steps Card */}
          <div style={{
            background: '#ffffff',
            borderRadius: 20,
            padding: '24px 20px 20px',
            boxShadow: '0 2px 16px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.03)',
            marginBottom: 16,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 18,
            }}>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#aeaeb2',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                Langkah Pendaftaran
              </span>
              <div style={{ flex: 1, height: 0.5, background: 'rgba(0,0,0,0.06)' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                {
                  num: '1',
                  title: 'Buka halaman pendaftaran',
                  desc: 'Kunjungi stockity.id untuk membuat akun',
                  color: '#007aff',
                },
                {
                  num: '2',
                  title: 'Lengkapi data registrasi',
                  desc: 'Isi email, password, dan verifikasi akun',
                  color: '#34C759',
                },
                {
                  num: '3',
                  title: 'Verifikasi ke StockAutoTrade',
                  desc: 'Kembali dan klik "Sudah Daftar" untuk whitelist',
                  color: '#FF9500',
                },
              ].map((s) => (
                <div key={s.num} className="step-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                    background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, color: '#fff',
                    boxShadow: `0 2px 8px ${s.color}30`,
                    marginTop: 1,
                  }}>{s.num}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#1c1c1e', lineHeight: 1.3, marginBottom: 2, letterSpacing: '-0.2px' }}>
                      {s.title}
                    </div>
                    <div style={{ fontSize: 13, color: '#8e8e93', lineHeight: 1.4, fontWeight: 400 }}>
                      {s.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Card */}
          <div style={{
            background: '#ffffff',
            borderRadius: 20,
            padding: '16px 16px 16px',
            boxShadow: '0 2px 16px rgba(0,0,0,0.06), 0 0 0 0.5px rgba(0,0,0,0.03)',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {isWeb ? (
              <a
                href={registrationUrl ?? DEFAULT_REGISTRATION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rl-btn-primary"
                style={{
                  width: '100%', height: 50, borderRadius: 14,
                  background: '#007aff', color: '#fff',
                  border: 'none',
                  fontSize: 16, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 2px 12px rgba(0,122,255,0.22)',
                  fontFamily: 'inherit', textDecoration: 'none',
                  letterSpacing: '-0.2px',
                  boxSizing: 'border-box',
                }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Buka Halaman Pendaftaran
              </a>
            ) : (
              <button
                className="rl-btn-primary"
                onClick={onOpenWebView}
                style={{
                  width: '100%', height: 50, borderRadius: 14,
                  background: '#007aff', color: '#fff', border: 'none',
                  fontSize: 16, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 2px 12px rgba(0,122,255,0.22)',
                  fontFamily: 'inherit', letterSpacing: '-0.2px',
                }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                Mulai Registrasi
              </button>
            )}

            <button
              className="rl-btn-outline"
              onClick={isWeb ? onShowWebModal : onAlreadyRegistered}
              style={{
                width: '100%', height: 44, borderRadius: 14,
                background: 'transparent',
                color: '#34C759',
                border: '1.5px solid rgba(52,199,89,0.25)',
                fontSize: 15, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontFamily: 'inherit', letterSpacing: '-0.2px',
              }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              Saya Sudah Daftar
            </button>
          </div>

          {/* Footer */}
          <p style={{
            textAlign: 'center',
            marginTop: 20,
            fontSize: 14,
            color: '#8e8e93',
            fontWeight: 400,
            letterSpacing: '-0.1px',
          }}>
            Sudah punya akun?{' '}
            <button onClick={onGoLogin} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#007aff', fontWeight: 600, fontSize: 'inherit',
              fontFamily: 'inherit', padding: 0, letterSpacing: '-0.2px',
            }}>Masuk</button>
          </p>
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RegisterPage() {
  const router = useRouter();

  const [mounted,       setMounted]       = useState(false);
  const [phase, setPhase] = useState<'init' | 'webview' | 'landing' | 'success' | 'saving' | 'error' | 'token_detected'>('init');
  const [savingMessage, setSavingMessage] = useState('Mohon tunggu sebentar...');
  const [saveError,     setSaveError]     = useState<string | null>(null);
  const [isUserBlocked, setIsUserBlocked] = useState(false);
  const [capturedEmail, setCapturedEmail] = useState('');
  const [showWebModal,  setShowWebModal]  = useState(false);
  const [isWeb,         setIsWeb]         = useState(false);

  const registrationUrl = useRef(DEFAULT_REGISTRATION_URL);
  const whatsappUrl     = useRef(DEFAULT_WHATSAPP_URL);
  const capturedToken   = useRef('');
  const capturedDevice  = useRef('');

  // ✅ Ref guard agar tidak double-check jika event datang dua kali berturutan
  const isCheckingRef = useRef(false);

  const handleTokenDetected = useCallback(async (token: string, deviceId: string, url: string) => {
    if (!token || isCheckingRef.current) return;
    if (phase === 'token_detected' || phase === 'success' || phase === 'saving') return;

    console.log('[Register] Token detected, memeriksa riwayat trading:', url);
    isCheckingRef.current = true;
    capturedToken.current = token;
    capturedDevice.current = deviceId || await getOrCreateDeviceId();

    // ✅ PERUBAHAN UTAMA: Cek riwayat trading SEBELUM tampilkan popup sukses
    // Popup sukses hanya muncul kalau akun benar-benar bersih (belum pernah trading)
    setPhase('saving');
    setSavingMessage('Memeriksa riwayat akun Stockity...');

    try {
      const hasTradingHistory = await checkHasTradingHistory(token, capturedDevice.current);

      if (hasTradingHistory) {
        // ❌ Ada riwayat trading — tolak pendaftaran langsung, tanpa popup sukses
        isCheckingRef.current = false;
        setIsUserBlocked(false);
        setSaveError(
          'Akun Stockity Anda sudah memiliki riwayat trading.\n\n' +
          'Pendaftaran StockAutoTrade hanya tersedia untuk akun Stockity baru. ' +
          'Jika Anda merasa ini keliru, silakan hubungi admin.'
        );
        setPhase('error');
        return;
      }

      // ✅ Bersih — fetch profile untuk email di popup sukses
      try {
        const userProfile = await fetchUserProfile(token, capturedDevice.current);
        setCapturedEmail(userProfile.email);
      } catch { /* email kosong tidak masalah, popup tetap muncul */ }

      isCheckingRef.current = false;
      setPhase('token_detected');
    } catch (e) {
      // Jika cek history gagal (network error), lanjut ke popup — jangan blokir user
      console.warn('[Register] Cek history gagal, lanjut ke popup:', e);
      isCheckingRef.current = false;
      setPhase('token_detected');
    }
  }, [phase]);

  // ── FIX 2: Parameter fromLanding agar landing tidak hilang saat WebView dibuka
  // Kalau dipanggil dari landing (user klik tombol), jangan ubah phase ke 'webview'
  // sehingga landing tetap tampil di belakang WebView — tidak ada kedip/flash.
  const openRegistration = useCallback(async (fromLanding = false) => {
    // Hanya sembunyikan UI (phase='webview') saat pertama kali load (bukan dari landing)
    if (!fromLanding) {
      setPhase('webview');
    }

    try {
      const result = await stcWebView.open({ url: registrationUrl.current });
      await stcWebView.close().catch(() => {});

      if (result.success && result.authToken) {
        await handleTokenDetected(result.authToken, result.deviceId, result.url);
        return;
      }

      if (capturedToken.current) {
        // ✅ PERUBAHAN: Kalau isCheckingRef aktif, berarti handleTokenDetected sedang
        // jalan (dipicu oleh event listener) — jangan override phase 'saving' dengan
        // 'token_detected' langsung, atau nanti popup sukses muncul tanpa cek history.
        if (!isCheckingRef.current) {
          handleTokenDetected(capturedToken.current, capturedDevice.current, '');
        }
        return;
      }

      setPhase('landing');
    } catch (err) {
      console.error('[Register] openRegistration error:', err);
      await stcWebView.close().catch(() => {});
      if (capturedToken.current && !isCheckingRef.current) {
        handleTokenDetected(capturedToken.current, capturedDevice.current, '');
      } else if (!capturedToken.current) {
        setPhase('landing');
      }
    }
  }, [handleTokenDetected]);

  useEffect(() => {
    setMounted(true);
    const init = async () => {
      const token = await storage.get('stc_token');
      if (token) { router.replace('/dashboard'); return; }

      try {
        const cfg = await getRegistrationConfig();
        registrationUrl.current = cfg.registrationUrl;
        whatsappUrl.current     = cfg.whatsappHelpUrl;
      } catch {
        // pakai default
      }

      if (!isNativeApp()) {
        setIsWeb(true);
        setPhase('landing');
        return;
      }

      // Pertama kali load (bukan dari landing) — sembunyikan UI, buka WebView langsung
      openRegistration(false);
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail ?? {};
      const { authToken, deviceId, url } = detail;

      if (authToken) {
        // ✅ PERUBAHAN: Panggil handleTokenDetected (bukan langsung setPhase)
        // agar cek riwayat trading Stockity dilakukan sebelum popup sukses muncul.
        // Dulu: langsung setPhase('token_detected') → popup sukses tanpa cek history.
        // Sekarang: handleTokenDetected → cek history → jika bersih → popup sukses.
        handleTokenDetected(authToken, deviceId ?? '', url ?? '');
      }
    };

    window.addEventListener('stc:register:success', handler);
    window.addEventListener('stc:register:data', handler);

    return () => {
      window.removeEventListener('stc:register:success', handler);
      window.removeEventListener('stc:register:data', handler);
    };
  }, [handleTokenDetected]); // ← handleTokenDetected masuk dependency

  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail ?? {};
      if (detail.daftarClicked) {
        console.log('[Register] Daftar button clicked via auto-inject');
        setTimeout(async () => {
          // ✅ PERUBAHAN: Tetap lewat handleTokenDetected agar cek history tidak di-skip
          if (capturedToken.current && phase !== 'token_detected' && phase !== 'saving') {
            handleTokenDetected(capturedToken.current, capturedDevice.current, '');
          }
        }, 2000);
      }
    };

    window.addEventListener('stc:register:daftarClicked', handler);
    return () => window.removeEventListener('stc:register:daftarClicked', handler);
  }, [phase, handleTokenDetected]);

  const handleLoginClick = async () => {
    const token    = capturedToken.current;
    const deviceId = capturedDevice.current || await getOrCreateDeviceId();

    if (!token) {
      router.push('/login');
      return;
    }

    setPhase('saving');
    setSavingMessage('Memverifikasi akun Stockity...');

    try {
      setSavingMessage('Memeriksa akses whitelist…');
      const result = await saveUserToWhitelistAndLogin(token, deviceId);

      if (!result.success) {
        setIsUserBlocked(result.isBlocked ?? false);
        setSaveError(result.error ?? 'Gagal memproses akun.');
        setPhase('error');
        return;
      }

      if (result.email) {
        await storage.set('stc_remember_email', result.email);
        setCapturedEmail(result.email);
      }

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('stc_register_success', '1');
        if (result.email) {
          sessionStorage.setItem('stc_register_email', result.email);
        }
      }

      setSavingMessage('Mengarahkan ke halaman login…');
      await new Promise(r => setTimeout(r, 500));
      router.replace('/login');

    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Gagal memproses akun. Silakan coba lagi.');
      setPhase('error');
    }
  };

  if (!mounted) return null;
  // ── FIX 2: 'webview' sekarang tetap render landing (bukan null) ──────────────
  // Phase 'init' tetap null (belum ada UI), tapi 'webview' tampilkan landing
  // agar saat user klik "Mulai Registrasi" dari landing, tidak ada kedip.
  if (phase === 'init') return null;

  return (
    <>
      {/* Landing tampil juga saat phase='webview' (WebView overlay di atas) */}
      {(phase === 'landing' || phase === 'webview') && (
        <RegisterLanding
          onOpenWebView={() => openRegistration(true)}  
          onAlreadyRegistered={() => router.push('/login')}
          onGoLogin={() => router.push('/login')}
          isWeb={isWeb}
          onShowWebModal={() => setShowWebModal(true)}
          registrationUrl={registrationUrl.current}
        />
      )}

      {showWebModal && (
        <WebRegisterModal
          registrationUrl={registrationUrl.current}
          onClose={() => setShowWebModal(false)}
          onSuccess={(email) => {
            setShowWebModal(false);
            setCapturedEmail(email);
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('stc_register_success', '1');
              sessionStorage.setItem('stc_register_email', email);
            }
            router.replace('/login');
          }}
        />
      )}

      {/* Popup sukses — tombol "Lanjut Trading" sudah dihapus dari ModernSuccessDialog */}
      {(phase === 'success' || phase === 'token_detected') && (
        <ModernSuccessDialog
          email={capturedEmail}
          onLoginClick={handleLoginClick}
        />
      )}

      {phase === 'saving' && <SavingDialog message={savingMessage} />}

      {phase === 'error' && saveError && (
        <ErrorDialog
          message={saveError}
          isBlocked={isUserBlocked}
          onContactAdmin={() => {
            window.open(whatsappUrl.current, '_blank', 'noopener,noreferrer');
            setSaveError(null);
            setPhase('landing');
          }}
          onBack={() => {
            setSaveError(null);
            setPhase('landing');
          }}
        />
      )}
    </>
  );
}