'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { BottomNav } from '@/components/BottomNav';
import { TabLoadingBar } from '@/components/TabLoadingBar';
import { isSessionValid, sessionLogout } from '@/lib/storage';
import { LanguageProvider } from '@/lib';
import { DarkModeProvider, useDarkMode } from '@/lib/DarkModeContext';

const PUBLIC_ROUTES = ['/login', '/register'];

const AUTH_CHECK_RETRIES    = 5;
const AUTH_CHECK_DELAY      = 400;
const INITIAL_DELAY         = 200;
const CAPACITOR_EXTRA_DELAY = 300;
const SPLASH_MIN_DURATION   = 4500;

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [ready,     setReady]     = useState(false);
  const [navHidden, setNavHidden] = useState(false); // ← NEW: sembunyikan BottomNav saat logout splash
  const authCheckRef  = useRef(false);
  const splashStartRef = useRef(Date.now());

  const isPublic = PUBLIC_ROUTES.some(
    route => pathname === route || pathname.startsWith(`${route}/`)
  );

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

  // ── Nav hide/show — dipakai halaman profile saat logout splash ───────────
  // Halaman profile men-dispatch 'stc:hidenav' sebelum splash tampil dan
  // 'stc:shownav' jika user membatalkan (untuk berjaga-jaga).
  // Ini menghindari BottomNav tampil di atas logout splash karena stacking-
  // context yang dibuat oleh opacity/transition pada <main>.
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

  // ── Reset navHidden saat berpindah halaman ─────────────────────────────
  // Jaga-jaga jika user navigasi tanpa logout selesai
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
        </ThemeWrapper>
      </LanguageProvider>
    </DarkModeProvider>
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