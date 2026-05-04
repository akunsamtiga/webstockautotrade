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

  // Sembunyikan nav di halaman webview agar konten full-screen
  if (pathname === '/webview') return null;

  const isDashboard = pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  const useDarkNav  = isDashboard && isDarkMode;

  const theme = useDarkNav
    ? {
        navBg:      'rgb(18,18,20)',
        navBorder:  '1px solid rgba(255,255,255,0.08)',
        itemColor:  'rgba(255,255,255,0.45)',
        activeColor:'#10B981',
        labelColor: (active: boolean) => active ? '#10B981' : 'rgba(255,255,255,0.40)',
      }
    : {
        navBg:      'rgb(255,255,255)',
        navBorder:  '1px solid rgba(60,60,67,0.12)',
        itemColor:  'rgba(60,60,67,0.55)',
        activeColor:'#007aff',
        labelColor: (active: boolean) => active ? '#007aff' : 'rgba(60,60,67,0.55)',
      };

  return (
    <>
      <style>{`
        .bnav-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          flex: 1;
          padding: 8px 4px 6px;
          text-decoration: none;
          -webkit-tap-highlight-color: transparent;
          transition: opacity 0.15s ease;
          position: relative;
        }
        .bnav-item:active { opacity: 0.6; }
        .bnav-label {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.01em;
          line-height: 1;
        }
        .bnav-indicator {
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 32px;
          height: 2.5px;
          border-radius: 0 0 3px 3px;
          transition: opacity 0.2s ease;
        }
      `}</style>

      <div
        suppressHydrationWarning
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          background: theme.navBg,
          borderTop: theme.navBorder,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          boxShadow: useDarkNav
            ? '0 -1px 0 rgba(255,255,255,0.06)'
            : '0 -1px 0 rgba(60,60,67,0.10)',
          transition: 'background 0.3s ease',
        }}
      >
        <nav style={{ display: 'flex', alignItems: 'stretch', height: 56 }}>
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
            const col = isActive ? theme.activeColor : theme.itemColor;

            return (
              <Link
                key={href}
                href={href}
                className="bnav-item"
                style={{ color: col }}
              >
                <div
                  className="bnav-indicator"
                  style={{ background: theme.activeColor, opacity: isActive ? 1 : 0 }}
                />
                <Icon size={22} strokeWidth={isActive ? 2.2 : 1.7} />
                <span className="bnav-label" style={{ color: theme.labelColor(isActive) }}>
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}