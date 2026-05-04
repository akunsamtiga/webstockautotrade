'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  storage,
  saveUserSession,
  saveCurrencyWithIso,
} from '@/lib/storage';
import {
  fetchUserProfile,
  fetchUserCurrency,
  getFullName,
} from '@/lib/userProfileApi';
import {
  getWhitelistUserByEmail,
  getWhitelistUserByUserId,
  updateLastLogin,
  addWhitelistUser,
  getRegistrationConfig,
} from '@/lib/firebaseRepository';
import { stcWebView } from '@/plugins/StcWebViewPlugin';

const DEFAULT_REGISTRATION_URL = 'https://stockity.id/registered?a=25db72fbbc00';
const DEFAULT_WHATSAPP_URL     = 'https://wa.me/6285959860015';

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
        error: 'Akun kamu belum aktif. Silahkan hubungi admin untuk aktivasi STC Autotrade.',
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
        error: 'Akun Anda saat ini belum terhubung ke sistem STC AutoTrade. Hubungi admin untuk proses aktivasi.',
      };
    await updateLastLogin(byUserId.userId);
    return { success: true, userId: byUserId.userId, email: userProfile.email };
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
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "-apple-system,'SF Pro Display',BlinkMacSystemFont,sans-serif",
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: 32,
        width: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
        boxShadow: '0 16px 48px rgba(0,0,0,0.20)',
      }}>
        <style>{`@keyframes sv-spin { to { transform:rotate(360deg); } }`}</style>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          border: '4px solid rgba(66,133,244,0.15)', borderTopColor: '#4285F4',
          animation: 'sv-spin 0.7s linear infinite',
        }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#202124', marginBottom: 8 }}>Menghubungkan</div>
          <div style={{ fontSize: 14, color: '#5F6368' }}>{message}</div>
        </div>
      </div>
    </div>
  );
}

