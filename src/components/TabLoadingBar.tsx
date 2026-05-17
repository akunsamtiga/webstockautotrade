'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * TabLoadingBar — v2
 *
 * Problem v1: navigasi App Router bisa selesai < 100ms sehingga bar
 * langsung hilang sebelum terlihat. Halaman baru juga punya stacking
 * context sendiri yang bisa menimpa z-index.
 *
 * Solusi:
 *  - Overlay full-viewport → tidak bisa ketutup halaman manapun
 *  - Durasi minimum MIN_VISIBLE_MS (500ms) terjamin
 *  - Z-index 2147483647 (INT_MAX) — selalu di atas segalanya
 *  - State machine: idle → entering → visible → leaving → idle
 */

const MIN_VISIBLE_MS = 500; // ms overlay pasti terlihat
const FADE_MS        = 250; // durasi fade in/out

type Phase = 'idle' | 'entering' | 'visible' | 'leaving';

export function TabLoadingBar() {
  const pathname     = usePathname();
  const prevPathRef  = useRef(pathname);
  const [phase, setPhase]  = useState<Phase>('idle');
  const phaseRef     = useRef<Phase>('idle');
  const navDoneRef   = useRef(false);
  const showStartRef = useRef(0);

  const setPhaseSync = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  // ── Mulai saat user klik tab ──────────────────────────────────────────────
  useEffect(() => {
    const handleNavStart = () => {
      if (phaseRef.current !== 'idle') return;
      navDoneRef.current   = false;
      showStartRef.current = Date.now();
      setPhaseSync('entering');

      // Setelah fade-in → pindah ke 'visible'
      setTimeout(() => {
        setPhaseSync('visible');
        // Jika halaman sudah selesai selagi fade-in berlangsung
        if (navDoneRef.current) scheduleLeave();
      }, FADE_MS);
    };

    window.addEventListener('stc:navstart', handleNavStart);
    return () => window.removeEventListener('stc:navstart', handleNavStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Deteksi navigasi selesai via perubahan pathname ───────────────────────
  useEffect(() => {
    if (pathname === prevPathRef.current) return;
    prevPathRef.current = pathname;
    if (phaseRef.current === 'idle') return;

    navDoneRef.current = true;
    if (phaseRef.current === 'visible') scheduleLeave();
    // Jika masih 'entering', scheduleLeave dipanggil dari setTimeout di atas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // ── Tunggu minimum duration lalu fade-out ─────────────────────────────────
  const scheduleLeave = () => {
    const elapsed   = Date.now() - showStartRef.current;
    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
    setTimeout(() => {
      setPhaseSync('leaving');
      setTimeout(() => setPhaseSync('idle'), FADE_MS);
    }, remaining);
  };

  if (phase === 'idle') return null;

  const opacity = phase === 'leaving' ? 0 : 1;

  return (
    <div
      aria-hidden
      style={{
        position:            'fixed',
        inset:               0,
        zIndex:              2147483647,
        pointerEvents:       'none',
        display:             'flex',
        flexDirection:       'column',
        alignItems:          'center',
        justifyContent:      'center',
        background:          'rgba(0,0,0,0.50)',
        backdropFilter:      'blur(3px)',
        WebkitBackdropFilter:'blur(3px)',
        opacity,
        transition:          `opacity ${FADE_MS}ms ease`,
      }}
    >
      <style>{`
        @keyframes __tab_spin {
          to { transform: rotate(360deg); }
        }
        @keyframes __tab_pulse {
          0%, 100% { opacity: 0.25; transform: scale(0.7); }
          50%       { opacity: 1;   transform: scale(1);   }
        }
        .__tab_ring {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 3px solid rgba(255,255,255,0.12);
          border-top-color: #00d4aa;
          animation: __tab_spin 0.7s linear infinite;
        }
        .__tab_dots {
          display: flex;
          gap: 8px;
          margin-top: 18px;
        }
        .__tab_dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: rgba(255,255,255,0.6);
          animation: __tab_pulse 1.2s ease-in-out infinite;
        }
        .__tab_dot:nth-child(2) { animation-delay: 0.18s; }
        .__tab_dot:nth-child(3) { animation-delay: 0.36s; }
      `}</style>

      <div className="__tab_ring" />
      <div className="__tab_dots">
        <span className="__tab_dot" />
        <span className="__tab_dot" />
        <span className="__tab_dot" />
      </div>
    </div>
  );
}