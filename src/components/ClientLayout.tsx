'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { BottomNav } from '@/components/BottomNav';
import { TabLoadingBar } from '@/components/TabLoadingBar';
import { isSessionValid, sessionLogout } from '@/lib/storage';
import { LanguageProvider } from '@/lib';
import { DarkModeProvider, useDarkMode } from '@/lib/DarkModeContext';
import { useWhitelistGuard } from '@/lib/useWhitelistGuard';

const PUBLIC_ROUTES = ['/login', '/register'];

const AUTH_CHECK_RETRIES    = 5;
const AUTH_CHECK_DELAY      = 400;
const INITIAL_DELAY         = 200;
const CAPACITOR_EXTRA_DELAY = 300;
const SPLASH_MIN_DURATION   = 4500;

// ── Durasi countdown (detik) sebelum auto-logout saat diblokir ───────────────
const BLOCKED_COUNTDOWN_SEC = 10;

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [ready,     setReady]     = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const authCheckRef  = useRef(false);
  const splashStartRef = useRef(Date.now());

  const isPublic = PUBLIC_ROUTES.some(
    route => pathname === route || pathname.startsWith(`${route}/`)
  );

  // ── Whitelist guard (hanya aktif di halaman protected) ───────────────────
  const { isBlocked, email: blockedEmail } = useWhitelistGuard(!isPublic && ready);

  // ── Auth check ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authCheckRef.current) return;
    authCheckRef.current = true;

    const fallback = setTimeout(() => {
      console.warn('[ClientLayout] Fallback timeout reached, forcing ready state');
      setReady(true);
    }, 5000);

    const checkAuth = async () => {
      try {
        if (isPublic) {
          const elapsed   = Date.now() - splashStartRef.current;
          const remaining = Math.max(0, 500 - elapsed);
          setTimeout(() => setReady(true), remaining);
          clearTimeout(fallback);
          return;
        }

        await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY));

        const isCapacitor =
          typeof window !== 'undefined' &&
          (window as any).Capacitor?.isNativePlatform?.() === true;
        if (isCapacitor) {
          console.log('[ClientLayout] Capacitor detected, adding extra delay');
          await new Promise(resolve => setTimeout(resolve, CAPACITOR_EXTRA_DELAY));
        }

        let sessionValid = false;
        for (let i = 0; i < AUTH_CHECK_RETRIES; i++) {
          sessionValid = await isSessionValid();
          if (sessionValid) {
            console.log('[ClientLayout] Session valid on attempt', i + 1);
            break;
          }
          console.log(`[ClientLayout] Session check attempt ${i + 1}/${AUTH_CHECK_RETRIES} - not valid yet`);
          if (i < AUTH_CHECK_RETRIES - 1) {
            await new Promise(r => setTimeout(r, AUTH_CHECK_DELAY));
          }
        }

        if (!sessionValid) {
          console.log('[ClientLayout] Session invalid after all retries, redirecting to login');
          await sessionLogout().catch(() => {});
          router.replace('/login');
        } else {
          console.log('[ClientLayout] Auth verified, rendering protected page');
        }
      } catch (err) {
        console.error('[ClientLayout] Auth check error:', err);
        if (!isPublic) {
          await sessionLogout().catch(() => {});
          router.replace('/login');
        }
      } finally {
        const elapsed   = Date.now() - splashStartRef.current;
        const remaining = Math.max(0, SPLASH_MIN_DURATION - elapsed);
        setTimeout(() => setReady(true), remaining);
        clearTimeout(fallback);
      }
    };

    checkAuth();
    return () => {
      clearTimeout(fallback);
      authCheckRef.current = false;
    };
  }, [pathname, router, isPublic]);

  // ── Unauthorized handler ──────────────────────────────────────────────────
  useEffect(() => {
    let logoutPending = false;

    const handleUnauthorized = async () => {
      if (logoutPending) return;
      logoutPending = true;
      console.log('[ClientLayout] Unauthorized event received, logging out...');
      try { await sessionLogout(); } catch { /* ignore */ }
      router.replace('/login');
    };

    window.addEventListener('stc:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('stc:unauthorized', handleUnauthorized);
  }, [router]);

  // ── Nav hide/show ─────────────────────────────────────────────────────────
  useEffect(() => {
    const hide = () => setNavHidden(true);
    const show = () => setNavHidden(false);
    window.addEventListener('stc:hidenav', hide);
    window.addEventListener('stc:shownav', show);
    return () => {
      window.removeEventListener('stc:hidenav', hide);
      window.removeEventListener('stc:shownav', show);
    };
  }, []);

  useEffect(() => {
    setNavHidden(false);
  }, [pathname]);

  // ── Remove splash HTML saat React sudah siap ─────────────────────────────
  useEffect(() => {
    if (ready) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const htmlSplash = document.getElementById('__stc_splash');
          if (htmlSplash) {
            htmlSplash.classList.add('hide');
            setTimeout(() => htmlSplash.remove(), 520);
          }
        });
      });
    }
  }, [ready]);

  return (
    <DarkModeProvider>
      <LanguageProvider>
        <ThemeWrapper>
          {/* Tab transition loading indicator */}
          {!isPublic && <TabLoadingBar />}

          <main
            style={{
              display: 'block',
              margin: 0,
              padding: 0,
              height: '100%',
              paddingTop: 'env(safe-area-inset-top, 0px)',
              paddingBottom: isPublic
                ? 'env(safe-area-inset-bottom, 0px)'
                : 'calc(56px + env(safe-area-inset-bottom, 0px))',
              opacity: ready ? 1 : 0,
              transition: ready ? 'opacity 0.35s ease-out' : 'none',
            } as React.CSSProperties}
          >
            {children}
          </main>

          {/* BottomNav disembunyikan saat logout splash aktif */}
          {!isPublic && !navHidden && <BottomNav />}

          {/* ── Whitelist Blocked Overlay ───────────────────────────────── */}
          {isBlocked && (
            <BlockedOverlay
              email={blockedEmail}
              onLogout={async () => {
                await sessionLogout().catch(() => {});
                router.replace('/login');
              }}
            />
          )}
        </ThemeWrapper>
      </LanguageProvider>
    </DarkModeProvider>
  );
}

