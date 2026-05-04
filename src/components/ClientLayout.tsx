'use client';
  import { useEffect, useState, useRef } from 'react';
  import { useRouter, usePathname } from 'next/navigation';
  import { BottomNav } from '@/components/BottomNav';
  import { isSessionValid, sessionLogout } from '@/lib/storage';
  import { LanguageProvider } from '@/lib/i18n';
  import { DarkModeProvider, useDarkMode } from '@/lib/DarkModeContext';

  const PUBLIC_ROUTES = ['/login', '/register'];

  // ✅ CONFIGURABLE: Auth check settings
  const AUTH_CHECK_RETRIES = 5;
  const AUTH_CHECK_DELAY = 400;
  const INITIAL_DELAY = 200;
  const CAPACITOR_EXTRA_DELAY = 300;
  const SPLASH_MIN_DURATION = 4500;        // Minimum splash screen duration untuk smooth UX

  export function ClientLayout({ children }: { children: React.ReactNode }) {
    const router   = useRouter();
    const pathname = usePathname();
    const [ready, setReady] = useState(false);
    const authCheckRef = useRef(false);
    const splashStartRef = useRef(Date.now());

    const isPublic = PUBLIC_ROUTES.some(
      route => pathname === route || pathname.startsWith(`${route}/`)
    );

    useEffect(() => {
      // Prevent double execution
      if (authCheckRef.current) return;
      authCheckRef.current = true;

      // ✅ FALLBACK: Pastikan UI tidak stuck lebih dari 5 detik
      const fallback = setTimeout(() => {
        console.warn('[ClientLayout] Fallback timeout reached, forcing ready state');
        setReady(true);
      }, 5000);

      const checkAuth = async () => {
        try {
          // Halaman publik: tampilkan dengan smooth transition
          if (isPublic) {
            // Minimal delay untuk smooth UX
            const elapsed = Date.now() - splashStartRef.current;
            const remaining = Math.max(0, 500 - elapsed); // Shorter delay untuk public pages
            
            setTimeout(() => setReady(true), remaining);
            
            clearTimeout(fallback);
            return;
          }

          // ✅ TUNGGU: Beri waktu WebView/DOM untuk inisialisasi
          await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY));

          // ✅ EXTRA DELAY: Untuk Capacitor native app
          const isCapacitor = typeof window !== 'undefined' && 
            (window as any).Capacitor?.isNativePlatform?.() === true;
          if (isCapacitor) {
            console.log('[ClientLayout] Capacitor detected, adding extra delay');
            await new Promise(resolve => setTimeout(resolve, CAPACITOR_EXTRA_DELAY));
          }

          // ✅ CEK SESSION: Dengan retry dan validasi lengkap
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
            // Clear any stale session data
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
          // Ensure minimum splash duration for smooth UX
          const elapsed = Date.now() - splashStartRef.current;
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

    useEffect(() => {
      const handleUnauthorized = () => router.replace('/login');
      window.addEventListener('stc:unauthorized', handleUnauthorized);
      return () => window.removeEventListener('stc:unauthorized', handleUnauthorized);
    }, [router]);

    // Hide initial HTML splash screen when React is ready
    useEffect(() => {
      if (ready) {
        /* ── FIX GRID FLASH ─────────────────────────────────────────────
           Double requestAnimationFrame: tunggu sampai browser benar-benar
           selesai paint frame pertama konten sebelum splash mulai fade.
           Frame 1 → React commit. Frame 2 → browser paint.
           Crossfade bersih: konten fade-in (0.35s) + splash fade-out (0.5s). */
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

    /* ── Selalu render full layout (tersembunyi di balik HTML splash) ──
       Menghapus React splash component mencegah "component swap" flash.
       HTML splash di layout.tsx (z-index 99999) yang bertanggung jawab
       menyembunyikan konten selama loading. Konten fade-in setelah ready. */
    return (
      <DarkModeProvider>
        <LanguageProvider>
          <ThemeWrapper>
            <main
              style={{
                display: 'block',
                margin: 0,
                padding: 0,
                /* ── FIX SCROLL LAG ────────────────────────────────────────
                   height:100% bukan dvh → tidak reflow saat browser chrome
                   iOS muncul/hilang saat scroll. CSS di globals.css yang
                   mengatur overflow-y:scroll, will-change, contain. */
                height: '100%',
                /* Padding bawah = tinggi BottomNav (56px) + safe area */
                paddingBottom: !isPublic
                  ? 'calc(56px + env(safe-area-inset-bottom, 0px))'
                  : undefined,
                /* ── FIX GRID FLASH ─────────────────────────────────────────
                   Konten tidak terlihat selama loading (HTML splash menutupi).
                   Setelah ready, fade-in smooth bersama splash fade-out.
                   Gunakan opacity (bukan visibility) agar GPU layer tetap ada. */
                opacity: ready ? 1 : 0,
                transition: ready ? 'opacity 0.35s ease-out' : 'none',
              } as React.CSSProperties}>
              {children}
            </main>
            {!isPublic && <BottomNav />}
          </ThemeWrapper>
        </LanguageProvider>
      </DarkModeProvider>
    );
  }

  // Wrapper untuk apply theme attribute ke body
  function ThemeWrapper({ children }: { children: React.ReactNode }) {
    const { isDarkMode } = useDarkMode();
    
    useEffect(() => {
      // Apply theme attribute ke body
      if (typeof document !== 'undefined') {
        if (isDarkMode) {
          document.body.removeAttribute('data-theme');
        } else {
          document.body.setAttribute('data-theme', 'light');
        }
      }
    }, [isDarkMode]);
    
    return <>{children}</>;
  }