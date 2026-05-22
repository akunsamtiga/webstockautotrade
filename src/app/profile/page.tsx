'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api, type ProfileBalance } from '@/lib/api';
import { resolveAvatarUrl } from '@/lib/userProfileApi';
import { storage, isSessionValid, sessionLogout, getAuthToken } from '@/lib/storage';
import { checkIsAdmin, checkIsSuperAdmin } from '@/lib/supabaseRepository';
import { LanguageProvider, useLanguage, formatCurrency, formatDate, Language } from '@/lib';
import { LanguageSheet } from '@/components/LanguageSelector';
import { useDarkMode } from '@/lib/DarkModeContext';
import { AppUpdateCard } from '@/components/AppUpdateCard';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
interface UserProfileData {
  id: number;
  email: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  phone?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  gender?: string;
  country?: string;
  birthday?: string;
  registeredAt?: string;
  registrationCountryIso?: string;
  avatar?: string;
  personalDataLocked?: boolean;
  docsVerified?: boolean;
}
interface CurrencyOption { iso: string; name?: string; symbol?: string; }

// ─────────────────────────────────────────────
// SKELETON
// ─────────────────────────────────────────────
const Skel: React.FC<{ w?: number | string; h?: number; r?: number; dark?: boolean }> = ({
  w = '100%', h = 16, r = 6, dark = false,
}) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(60,60,67,0.08)',
    animation: 'skel-pulse 1.6s ease-in-out infinite',
  }} />
);