// ── BlockedOverlay ────────────────────────────────────────────────────────────
function BlockedOverlay({
  email,
  onLogout,
}: {
  email:    string | null;
  onLogout: () => void;
}) {
  const [countdown, setCountdown] = useState(BLOCKED_COUNTDOWN_SEC);
  const logoutFired = useRef(false);

  // Countdown → auto-logout
  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown(prev => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(tick);
          if (!logoutFired.current) {
            logoutFired.current = true;
            onLogout();
          }
        }
        return next;
      });
    }, 1_000);
    return () => clearInterval(tick);
  }, [onLogout]);

  // Progress lingkaran
  const radius       = 22;
  const circumference = 2 * Math.PI * radius;
  const progress     = countdown / BLOCKED_COUNTDOWN_SEC;
  const strokeDash   = circumference * (1 - progress);

  return (
    <>
      <style>{`
        @keyframes __blk_in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes __blk_card_in {
          from { opacity: 0; transform: translateY(24px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes __blk_shake {
          0%,100% { transform: translateX(0); }
          20%     { transform: translateX(-5px); }
          50%     { transform: translateX(5px); }
          80%     { transform: translateX(-3px); }
        }
        @keyframes __blk_pulse {
          0%,100% { box-shadow: 0 0 0 0   rgba(255,59,48,0.35); }
          50%     { box-shadow: 0 0 0 14px rgba(255,59,48,0.00); }
        }
      `}</style>

      {/* Backdrop */}
      <div
        style={{
          position:            'fixed',
          inset:               0,
          zIndex:              2147483646,
          background:          'rgba(0,0,0,0.72)',
          backdropFilter:      'blur(18px)',
          WebkitBackdropFilter:'blur(18px)',
          display:             'flex',
          alignItems:          'center',
          justifyContent:      'center',
          padding:             '24px 20px',
          animation:           '__blk_in 0.3s ease forwards',
          fontFamily:          "-apple-system,'SF Pro Display',BlinkMacSystemFont,'Helvetica Neue',sans-serif",
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        {/* Card */}
        <div
          style={{
            background:   'rgba(28,28,30,0.97)',
            border:       '1px solid rgba(255,59,48,0.25)',
            borderRadius: 28,
            padding:      '36px 28px 28px',
            width:        '100%',
            maxWidth:     360,
            textAlign:    'center',
            boxShadow:    '0 24px 80px rgba(0,0,0,0.50), 0 0 0 1px rgba(255,59,48,0.10)',
            animation:    '__blk_card_in 0.4s cubic-bezier(0.22,1,0.36,1) forwards',
          }}
        >
          {/* Icon */}
          <div
            style={{
              width:        72,
              height:       72,
              borderRadius: '50%',
              background:   'rgba(255,59,48,0.14)',
              border:       '1.5px solid rgba(255,59,48,0.30)',
              display:      'flex',
              alignItems:   'center',
              justifyContent:'center',
              margin:       '0 auto 20px',
              animation:    '__blk_pulse 2s ease-in-out infinite',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
              stroke="#ff3b30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>

          {/* Title */}
          <h2
            style={{
              fontSize:    22,
              fontWeight:  700,
              color:       '#ffffff',
              margin:      '0 0 8px',
              letterSpacing: -0.5,
            }}
          >
            Akses Diblokir
          </h2>

          {/* Subtitle */}
          <p
            style={{
              fontSize:   14,
              color:      'rgba(235,235,245,0.60)',
              lineHeight: 1.5,
              margin:     '0 0 6px',
            }}
          >
            Akun Anda telah dinonaktifkan oleh administrator.
          </p>

          {/* Email badge */}
          {email && (
            <div
              style={{
                display:      'inline-flex',
                alignItems:   'center',
                gap:          6,
                background:   'rgba(255,59,48,0.10)',
                border:       '1px solid rgba(255,59,48,0.20)',
                borderRadius: 99,
                padding:      '4px 12px',
                marginBottom: 20,
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="#ff3b30" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              <span
                style={{
                  fontSize:     12,
                  color:        'rgba(255,120,120,0.90)',
                  fontWeight:   500,
                  maxWidth:     220,
                  overflow:     'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace:   'nowrap',
                }}
              >
                {email}
              </span>
            </div>
          )}

          {/* Divider */}
          <div
            style={{
              height:     1,
              background: 'rgba(255,255,255,0.07)',
              margin:     '0 0 20px',
            }}
          />

          {/* Info box */}
          <div
            style={{
              background:   'rgba(255,255,255,0.05)',
              border:       '1px solid rgba(255,255,255,0.08)',
              borderRadius: 14,
              padding:      '14px 16px',
              textAlign:    'left',
              marginBottom: 24,
            }}
          >
            <p
              style={{
                fontSize:   13,
                color:      'rgba(235,235,245,0.55)',
                lineHeight: 1.6,
                margin:     0,
              }}
            >
              Jika Anda merasa ini adalah kesalahan, silakan hubungi admin atau
              reseller Anda untuk mengaktifkan kembali akses.
            </p>
          </div>

          {/* Countdown ring + button */}
          <div
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            14,
            }}
          >
            {/* SVG countdown ring */}
            <div style={{ position: 'relative', width: 50, height: 50, flexShrink: 0 }}>
              <svg width="50" height="50" viewBox="0 0 50 50">
                {/* Track */}
                <circle
                  cx="25" cy="25" r={radius}
                  fill="none"
                  stroke="rgba(255,255,255,0.10)"
                  strokeWidth="3"
                />
                {/* Progress */}
                <circle
                  cx="25" cy="25" r={radius}
                  fill="none"
                  stroke="#ff3b30"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDash}
                  transform="rotate(-90 25 25)"
                  style={{ transition: 'stroke-dashoffset 0.9s linear' }}
                />
              </svg>
              {/* Number */}
              <span
                style={{
                  position:  'absolute',
                  inset:     0,
                  display:   'flex',
                  alignItems:'center',
                  justifyContent:'center',
                  fontSize:  15,
                  fontWeight:700,
                  color:     '#ff3b30',
                }}
              >
                {countdown}
              </span>
            </div>

            {/* Logout now button */}
            <button
              onClick={() => {
                if (!logoutFired.current) {
                  logoutFired.current = true;
                  onLogout();
                }
              }}
              style={{
                flex:        1,
                height:      46,
                background:  '#ff3b30',
                border:      'none',
                borderRadius:12,
                color:       '#ffffff',
                fontSize:    14,
                fontWeight:  600,
                cursor:      'pointer',
                fontFamily:  'inherit',
                letterSpacing:-0.2,
                boxShadow:   '0 4px 16px rgba(255,59,48,0.35)',
                transition:  'opacity 0.15s, transform 0.12s',
                WebkitTapHighlightColor: 'transparent',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              onMouseDown={e  => (e.currentTarget.style.transform = 'scale(0.97)')}
              onMouseUp={e    => (e.currentTarget.style.transform = 'scale(1)')}
            >
              Keluar Sekarang
            </button>
          </div>

          {/* Auto-logout hint */}
          <p
            style={{
              fontSize:   11,
              color:      'rgba(235,235,245,0.30)',
              marginTop:  14,
              marginBottom: 0,
              letterSpacing: 0.1,
            }}
          >
            Otomatis keluar dalam {countdown} detik
          </p>
        </div>
      </div>
    </>
  );
}

// ── ThemeWrapper ──────────────────────────────────────────────────────────────
function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const { isDarkMode } = useDarkMode();
  const pathname = usePathname();

  const DARK_BG  = '#000000';
  const LIGHT_BG = '#F2F2F7';

  const syncNativeBars = async (dark: boolean) => {
    const isCapacitor =
      typeof window !== 'undefined' &&
      (window as any).Capacitor?.isNativePlatform?.() === true;
    if (!isCapacitor) return;

    const bgColor = dark ? DARK_BG : LIGHT_BG;

    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
      await StatusBar.setBackgroundColor({ color: bgColor });
    } catch { /* Plugin tidak tersedia */ }

    try {
      const { NavigationBar } = await import('@capgo/capacitor-navigation-bar');
      await NavigationBar.setNavigationBarColor({ color: bgColor, darkButtons: !dark });
    } catch { /* Fallback warna dari MainActivity.java */ }
  };

  useEffect(() => {
    const bgColor = isDarkMode ? DARK_BG : LIGHT_BG;

    if (typeof document !== 'undefined') {
      if (isDarkMode) {
        document.body.removeAttribute('data-theme');
      } else {
        document.body.setAttribute('data-theme', 'light');
      }
      document.body.style.background = bgColor;

      const metaTags = document.querySelectorAll('meta[name="theme-color"]');
      if (metaTags.length > 0) {
        metaTags.forEach(el => {
          (el as HTMLMetaElement).content = bgColor;
          (el as HTMLMetaElement).removeAttribute('media');
        });
      } else {
        const meta = document.createElement('meta');
        meta.name = 'theme-color';
        meta.content = bgColor;
        document.head.appendChild(meta);
      }
    }

    syncNativeBars(isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    syncNativeBars(isDarkMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return <>{children}</>;
}