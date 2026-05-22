'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, History, Globe, User } from 'lucide-react';
import { useDarkMode } from '@/lib/DarkModeContext';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/history',   label: 'Riwayat',   icon: History },
  { href: '/webview',   label: 'Trade',     icon: Globe },
  { href: '/profile',   label: 'Profil',    icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  const { isDarkMode } = useDarkMode();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  if (pathname === '/webview') return null;

  const handleNavClick = (href: string) => {
    const isActive = pathname === href || pathname.startsWith(href + '/');
    if (!isActive) window.dispatchEvent(new CustomEvent('stc:navstart'));
  };

  const pillBg     = isDarkMode ? 'rgba(26,26,28,0.93)' : 'rgba(20,20,22,0.90)';
  const inactiveFg = isDarkMode ? 'rgba(255,255,255,0.40)' : 'rgba(255,255,255,0.52)';
  const activeFg   = '#ffffff';
  const activePill = isDarkMode ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.18)';

  return (
    <>
      <style>{`
        @keyframes di-pop {
          0%   { transform: scale(0.84) translateY(8px); opacity: 0; }
          65%  { transform: scale(1.03) translateY(-1px); }
          100% { transform: scale(1)   translateY(0);    opacity: 1; }
        }

        /* ── Outer wrapper: centres the floating pill ── */
        .bnav-wrap {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 50;
          display: flex;
          justify-content: center;
          align-items: flex-end;
          padding: 0 12px calc(env(safe-area-inset-bottom, 0px) + 12px);
          pointer-events: none;
        }

        /* ── The pill itself ── */
        .bnav-island {
          display: flex;
          align-items: center;
          gap: 3px;
          padding: 5px 6px;
          border-radius: 999px;
          pointer-events: all;

          /* never wider than screen - 24px margin */
          max-width: calc(100vw - 24px);
          width: max-content;

          backdrop-filter: saturate(200%) blur(30px);
          -webkit-backdrop-filter: saturate(200%) blur(30px);
          box-shadow:
            0 10px 36px rgba(0,0,0,0.40),
            0 2px 10px  rgba(0,0,0,0.24),
            inset 0 0.5px 0 rgba(255,255,255,0.12);

          animation: di-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both;
          transition: background 0.3s ease;
        }

        /* ── Each nav item ── */
        .bnav-item {
          display: flex;
          flex-direction: row;         /* horizontal: icon + label */
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 9px 13px;
          border-radius: 999px;
          text-decoration: none;
          -webkit-tap-highlight-color: transparent;
          white-space: nowrap;
          transition:
            background 0.25s cubic-bezier(0.34,1.2,0.64,1),
            color      0.2s ease,
            transform  0.12s ease;
          flex-shrink: 0;
        }
        .bnav-item:active { transform: scale(0.90); }

        .bnav-icon {
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1);
        }
        .bnav-item.active .bnav-icon { transform: scale(1.1); }

        .bnav-label {
          font-size: 12.5px;
          font-weight: 600;
          letter-spacing: -0.15px;
          line-height: 1;
          flex-shrink: 0;
        }

        /* ── Mobile: hanya label aktif yang tampil ── */
        @media (max-width: 767px) {
          .bnav-label           { display: none; }
          .bnav-item.active .bnav-label { display: block; }
          .bnav-item            { padding: 10px 12px; gap: 0; }
          .bnav-item.active     { padding: 10px 16px; gap: 6px; }
        }
      `}</style>

      <div className="bnav-wrap" suppressHydrationWarning>
        <nav className="bnav-island" style={{ background: pillBg }}>
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={`bnav-item${isActive ? ' active' : ''}`}
                style={{
                  color:      isActive ? activeFg   : inactiveFg,
                  background: isActive ? activePill : 'transparent',
                }}
                onClick={() => handleNavClick(href)}
              >
                <span className="bnav-icon">
                  <Icon size={19} strokeWidth={isActive ? 2.3 : 1.8} />
                </span>
                <span className="bnav-label">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}