// ─────────────────────────────────────────────
// CURRENCY SHEET
// ─────────────────────────────────────────────
const CurrencySheet: React.FC<{
  open: boolean; onClose: () => void;
  currencies: CurrencyOption[]; current: string;
  onSelect: (iso: string) => Promise<void>; loading: boolean;
  dark?: boolean;
}> = ({ open, onClose, currencies, current, onSelect, loading, dark = false }) => {
  const { t } = useLanguage();
  const [q, setQ] = useState('');
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const originalOverflow    = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;
      document.body.style.overflow    = 'hidden';
      document.body.style.touchAction = 'none';
      return () => {
        document.body.style.overflow    = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    }
  }, [open]);

  useEffect(() => {
    if (open) { setQ(''); setTimeout(() => inputRef.current?.focus(), 300); }
  }, [open]);
  if (!open) return null;

  const sheetBg  = dark ? '#1c1c1e' : '#f2f2f7';
  const listBg   = dark ? '#2c2c2e' : '#ffffff';
  const textPrim = dark ? '#ffffff' : '#1c1c1e';
  const textSec  = dark ? 'rgba(235,235,245,0.4)' : '#6e6e73';
  const sepColor = dark ? 'rgba(84,84,88,0.4)' : 'rgba(60,60,67,0.08)';
  const inputBg  = dark ? 'rgba(255,255,255,0.10)' : 'rgba(116,116,128,0.12)';
  const inputTxt = dark ? '#ffffff' : '#1c1c1e';
  const hdrBorder= dark ? 'rgba(84,84,88,0.5)' : 'rgba(60,60,67,0.14)';
  const closeBg  = dark ? 'rgba(255,255,255,0.12)' : 'rgba(116,116,128,0.12)';
  const closeTxt = dark ? 'rgba(235,235,245,0.6)' : '#3c3c43';

  const filtered = q.trim()
    ? currencies.filter(c => c.iso.toLowerCase().includes(q.toLowerCase()) || (c.name || '').toLowerCase().includes(q.toLowerCase()))
    : currencies;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, touchAction: 'none' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', animation: 'bd-in 0.25s ease' }} />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 400, maxHeight: '70dvh', display: 'flex', flexDirection: 'column', background: sheetBg, borderRadius: 20, boxShadow: dark ? '0 24px 64px rgba(0,0,0,0.6)' : '0 24px 64px rgba(0,0,0,0.22)', animation: 'pop-in 0.28s cubic-bezier(0.32,0.72,0,1)', overflow: 'hidden' }}>
        <div style={{ flexShrink: 0, padding: '16px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `0.5px solid ${hdrBorder}` }}>
          <span style={{ fontSize: 17, fontWeight: 600, color: textPrim, letterSpacing: -0.4 }}>{t('profile.selectCurrency')}</span>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', background: closeBg, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: closeTxt, WebkitTapHighlightColor: 'transparent' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div style={{ flexShrink: 0, padding: '10px 16px' }}>
          <div style={{ position: 'relative' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={dark ? 'rgba(235,235,245,0.3)' : 'rgba(60,60,67,0.4)'} strokeWidth="2.2" strokeLinecap="round" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder={t('common.search')}
              style={{ width: '100%', padding: '8px 10px 8px 34px', borderRadius: 10, background: inputBg, border: 'none', outline: 'none', fontSize: 15, color: inputTxt, fontFamily: 'inherit' }} />
          </div>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, background: listBg, overscrollBehaviorY: 'contain', WebkitOverflowScrolling: 'touch' }}>
          {filtered.length === 0
            ? <div style={{ padding: '48px 0', textAlign: 'center', color: textSec, fontSize: 14 }}>{t('common.notFound')}</div>
            : filtered.map((c, i) => {
                const sel = c.iso === current;
                return (
                  <button key={c.iso} onClick={() => onSelect(c.iso).then(onClose)} disabled={loading}
                    style={{ width: '100%', background: 'transparent', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', padding: '13px 20px', borderBottom: i < filtered.length - 1 ? `1px solid ${sepColor}` : 'none', gap: 14, opacity: loading ? 0.6 : 1, WebkitTapHighlightColor: 'transparent' }}>
                    <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                      <p style={{ fontSize: 16, color: textPrim, fontWeight: sel ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.iso}</p>
                      {c.name && <p style={{ fontSize: 13, color: textSec, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>}
                    </div>
                    {c.symbol && <span style={{ fontSize: 14, color: textSec, flexShrink: 0 }}>{c.symbol}</span>}
                    {sel && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#007aff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M20 6L9 17l-5-5"/></svg>}
                  </button>
                );
              })}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// LOGOUT CONFIRM
// ─────────────────────────────────────────────
const LogoutAlert: React.FC<{ open: boolean; onCancel: () => void; onConfirm: () => void; dark?: boolean }> = ({
  open, onCancel, onConfirm, dark = false,
}) => {
  const { t } = useLanguage();

  useEffect(() => {
    if (open) {
      const originalOverflow    = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;
      document.body.style.overflow    = 'hidden';
      document.body.style.touchAction = 'none';
      return () => {
        document.body.style.overflow    = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    }
  }, [open]);

  if (!open) return null;
  const alertBg  = dark ? 'rgba(44,44,46,0.96)' : 'rgba(255,255,255,0.96)';
  const textPrim = dark ? '#ffffff' : '#1c1c1e';
  const textSec  = dark ? 'rgba(235,235,245,0.5)' : '#6e6e73';
  const divider  = dark ? 'rgba(84,84,88,0.4)' : 'rgba(60,60,67,0.10)';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px', touchAction: 'none' }}>
      <div onClick={onCancel} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', animation: 'bd-in 0.2s ease' }} />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 320, animation: 'pop-in 0.28s cubic-bezier(0.32,0.72,0,1)' }}>
        <div style={{ background: alertBg, backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', borderRadius: 16, overflow: 'hidden', boxShadow: dark ? '0 20px 60px rgba(0,0,0,0.6)' : '0 20px 60px rgba(0,0,0,0.22)' }}>
          <div style={{ padding: '24px 20px 16px', textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,59,48,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ff3b30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </div>
            <p style={{ fontSize: 17, fontWeight: 600, color: textPrim, marginBottom: 6, letterSpacing: -0.3 }}>{t('profile.logoutConfirm')}</p>
            <p style={{ fontSize: 14, color: textSec, lineHeight: 1.5 }}>{t('profile.logoutMessage')}</p>
          </div>
          <div style={{ borderTop: `1px solid ${divider}`, display: 'flex' }}>
            <button onClick={onCancel} style={{ flex: 1, padding: '16px', background: 'transparent', border: 'none', borderRight: `1px solid ${divider}`, cursor: 'pointer', fontSize: 17, fontWeight: 600, color: '#007aff', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>{t('common.cancel')}</button>
            <button onClick={onConfirm} style={{ flex: 1, padding: '16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 17, fontWeight: 400, color: '#ff3b30', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>{t('profile.logout')}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// MAIN PAGE CONTENT
// ─────────────────────────────────────────────
function ProfilePageContent() {
  const router = useRouter();
  const { t, language, formatNumber: fmtNum } = useLanguage();
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const [isLoading, setIsLoading]             = useState(true);
  const [profile, setProfile]                 = useState<UserProfileData | null>(null);
  const [balance, setBalance]                 = useState<ProfileBalance | null>(null);
  const [currencies, setCurrencies]           = useState<CurrencyOption[]>([]);
  const [sheetOpen, setSheetOpen]             = useState(false);
  const [langSheetOpen, setLangSheetOpen]     = useState(false);
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [showLogout, setShowLogout]           = useState(false);
  const [logoutSplash, setLogoutSplash]       = useState(false);
  const [copied, setCopied]                   = useState(false);
  const [isAdminUser,      setIsAdminUser]      = useState(false);
  const [isSuperAdminUser, setIsSuperAdminUser] = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const [refreshing, setRefreshing]           = useState(false);

  // ── Dark Mode Theme ──────────────────────────────────────────────────────────
  const D = isDarkMode;
  const th = {
    pageBg:        D ? '#000000'                        : '#f2f2f7',
    cardBg:        D ? '#1c1c1e'                        : '#ffffff',
    sidebarBg:     D ? 'rgba(22,22,24,0.80)'            : 'rgba(228,228,235,0.55)',
    sidebarBorder: D ? 'rgba(255,255,255,0.08)'         : 'rgba(60,60,67,0.11)',
    headerBg:      D ? 'rgba(28,28,30,0.94)'            : 'rgba(242,242,247,0.92)',
    textPrimary:   D ? '#ffffff'                        : '#1c1c1e',
    textSecondary: D ? 'rgba(235,235,245,0.60)'         : '#3c3c43',
    textTertiary:  D ? 'rgba(235,235,245,0.40)'         : '#6e6e73',
    textQuaternary:D ? 'rgba(235,235,245,0.25)'         : '#8e8e93',
    textFaint:     D ? 'rgba(235,235,245,0.18)'         : '#aeaeb2',
    textPlaceholder:D? 'rgba(235,235,245,0.12)'         : '#c7c7cc',
    separator:     D ? 'rgba(84,84,88,0.40)'            : 'rgba(60,60,67,0.07)',
    border:        D ? 'rgba(84,84,88,0.55)'            : 'rgba(60,60,67,0.14)',
    btnBg:         D ? 'rgba(255,255,255,0.08)'         : 'rgba(0,0,0,0.05)',
    inputBg:       D ? 'rgba(255,255,255,0.10)'         : 'rgba(116,116,128,0.12)',
    cardShadow:    D
      ? '0 1px 0 rgba(255,255,255,0.04), 0 2px 12px rgba(0,0,0,0.35)'
      : '0 1px 0 rgba(0,0,0,0.04), 0 2px 12px rgba(0,0,0,0.04)',
    divider:       D ? 'rgba(84,84,88,0.40)'            : 'rgba(60,60,67,0.10)',
  };

  useEffect(() => {
    const init = async () => {
      const sessionValid = await isSessionValid();
      if (!sessionValid) { router.push('/login'); return; }
      loadProfile();

      try {
        const email = await storage.get('stc_email') ?? '';
        if (email) {
          const [adm, sup] = await Promise.all([checkIsAdmin(email), checkIsSuperAdmin(email)]);
          setIsAdminUser(adm || sup);
          setIsSuperAdminUser(sup);
        }
      } catch { /* ignore — non-critical */ }
    };
    init();
  }, []); // eslint-disable-line

  const loadProfile = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) { router.push('/login'); return; }
      const [prof, bal] = await Promise.all([api.getProfile(), api.balance().catch(() => null)]);
      setProfile(prof); setBalance(bal);

      fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/v1/profile/currencies`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()).then(data => {
        const list: any[] = Array.isArray(data) ? data : (data?.data ?? []);
        setCurrencies(list.map((c: any) => ({ iso: c.iso ?? c.currency_iso ?? c.code ?? c, name: c.name ?? c.currency_name ?? '', symbol: c.symbol ?? '' })));
      }).catch(() => {});
    } catch (err: any) {
      if (err?.status === 401) { router.push('/login'); return; }
      setError(t('profile.loadError'));
    } finally {
      setIsLoading(false); setRefreshing(false);
    }
  }, [router, t]);

  const handleUpdateCurrency = async (iso: string) => {
    setCurrencyLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) return;
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/v1/profile/currency`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currencyIso: iso }),
      });
      const bal = await api.balance().catch(() => null);
      if (bal) setBalance(bal);
    } finally { setCurrencyLoading(false); }
  };

  const handleLogout = async () => {
    setShowLogout(false);
    window.dispatchEvent(new CustomEvent('stc:hidenav'));
    setLogoutSplash(true);
    await new Promise(res => setTimeout(res, 1800));

    try {
      const { stcWebView } = await import('@/plugins/StcWebViewPlugin');
      await stcWebView.clearSession();
    } catch (e) {
      console.warn('[Logout] clearSession WebView error (non-fatal):', e);
    }

    await sessionLogout();

    const rememberEmail = localStorage.getItem('stc_remember_email');
    const rememberPass  = localStorage.getItem('stc_remember_password');
    localStorage.clear();
    if (rememberEmail) localStorage.setItem('stc_remember_email',    rememberEmail);
    if (rememberPass)  localStorage.setItem('stc_remember_password', rememberPass);
    sessionStorage.clear();

    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch { /* ignore */ }

    try {
      const dbs = await indexedDB.databases?.() ?? [];
      await Promise.all(dbs.map(db => db.name ? indexedDB.deleteDatabase(db.name) : Promise.resolve()));
    } catch { /* ignore */ }

    router.push('/login');
  };

  const copyId = () => {
    if (profile?.id) {
      navigator.clipboard.writeText(String(profile.id));
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }
  };

  const fmtBalance = (n?: number) => {
    if (n == null) return '0';
    const val = n / 100;
    const localeMap: Record<string, string> = { en: 'en-US', id: 'id-ID', ru: 'ru-RU', es: 'es-ES', ms: 'ms-MY', hi: 'hi-IN', th: 'th-TH', tr: 'tr-TR' };
    return val.toLocaleString(localeMap[language] ?? 'id-ID', { maximumFractionDigits: 0 });
  };

  const getInitials = () => {
    const f = profile?.firstName?.[0] || '';
    const l = profile?.lastName?.[0] || '';
    return (f + l).toUpperCase() || profile?.nickname?.[0]?.toUpperCase() || profile?.email?.[0]?.toUpperCase() || 'U';
  };

  const getDisplayName = () => {
    const f = profile?.firstName?.trim() || '';
    const l = profile?.lastName?.trim() || '';
    if (f && l) return `${f} ${l}`;
    return f || l || profile?.nickname?.trim() || profile?.email?.split('@')[0] || 'User';
  };

  const currency = balance?.currency || 'IDR';

  // ── Sub-components (theme-aware) ─────────────────────────────────────────────

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p style={{ fontSize: 11.5, fontWeight: 500, color: th.textTertiary, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 4px', marginBottom: 6 }}>{children}</p>
  );

  const Card = ({ children, mb }: { children: React.ReactNode; mb?: number }) => (
    <div style={{
      marginBottom: mb ?? 0,
      background: th.cardBg,
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: th.cardShadow,
      transition: 'background 0.3s ease',
    }}>
      {children}
    </div>
  );

  const InfoRow = ({ label, value, verified, last }: { label: string; value?: string | null; verified?: boolean; last?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', borderBottom: last ? 'none' : `1px solid ${th.separator}`, gap: 12 }}>
      <span style={{ fontSize: 14, color: th.textSecondary, flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {verified != null && (
          <span style={{ fontSize: 11, fontWeight: 600, color: verified ? '#34c759' : '#ff9500', background: verified ? 'rgba(52,199,89,0.12)' : 'rgba(255,149,0,0.12)', padding: '2px 7px', borderRadius: 99, flexShrink: 0 }}>
            {verified ? t('profile.verified') : t('profile.notVerified')}
          </span>
        )}
        <span style={{ fontSize: 14, color: value ? th.textQuaternary : th.textPlaceholder, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'min(180px, 50vw)' }}>{value || '—'}</span>
      </div>
    </div>
  );

  const TappableRow = ({ icon, iconBg, label, value, danger, onClick, last, chevron = true }: {
    icon: React.ReactNode; iconBg: string; label: string; value?: string;
    danger?: boolean; onClick: () => void; last?: boolean; chevron?: boolean;
  }) => (
    <button onClick={onClick} className="pf-tap-row" style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '10px 16px 10px 14px', borderBottom: last ? 'none' : `1px solid ${th.separator}`, gap: 12, textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}>
      <div style={{ width: 30, height: 30, borderRadius: 7, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <span style={{ flex: 1, fontSize: 15, color: danger ? '#ff3b30' : th.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {value && <span style={{ fontSize: 14, color: th.textQuaternary, marginRight: 4, flexShrink: 0, maxWidth: '40vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>}
      {chevron && <svg width="6" height="11" viewBox="0 0 7 12" fill="none" style={{ flexShrink: 0 }}><path d="M1 1l5 5-5 5" stroke={danger ? '#ff3b30' : th.textFaint} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
    </button>
  );

  const AvatarBlock = () => (
    <div className="pf-avatar-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div className="pf-av-photo" style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(145deg, #007aff, #5ac8fa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700, color: '#fff', boxShadow: '0 4px 20px rgba(0,122,255,0.28)', marginBottom: 12, animation: 'pop-in 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.08s both', flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
        {isLoading ? '' : profile?.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveAvatarUrl(profile.avatar) ?? profile.avatar}
            alt={getDisplayName()}
            width={80}
            height={80}
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          getInitials()
        )}
      </div>
      <div className="pf-av-info">
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, width: '100%' }}>
            <Skel w="60%" h={18} r={6} dark={D} /><Skel w="75%" h={13} r={5} dark={D} />
          </div>
        ) : (
          <>
            <h2 className="pf-av-name" style={{ fontSize: 18, fontWeight: 700, color: th.textPrimary, letterSpacing: -0.4, marginBottom: 3, lineHeight: 1.2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 12px' }}>{getDisplayName()}</h2>
            <p className="pf-av-email" style={{ fontSize: 13, color: th.textTertiary, marginBottom: 10, wordBreak: 'break-all', maxWidth: 'min(220px, 80vw)', lineHeight: 1.4 }}>{profile?.email}</p>
            <div className="pf-av-badges" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
              {profile?.docsVerified && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#34c759', background: 'rgba(52,199,89,0.12)', padding: '3px 10px', borderRadius: 99 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  {t('profile.verified')}
                </span>
              )}
              {profile?.id && (
                <button className="pf-copy-btn" onClick={copyId} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: th.textTertiary, background: D ? 'rgba(255,255,255,0.08)' : 'rgba(116,116,128,0.10)', padding: '3px 10px', borderRadius: 99, border: 'none', cursor: 'pointer', transition: 'opacity 0.15s', WebkitTapHighlightColor: 'transparent' }}>
                  ID: {String(profile.id).slice(0, 8)}…
                  {copied
                    ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#34c759" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                    : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  }
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  const BalanceBlock = () => (
    <div style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
      {[
        {
          label: t('profile.balanceReal'), color: '#34c759', bgColor: 'rgba(52,199,89,0.12)', val: balance?.real_balance, sub: currency,
          icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34c759" strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>,
        },
        {
          label: t('profile.balanceDemo'), color: '#ff9500', bgColor: 'rgba(255,149,0,0.12)', val: balance?.demo_balance, sub: t('common.virtual'),
          icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ff9500" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>,
        },
      ].map(({ label, color, bgColor, val, sub, icon }) => (
        <div key={label} style={{ flex: 1, minWidth: 0, background: th.cardBg, borderRadius: 12, padding: '11px 12px', boxShadow: th.cardShadow, display: 'flex', flexDirection: 'column', gap: 8, transition: 'background 0.3s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {icon}
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color, textTransform: 'uppercase' as const, letterSpacing: '0.04em', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          </div>
          <div style={{ minWidth: 0 }}>
            {isLoading
              ? <Skel w="85%" h={16} r={4} dark={D} />
              : <p className="balance-num" style={{ fontSize: 15, fontWeight: 700, color: th.textPrimary, letterSpacing: -0.4, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtBalance(val)}</p>
            }
            <p style={{ fontSize: 10, color: th.textFaint, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</p>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{
      height: '100dvh',
      background: th.pageBg,
      fontFamily: "-apple-system,'SF Pro Display',BlinkMacSystemFont,'Helvetica Neue',sans-serif",
      WebkitFontSmoothing: 'antialiased',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      transition: 'background 0.3s ease',
    }}>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes skel-pulse { 0%,100%{opacity:.5} 50%{opacity:1} }
        @keyframes bd-in      { from{opacity:0} to{opacity:1} }
        @keyframes pop-in     { from{opacity:0;transform:scale(0.94)} to{opacity:1;transform:scale(1)} }
        @keyframes fade-up    { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin       { to{transform:rotate(360deg)} }
        @keyframes number-in  { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }

        @keyframes lo-fade-in { from{opacity:0} to{opacity:1} }
        @keyframes lo-icon-in { from{opacity:0;transform:scale(0.6)} 70%{transform:scale(1.08)} to{opacity:1;transform:scale(1)} }
        @keyframes lo-msg-in  { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes lo-ring    { 0%,100%{transform:scale(1);opacity:0.8} 50%{transform:scale(1.06);opacity:0.35} }
        @keyframes lo-orb-1   { from{transform:translate(0,0)} to{transform:translate(30px,22px)} }
        @keyframes lo-orb-2   { from{transform:translate(0,0)} to{transform:translate(-25px,-18px)} }
        @keyframes lo-bar     { from{width:0%} to{width:100%} }

        .lo-splash {
          position: fixed; inset: 0; z-index: 9999;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          font-family: -apple-system,'SF Pro Display',BlinkMacSystemFont,'Helvetica Neue',sans-serif;
          -webkit-font-smoothing: antialiased;
          background: linear-gradient(160deg, #fff8f0 0%, #ffffff 50%, #f0f4ff 100%);
          overflow: hidden;
          animation: lo-fade-in 0.32s cubic-bezier(0.22,1,0.36,1) forwards;
        }
        .lo-orb { position: absolute; border-radius: 50%; pointer-events: none; }
        .lo-orb-1 { width:380px;height:380px;background:radial-gradient(circle,rgba(255,149,0,0.18) 0%,transparent 70%);filter:blur(80px);top:-100px;right:-100px;animation:lo-orb-1 7s ease-in-out infinite alternate; }
        .lo-orb-2 { width:340px;height:340px;background:radial-gradient(circle,rgba(0,122,255,0.14) 0%,transparent 70%);filter:blur(75px);bottom:-80px;left:-80px;animation:lo-orb-2 6s ease-in-out infinite alternate; }
        .lo-orb-3 { width:260px;height:260px;background:radial-gradient(circle,rgba(191,90,242,0.10) 0%,transparent 70%);filter:blur(70px);top:40%;left:-60px;animation:lo-orb-1 5s ease-in-out infinite alternate; }
        .lo-icon-wrap { position:relative;width:110px;height:110px;display:flex;align-items:center;justify-content:center;margin-bottom:28px; }
        .lo-ring      { position:absolute;inset:0;border-radius:50%;border:2px solid rgba(255,149,0,0.20);animation:lo-ring 2.2s ease-in-out infinite; }
        .lo-ring-2    { inset:-12px;border-color:rgba(255,149,0,0.12);animation-delay:0.4s; }
        .lo-ring-3    { inset:-24px;border-color:rgba(255,149,0,0.06);animation-delay:0.8s; }
        .lo-icon      { width:90px;height:90px;border-radius:28px;background:#fff;border:1px solid rgba(255,149,0,0.18);box-shadow:0 8px 36px rgba(255,149,0,0.16),0 2px 8px rgba(0,0,0,0.06);display:flex;align-items:center;justify-content:center;position:relative;z-index:1;animation:lo-icon-in 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.12s both;font-size:40px;line-height:1; }
        .lo-text  { text-align:center;padding:0 32px;animation:lo-msg-in 0.5s cubic-bezier(0.22,1,0.36,1) 0.24s both; }
        .lo-title { font-size:clamp(26px,8vw,32px);font-weight:800;letter-spacing:-1px;line-height:1.1;margin-bottom:8px;background:linear-gradient(135deg,#1c1c1e 0%,#3a3a3c 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text; }
        .lo-sub   { font-size:14.5px;color:#6e6e73;font-weight:400;line-height:1.6; }
        .lo-bar-wrap { margin-top:36px;width:120px;height:3px;background:rgba(0,0,0,0.07);border-radius:99px;overflow:hidden;animation:lo-msg-in 0.5s cubic-bezier(0.22,1,0.36,1) 0.35s both; }
        .lo-bar      { height:100%;border-radius:99px;background:linear-gradient(90deg,#ff9500,#ff6b00);animation:lo-bar 1.65s cubic-bezier(0.4,0,0.2,1) 0.4s forwards; }

        @media (hover: hover) {
          .pf-tap-row:hover { background: rgba(128,128,128,0.06) !important; }
        }
        .pf-tap-row:active { background: rgba(128,128,128,0.10) !important; }
        .pf-copy-btn:active { opacity: 0.6; }
        .balance-num { animation: number-in 0.4s ease both; }

        .pf-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
        .pf-mob-header { display: flex; flex-shrink: 0; }
        .pf-desk-header { display: none; }
        .pf-left { display: none; }
        .pf-right {
          flex: 1; overflow-y: auto; overscroll-behavior-y: contain; -webkit-overflow-scrolling: touch;
          padding: 20px 16px calc(56px + env(safe-area-inset-bottom, 0px) + 24px);
          display: flex; flex-direction: column; gap: 22px; min-height: 0;
        }
        .pf-right::-webkit-scrollbar { width: 0; }
        .pf-mob-only { display: block; }

        @media (min-width: 768px) {
          /* ── Layout ── */
          .pf-body { flex-direction: row; }
          .pf-mob-header { display: none; }
          .pf-desk-header { display: flex !important; align-items: center; justify-content: space-between; padding-bottom: 4px; }
          .pf-desk-hide { display: none !important; }
          .pf-mob-only { display: none; }

          /* ── Left Sidebar ── */
          .pf-left {
            display: flex; flex-direction: column; gap: 0;
            width: 300px; min-width: 300px; height: 100%; overflow-y: auto;
            padding: 0;
            border-right: 0.5px solid;
            transition: background 0.3s ease, border-color 0.3s ease;
          }
          .pf-left::-webkit-scrollbar { width: 0; }

          /* ── Avatar horizontal on desktop ── */
          .pf-avatar-wrap {
            flex-direction: row !important;
            align-items: center !important;
            text-align: left !important;
            padding: 24px 22px 20px !important;
            gap: 16px;
          }
          .pf-av-photo {
            margin-bottom: 0 !important;
            width: 56px !important; height: 56px !important;
            font-size: 20px !important;
            flex-shrink: 0;
          }
          .pf-av-info {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
          }
          .pf-av-name {
            font-size: 15px !important;
            padding: 0 !important;
            margin-bottom: 2px !important;
          }
          .pf-av-email {
            font-size: 12px !important;
            margin-bottom: 6px !important;
            max-width: 100% !important;
            word-break: break-all;
          }
          .pf-av-badges { justify-content: flex-start !important; }

          /* Sidebar nav sections */
          .pf-left-sep {
            height: 0.5px;
            margin: 0 22px;
          }
          .pf-left-section {
            padding: 16px 22px;
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .pf-left-label {
            font-size: 10px;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            margin-bottom: 10px;
          }

          /* ── Right Panel ── */
          .pf-right {
            padding: 28px 36px 80px;
            gap: 24px;
            max-width: 860px;
          }

          /* ── Desktop header ── */
          .pf-desk-header-title {
            font-size: 20px !important;
            font-weight: 600 !important;
          }

          /* ── Account info grid: 2 columns ── */
          .pf-info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
          }
          .pf-info-grid > div {
            border-bottom: none !important;
            border-right: 0.5px solid var(--pf-sep, rgba(84,84,88,0.25));
            border-bottom: 0.5px solid var(--pf-sep, rgba(84,84,88,0.25)) !important;
          }
          .pf-info-grid > div:nth-child(2n) {
            border-right: none;
          }
          .pf-info-grid > div:nth-last-child(1),
          .pf-info-grid > div:nth-last-child(2) {
            border-bottom: none !important;
          }

          /* ── Cards: flatter on desktop ── */
          .pf-right > div > div[style*="border-radius: 12px"],
          .pf-right > div > div[style*="borderRadius"] {
            box-shadow: none !important;
          }

          /* Entrance animations */
          .pf-left > * { animation: fade-up 0.38s cubic-bezier(0.22,1,0.36,1) both; }
          .pf-left > *:nth-child(1) { animation-delay: 0.04s; }
          .pf-left > *:nth-child(2) { animation-delay: 0.08s; }
          .pf-left > *:nth-child(3) { animation-delay: 0.12s; }
          .pf-left > *:nth-child(4) { animation-delay: 0.16s; }
          .pf-right > * { animation: fade-up 0.38s cubic-bezier(0.22,1,0.36,1) both; }
          .pf-right > *:nth-child(1) { animation-delay: 0.05s; }
          .pf-right > *:nth-child(2) { animation-delay: 0.10s; }
          .pf-right > *:nth-child(3) { animation-delay: 0.15s; }
          .pf-right > *:nth-child(4) { animation-delay: 0.20s; }
          .pf-right > *:nth-child(5) { animation-delay: 0.25s; }
          .pf-right > *:nth-child(6) { animation-delay: 0.30s; }
        }
      ` }} />

      {/* ── LOGOUT SPLASH ── */}
      {logoutSplash && (
        <div className="lo-splash">
          <div className="lo-orb lo-orb-1" />
          <div className="lo-orb lo-orb-2" />
          <div className="lo-orb lo-orb-3" />
          <div className="lo-icon-wrap">
            <div className="lo-ring" />
            <div className="lo-ring lo-ring-2" />
            <div className="lo-ring lo-ring-3" />
            <div className="lo-icon">👋</div>
          </div>
          <div className="lo-text">
            <p className="lo-title">{t('profile.logoutSplashTitle')}</p>
            <p className="lo-sub" style={{ whiteSpace: 'pre-line' }}>{t('profile.logoutSplashMessage')}</p>
          </div>
          <div className="lo-bar-wrap">
            <div className="lo-bar" />
          </div>
        </div>
      )}

      {/* ── MOBILE HEADER ── */}
      <div className="pf-mob-header" style={{
        width: '100%', zIndex: 50,
        background: th.headerBg,
        backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderBottom: `0.5px solid ${th.border}`,
        transition: 'background 0.3s ease, border-color 0.3s ease',
      }}>
        <div style={{ width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <h1 style={{ fontSize: 17, fontWeight: 600, color: th.textPrimary, letterSpacing: -0.4 }}>{t('profile.title')}</h1>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="pf-body">

        {/* ══ LEFT SIDEBAR (desktop only) ══ */}
        <div
          className="pf-left"
          style={{
            background: th.sidebarBg,
            borderRightColor: th.sidebarBorder,
          } as React.CSSProperties}
        >
          {/* Avatar */}
          <AvatarBlock />

          {/* Separator */}
          <div className="pf-left-sep" style={{ background: th.separator }} />

          {/* Balance section */}
          <div className="pf-left-section">
            <p className="pf-left-label" style={{ color: th.textTertiary }}>{t('common.balance')}</p>
            <BalanceBlock />
          </div>

          {/* Separator */}
          <div className="pf-left-sep" style={{ background: th.separator }} />

          {/* Bottom actions */}
          <div style={{ padding: '16px 22px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {isAdminUser && (
              <Card>
                <TappableRow
                  icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
                  iconBg="linear-gradient(135deg, #F59E0B, #D97706)"
                  label={t('profile.adminPanel')}
                  value={isSuperAdminUser ? 'Super Admin' : 'Admin'}
                  onClick={() => router.push('/admin')}
                  last
                />
              </Card>
            )}
            <Card>
              <TappableRow
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
                iconBg="#ff3b30" label={t('profile.logout')} danger onClick={() => setShowLogout(true)} last
              />
            </Card>
            <p style={{ textAlign: 'center', fontSize: 11, color: th.textPlaceholder, marginTop: 4, letterSpacing: '0.03em' }}>StockAutoTrade Licensed</p>
          </div>
        </div>

        {/* ══ RIGHT PANEL ══ */}
        <div
          className="pf-right"
          style={{ background: th.pageBg, transition: 'background 0.3s ease' } as React.CSSProperties}
        >

          <div className="pf-desk-header">
            <div>
              <h1 className="pf-desk-header-title" style={{ fontSize: 22, fontWeight: 700, color: th.textPrimary, letterSpacing: -0.5 }}>{t('profile.title')}</h1>
              <p style={{ fontSize: 12.5, color: th.textTertiary, marginTop: 2, letterSpacing: 0 }}>{profile?.email || ''}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setLangSheetOpen(true)}
                style={{ height: 34, padding: '0 12px', borderRadius: 8, background: th.btnBg, border: `0.5px solid ${th.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: th.textSecondary, fontFamily: 'inherit' }}
                title={t('language.title')}
              >
                🌐 <span>{t(`language.${{ en: 'english', id: 'indonesian', ru: 'russian', es: 'spanish', ms: 'malay', hi: 'hindi', th: 'thai', tr: 'turkish' }[language] ?? 'english'}`).toLowerCase()}</span>
              </button>
              <button onClick={() => loadProfile(true)} disabled={refreshing || isLoading}
                style={{ width: 34, height: 34, background: th.btnBg, border: `0.5px solid ${th.border}`, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#007aff', opacity: (refreshing || isLoading) ? 0.4 : 1, transition: 'opacity 0.15s' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ animation: (refreshing || isLoading) ? 'spin 0.8s linear infinite' : 'none' }}>
                  <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
              </button>
            </div>
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 10, background: 'rgba(255,59,48,0.10)', border: '1px solid rgba(255,59,48,0.20)' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ff3b30" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
              <span style={{ fontSize: 13, color: '#ff3b30', flex: 1 }}>{error}</span>
              <button onClick={() => setError(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ff3b30', opacity: 0.6, padding: 4, flexShrink: 0 }}>
                <svg width="11" height="11" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              </button>
            </div>
          )}

          <div className="pf-mob-only">
            <div style={{ marginBottom: 22 }}><AvatarBlock /></div>
            <div>
              <SectionLabel>{t('common.balance')}</SectionLabel>
              <BalanceBlock />
            </div>
          </div>

          <div>
            <SectionLabel>{t('profile.accountInfo')}</SectionLabel>
            <Card>
              <div className="pf-info-grid" style={{ '--pf-sep': th.separator } as React.CSSProperties}>
              {isLoading ? (
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[1,2,3,4].map(i => <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}><Skel w={80} h={13} dark={D} /><Skel w={130} h={13} dark={D} /></div>)}
                </div>
              ) : (
                <>
                  <InfoRow label={t('profile.email')} value={profile?.email} />
                  <InfoRow label={t('profile.emailVerified')} verified={profile?.emailVerified} value={profile?.emailVerified ? t('common.yes') : t('common.no')} />
                  <InfoRow label={t('profile.phone')} value={profile?.phone || null} />
                  <InfoRow label={t('profile.phoneVerified')} verified={profile?.phoneVerified} value={profile?.phoneVerified ? t('common.yes') : t('common.no')} />
                  <InfoRow label={t('profile.country')} value={profile?.country || profile?.registrationCountryIso || null} />
                  {profile?.registeredAt && <InfoRow label={t('profile.joined')} value={formatDate(new Date(profile.registeredAt), language, { day: '2-digit', month: 'long', year: 'numeric' })} />}
                  <InfoRow label={t('profile.birthday')} value={profile?.birthday ? formatDate(new Date(profile.birthday), language, { day: '2-digit', month: 'long', year: 'numeric' }) : null} last />
                </>
              )}
              </div>
            </Card>
          </div>

          <div>
            <SectionLabel>{t('profile.settings')}</SectionLabel>
            <Card>
              {/* Dark Mode Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px 10px 14px', borderBottom: `1px solid ${th.separator}`, gap: 12 }}>
                <div style={{ width: 30, height: 30, borderRadius: 7, background: D ? 'linear-gradient(135deg, #3a3a4e, #2a2a3e)' : 'linear-gradient(135deg, #1a1a2e, #16213e)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                </div>
                <span style={{ flex: 1, fontSize: 15, color: th.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('profile.darkMode')}</span>
                <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={isDarkMode}
                    onChange={toggleDarkMode}
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                  />
                  <div style={{ width: 51, height: 31, borderRadius: 31, position: 'relative', transition: 'all 0.3s', background: isDarkMode ? '#10B981' : 'rgba(120,120,128,0.16)' }}>
                    <div style={{ position: 'absolute', top: 2, width: 27, height: 27, borderRadius: '50%', transition: 'left 0.3s', left: isDarkMode ? 22 : 2, background: '#fff', boxShadow: '0 3px 8px rgba(0,0,0,0.15), 0 3px 1px rgba(0,0,0,0.06)' }}/>
                  </div>
                </label>
              </div>
              {/* Language Selector */}
              <TappableRow
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>}
                iconBg="linear-gradient(135deg, #10B981, #34D399)"
                label={t('language.title')}
                value={t(`language.${{ en: 'english', id: 'indonesian', ru: 'russian', es: 'spanish', ms: 'malay', hi: 'hindi', th: 'thai', tr: 'turkish' }[language] ?? 'english'}`).toLowerCase()}
                onClick={() => setLangSheetOpen(true)}
              />
              <TappableRow
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>}
                iconBg="#10B981" label={t('common.currency')} value={currencyLoading ? '…' : currency}
                onClick={() => currencies.length > 0 && setSheetOpen(true)} chevron={currencies.length > 0} last
              />
            </Card>
          </div>

          {isAdminUser && (
            <div className="pf-desk-hide">
              <SectionLabel>{t('profile.adminPanel')}</SectionLabel>
              <Card>
                <TappableRow
                  icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
                  iconBg="linear-gradient(135deg, #F59E0B, #D97706)"
                  label={t('profile.adminPanel')}
                  value={isSuperAdminUser ? 'Super Admin' : 'Admin'}
                  onClick={() => router.push('/admin')}
                  last
                />
              </Card>
            </div>
          )}

          <div>
            <SectionLabel>{t('profile.help')}</SectionLabel>
            <Card>
              <TappableRow
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3m.08 4h.01"/></svg>}
                iconBg="#5ac8fa" label={t('profile.termsOfService')} onClick={() => window.open('https://stockity.id/information/agreement', '_blank')}
              />
              <TappableRow
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
                iconBg="#34c759" label={t('profile.privacyPolicy')} onClick={() => window.open('https://stockity.id/information/privacy', '_blank')} last
              />
            </Card>
          </div>

          <div>
            <SectionLabel>{t('profile.updates')}</SectionLabel>
            <AppUpdateCard />
          </div>

          <div className="pf-mob-only">
            <Card>
              <TappableRow
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
                iconBg="#ff3b30" label={t('profile.logout')} danger onClick={() => setShowLogout(true)} last
              />
            </Card>
            <p style={{ textAlign: 'center', fontSize: 12, color: th.textPlaceholder, marginTop: 14 }}>StockAutoTrade v2.0.0</p>
          </div>

        </div>
      </div>

      <CurrencySheet
        open={sheetOpen} onClose={() => setSheetOpen(false)}
        currencies={currencies} current={currency}
        onSelect={handleUpdateCurrency} loading={currencyLoading}
        dark={D}
      />
      <LanguageSheet open={langSheetOpen} onClose={() => setLangSheetOpen(false)} />
      <LogoutAlert open={showLogout} onCancel={() => setShowLogout(false)} onConfirm={handleLogout} dark={D} />
    </div>
  );
}

// ─────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────
export default function ProfilePage() {
  return <ProfilePageContent />;
}