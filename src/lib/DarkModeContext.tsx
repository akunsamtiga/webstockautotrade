'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { storage } from './storage';

const DARK_MODE_KEY = 'stc_dark_mode';

// ── Warna background per tema ─────────────────────────────────────────────────
const THEME_COLORS = {
  dark:  { bg: '#000000' },  // icon status bar putih (Style.Dark)
  light: { bg: '#F2F2F7' },  // icon status bar hitam (Style.Light)
} as const;

// ── Helper: update StatusBar Capacitor ────────────────────────────────────────
async function syncStatusBar(isDark: boolean) {
  if (typeof window === 'undefined') return;
  if (!(window as any).Capacitor?.isNativePlatform?.()) return;

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    const theme = isDark ? THEME_COLORS.dark : THEME_COLORS.light;

    // Warna background status bar ikut tema
    await StatusBar.setBackgroundColor({ color: theme.bg });
    // Style icon/teks: DARK = icon putih, LIGHT = icon hitam
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
  } catch {
    // Plugin belum ter-install atau platform tidak support — abaikan
  }
}

// ── Helper: baca preferensi sistem HP ────────────────────────────────────────
function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

interface DarkModeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  setDarkMode: (value: boolean) => void;
}

const DarkModeContext = createContext<DarkModeContextType | undefined>(undefined);

export function DarkModeProvider({ children }: { children: ReactNode }) {
  // ✅ FIX: Default ikut preferensi sistem HP, bukan selalu dark
  const [isDarkMode, setIsDarkMode] = useState<boolean>(getSystemPrefersDark);

  useEffect(() => {
    // Load saved preference — jika user pernah set manual, pakai itu
    const loadDarkMode = async () => {
      try {
        const saved = await storage.get(DARK_MODE_KEY);
        const resolved = saved !== null ? saved === 'true' : getSystemPrefersDark();
        setIsDarkMode(resolved);
        await syncStatusBar(resolved);
      } catch {
        const fallback = getSystemPrefersDark();
        setIsDarkMode(fallback);
        await syncStatusBar(fallback);
      }
    };
    loadDarkMode();

    // ✅ FIX: Dengarkan perubahan tema sistem HP secara real-time
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = async (e: MediaQueryListEvent) => {
      // Hanya ikut sistem jika user belum pernah set manual
      const saved = await storage.get(DARK_MODE_KEY).catch(() => null);
      if (saved === null) {
        setIsDarkMode(e.matches);
        await syncStatusBar(e.matches);
      }
    };

    mq.addEventListener('change', handleSystemChange);
    return () => mq.removeEventListener('change', handleSystemChange);
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode(prev => {
      const newValue = !prev;
      storage.set(DARK_MODE_KEY, String(newValue));
      syncStatusBar(newValue);
      return newValue;
    });
  };

  const setDarkMode = (value: boolean) => {
    setIsDarkMode(value);
    storage.set(DARK_MODE_KEY, String(value));
    syncStatusBar(value);
  };

  return (
    <DarkModeContext.Provider value={{ isDarkMode, toggleDarkMode, setDarkMode }}>
      {children}
    </DarkModeContext.Provider>
  );
}

export function useDarkMode() {
  const context = useContext(DarkModeContext);
  if (context === undefined) {
    return { isDarkMode: getSystemPrefersDark(), toggleDarkMode: () => {}, setDarkMode: () => {} };
  }
  return context;
}