function ModernSuccessDialog({
  email,
  onLoginClick,
  onContinueClick,
}: {
  email: string;
  onLoginClick: () => void;
  onContinueClick: () => void;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setTimeout(() => setVisible(true), 100); }, []);

  return (
    <>
      <style>{`
        @keyframes msd-scale { from{opacity:0;transform:scale(0.8)} to{opacity:1;transform:scale(1)} }
        @keyframes icon-pulse-scale { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }
        @keyframes icon-pulse-rot   { 0%,100%{transform:rotate(-5deg)} 50%{transform:rotate(5deg)} }
      `}</style>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: `rgba(0,0,0,${visible ? 0.6 : 0})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 20px', transition: 'background 0.4s ease',
        fontFamily: "-apple-system,'SF Pro Display',BlinkMacSystemFont,sans-serif",
        WebkitFontSmoothing: 'antialiased',
      }}>
        <div style={{
          background: '#fff', borderRadius: 32, padding: 32,
          width: '100%', maxWidth: 360,
          animation: visible ? 'msd-scale 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards' : 'none',
          boxShadow: '0 24px 64px rgba(0,0,0,0.24)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <div style={{ width: 120, height: 120, position: 'relative', marginBottom: 24 }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(52,168,83,0.20) 0%, rgba(52,168,83,0.05) 50%, transparent 70%)',
              animation: 'icon-pulse-scale 1s ease-in-out infinite, icon-pulse-rot 2s ease-in-out infinite',
            }} />
            <div style={{
              position: 'absolute', top: 25, left: 25, right: 25, bottom: 25,
              borderRadius: '50%', background: '#34A853',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(52,168,83,0.40)',
            }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#202124', letterSpacing: -0.5, marginBottom: 12 }}>Selamat! 🎉</div>
          <div style={{ fontSize: 20, fontWeight: 500, color: '#34A853', marginBottom: 16 }}>Registrasi Berhasil</div>
          <div style={{ fontSize: 15, color: '#5F6368', textAlign: 'center', lineHeight: '22px', marginBottom: 8 }}>
            Akun Stockity Anda telah berhasil didaftarkan.
          </div>
          {email ? (
            <div style={{
              marginBottom: 24, padding: '8px 16px', borderRadius: 12,
              background: 'rgba(66,133,244,0.07)', border: '1px solid rgba(66,133,244,0.18)',
              width: '100%', textAlign: 'center',
            }}>
              <p style={{ fontSize: 11, color: '#5F6368', marginBottom: 2 }}>Login dengan email</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#202124', wordBreak: 'break-all' }}>{email}</p>
            </div>
          ) : (
            <div style={{ marginBottom: 24 }} />
          )}
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* ✅ FIX: "Login STC Autotrade" → ke halaman login (/login) */}
            <button onClick={onLoginClick} style={{
              width: '100%', height: 56, borderRadius: 16,
              background: '#4285F4', color: '#fff', border: 'none',
              fontSize: 16, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              boxShadow: '0 4px 12px rgba(66,133,244,0.35)', fontFamily: 'inherit',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              Login ke STC AutoTrade
            </button>
            {/* ✅ FIX: "Lanjut Trading" → buka Stockity di WebView untuk mulai trading */}
            <button onClick={onContinueClick} style={{
              width: '100%', height: 56, borderRadius: 16,
              background: 'transparent', color: '#4285F4',
              border: '1.5px solid rgba(66,133,244,0.30)',
              fontSize: 16, fontWeight: 500, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              fontFamily: 'inherit',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
              </svg>
              Lanjut Trading di Stockity
            </button>
          </div>
          <div style={{ marginTop: 16, fontSize: 12, color: '#9AA0A6', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Masukkan password Stockity saat login
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
      position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.60)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px',
      fontFamily: "-apple-system,'SF Pro Display',BlinkMacSystemFont,sans-serif",
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: 28,
        width: '100%', maxWidth: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.20)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EA4335" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#202124' }}>{isBlocked ? 'Akun Diblokir' : 'Proses Gagal'}</span>
        </div>
        <p style={{ fontSize: 14, color: '#5F6368', lineHeight: '20px', marginBottom: 24, whiteSpace: 'pre-line' }}>{message}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onBack} style={{
            flex: 1, height: 44, borderRadius: 12,
            background: 'transparent', color: '#5F6368',
            border: '1px solid rgba(0,0,0,0.15)', fontSize: 14,
            fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
          }}>Kembali</button>
          <button onClick={onContactAdmin} style={{
            flex: 1, height: 44, borderRadius: 12,
            background: '#34A853', color: '#fff', border: 'none',
            fontSize: 14, fontWeight: 500, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit',
          }}>
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

// ─── Register Landing UI ──────────────────────────────────────────────────────

function RegisterLanding({
  onOpenWebView,
  onAlreadyRegistered,
  onGoLogin,
}: {
  onOpenWebView: () => void;
  onAlreadyRegistered: () => void;
  onGoLogin: () => void;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setTimeout(() => setVisible(true), 80); }, []);

  return (
    <>
      <style>{`
        @keyframes rl-rise { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes rl-orb  { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(4%,3%) scale(1.04)} }
        .rl-btn-primary:active { transform:scale(0.97) !important; }
        .rl-btn-outline:active { transform:scale(0.97) !important; }
      `}</style>
      <div style={{
        position: 'fixed', inset: 0,
        background: '#f2f2f7',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px 20px',
        fontFamily: "-apple-system,'SF Pro Display',BlinkMacSystemFont,'Helvetica Neue',sans-serif",
        WebkitFontSmoothing: 'antialiased',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'fixed', width: 360, height: 360, borderRadius: '50%',
          background: 'radial-gradient(circle,rgba(0,122,255,0.10) 0%,transparent 70%)',
          top: '-15%', right: '-10%', filter: 'blur(60px)',
          animation: 'rl-orb 18s ease-in-out infinite alternate', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'fixed', width: 280, height: 280, borderRadius: '50%',
          background: 'radial-gradient(circle,rgba(52,168,83,0.08) 0%,transparent 70%)',
          bottom: '-10%', left: '-8%', filter: 'blur(50px)',
          animation: 'rl-orb 22s ease-in-out infinite alternate-reverse', pointerEvents: 'none',
        }} />

        <div style={{
          position: 'relative', zIndex: 2,
          width: '100%', maxWidth: 360,
          opacity: visible ? 1 : 0,
          animation: visible ? 'rl-rise 0.55s cubic-bezier(0.22,1,0.36,1) forwards' : 'none',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{
              width: 80, height: 80, borderRadius: 22, margin: '0 auto 16px',
              background: 'linear-gradient(135deg,#007aff 0%,#34A853 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 28px rgba(0,122,255,0.28)',
            }}>
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none"
                stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                <polyline points="16 7 22 7 22 13"/>
              </svg>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.7, color: '#1c1c1e', margin: '0 0 6px' }}>
              STC AutoTrade
            </h1>
            <p style={{ fontSize: 14, color: '#6e6e73', lineHeight: 1.5, margin: 0 }}>
              Daftarkan akun Stockity Anda untuk mulai menggunakan bot trading otomatis
            </p>
          </div>

          <div style={{
            background: 'rgba(255,255,255,0.85)',
            border: '1px solid rgba(60,60,67,0.10)',
            borderRadius: 24,
            padding: '22px 20px',
            backdropFilter: 'saturate(180%) blur(30px)',
            WebkitBackdropFilter: 'saturate(180%) blur(30px)',
            boxShadow: '0 8px 36px rgba(0,0,0,0.09)',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 6 }}>
              {[
                { num: '1', text: 'Buka halaman pendaftaran Stockity', color: '#007aff' },
                { num: '2', text: 'Isi data dan selesaikan registrasi', color: '#34A853' },
                { num: '3', text: 'Kembali ke sini dan klik "Sudah Daftar"', color: '#FF9F0A' },
              ].map(s => (
                <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                    background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: '#fff',
                    boxShadow: `0 2px 8px ${s.color}40`,
                  }}>{s.num}</div>
                  <span style={{ fontSize: 13, color: '#3c3c43', lineHeight: 1.4 }}>{s.text}</span>
                </div>
              ))}
            </div>

            <button
              className="rl-btn-primary"
              onClick={onOpenWebView}
              style={{
                width: '100%', height: 50, borderRadius: 14,
                background: '#007aff', color: '#fff', border: 'none',
                fontSize: 16, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: '0 3px 14px rgba(0,122,255,0.32)',
                fontFamily: 'inherit', transition: 'transform 0.1s, opacity 0.15s',
              }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Mulai Registrasi
            </button>

            <button
              className="rl-btn-outline"
              onClick={onAlreadyRegistered}
              style={{
                width: '100%', height: 46, borderRadius: 14,
                background: 'rgba(52,168,83,0.08)',
                color: '#34A853',
                border: '1.5px solid rgba(52,168,83,0.28)',
                fontSize: 15, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                fontFamily: 'inherit', transition: 'transform 0.1s',
              }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              Saya Sudah Daftar
            </button>
          </div>

          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13.5, color: '#6e6e73' }}>
            Sudah punya akun?{' '}
            <button onClick={onGoLogin} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#007aff', fontWeight: 600, fontSize: 'inherit',
              fontFamily: 'inherit', padding: 0,
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

  const [mounted,           setMounted]           = useState(false);
  const [phase, setPhase] = useState<'init' | 'webview' | 'landing' | 'success' | 'saving' | 'error'>('init');
  const [savingMessage, setSavingMessage] = useState('Mohon tunggu sebentar...');
  const [saveError,     setSaveError]     = useState<string | null>(null);
  const [isUserBlocked, setIsUserBlocked] = useState(false);
  // ✅ FIX: simpan email untuk pre-fill di halaman login
  const [capturedEmail, setCapturedEmail] = useState('');

  const registrationUrl = useRef(DEFAULT_REGISTRATION_URL);
  const whatsappUrl     = useRef(DEFAULT_WHATSAPP_URL);
  const capturedToken   = useRef('');
  const capturedDevice  = useRef('');

  // ── openRegistration ──────────────────────────────────────────────────────
  const openRegistration = useCallback(async () => {
    setPhase('webview');
    try {
      const result = await stcWebView.open({ url: registrationUrl.current });

      // ✅ FIX: Tutup WebView native. Dengan fix Java, close() baru resolve
      // SETELAH dismiss selesai — jadi saat setPhase('success') jalan,
      // native Dialog sudah pasti tidak ada di layar.
      await stcWebView.close().catch(() => {});

      if (result.success) {
        capturedToken.current  = result.authToken  || '';
        capturedDevice.current = result.deviceId   || await getOrCreateDeviceId();
        setPhase('success');
      } else {
        // User menekan tombol back / menutup WebView tanpa registrasi selesai
        setPhase('landing');
      }
    } catch (err) {
      console.error('[Register] openRegistration error:', err);
      await stcWebView.close().catch(() => {});
      setPhase('landing');
    }
  }, []);

  // ── init ──────────────────────────────────────────────────────────────────
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

      openRegistration();
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Custom event listener ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { authToken, deviceId } = (e as CustomEvent).detail ?? {};
      if (authToken) capturedToken.current  = authToken;
      if (deviceId)  capturedDevice.current = deviceId;
      // ✅ FIX: Tutup WebView juga saat menerima event custom
      stcWebView.close().catch(() => {});
      setPhase('success');
    };
    window.addEventListener('stc:register:success', handler);
    window.addEventListener('stc:register:data',    handler);
    return () => {
      window.removeEventListener('stc:register:success', handler);
      window.removeEventListener('stc:register:data',    handler);
    };
  }, []);

  // ── handleLoginClick ──────────────────────────────────────────────────────
  // ✅ FIX 2: Backend NestJS memakai JWT-nya sendiri (dari /auth/login),
  // BUKAN Stockity token langsung. Maka setelah whitelist save, kita
  // simpan email untuk pre-fill dan arahkan ke halaman login biasa.
  // User tinggal masukkan password Stockity mereka → backend login normal.
  const handleLoginClick = async () => {
    const token    = capturedToken.current;
    const deviceId = capturedDevice.current || await getOrCreateDeviceId();

    if (!token) {
      // Tidak ada token dari cookie → langsung ke login manual
      router.push('/login');
      return;
    }

    setPhase('saving');
    setSavingMessage('Memverifikasi akun Stockity...');

    try {
      setSavingMessage('Memeriksa akses whitelist...');
      const result = await saveUserToWhitelistAndLogin(token, deviceId);

      if (!result.success) {
        setIsUserBlocked(result.isBlocked ?? false);
        setSaveError(result.error ?? 'Gagal memproses akun.');
        setPhase('error');
        return;
      }

      // ✅ FIX: Simpan email ke stc_remember_email agar pre-filled di halaman login.
      // Jangan simpan Stockity token sebagai stc_token karena backend butuh JWT-nya sendiri.
      if (result.email) {
        await storage.set('stc_remember_email', result.email);
        setCapturedEmail(result.email);
      }

      // Arahkan ke halaman login — user masukkan password untuk mendapatkan backend JWT
      setSavingMessage('Mengarahkan ke halaman login...');
      await new Promise(r => setTimeout(r, 600)); // beri waktu agar saving dialog terlihat
      router.replace('/login');

    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Gagal memproses akun. Silakan coba lagi.');
      setPhase('error');
    }
  };

  // ── handleContinueClick ───────────────────────────────────────────────────
  // "Lanjut Trading di Stockity" → buka WebView ke platform trading Stockity
  const handleContinueClick = () => {
    // Buka Stockity trading platform langsung
    const stockityTradeUrl = 'https://stockity.id/trade';
    stcWebView.open({ url: stockityTradeUrl }).catch(() => {
      window.open(stockityTradeUrl, '_blank', 'noopener,noreferrer');
    });
    // Tetap di halaman success; user bisa klik "Login" saat kembali
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (!mounted) return null;

  if (phase === 'init' || phase === 'webview') return null;

  return (
    <>
      {phase === 'landing' && (
        <RegisterLanding
          onOpenWebView={openRegistration}
          onAlreadyRegistered={() => router.push('/login')}
          onGoLogin={() => router.push('/login')}
        />
      )}

      {phase === 'success' && (
        <ModernSuccessDialog
          email={capturedEmail}
          onLoginClick={handleLoginClick}
          onContinueClick={handleContinueClick}
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
