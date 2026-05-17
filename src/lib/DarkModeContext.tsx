'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { storage } from './storage';

const DARK_MODE_KEY = 'stc_dark_mode';

// ── Helper: baca preferensi sistem HP (hanya dipakai sebagai fallback sekunder) ─
function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// ✅ App default: selalu dark mode, kecuali user pernah set manual
const APP_DEFAULT_DARK = true;

interface DarkModeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  setDarkMode: (value: boolean) => void;
}

const DarkModeContext = createContext<DarkModeContextType | undefined>(undefined);

export function DarkModeProvider({ children }: { children: ReactNode }) {
  // ✅ Default SELALU dark — tidak ikut preferensi sistem HP.
  //    Jika user belum pernah set manual, app selalu buka dalam dark mode.
  const [isDarkMode, setIsDarkMode] = useState<boolean>(APP_DEFAULT_DARK);

  useEffect(() => {
    // Load saved preference — jika user pernah set manual, pakai itu
    // ✅ FIX: Tidak memanggil syncStatusBar/syncNavBar di sini.
    //    ThemeWrapper di ClientLayout adalah SATU-SATUNYA tempat sync native bars,
    //    sehingga tidak ada race condition antara dua caller yang berebut set StatusBar.
    const loadDarkMode = async () => {
      try {
        const saved = await storage.get(DARK_MODE_KEY);
        // ✅ Jika user belum pernah set manual (null) → pakai APP_DEFAULT_DARK (dark)
        //    Jika sudah pernah set → ikut pilihan user
        const resolved = saved !== null ? saved === 'true' : APP_DEFAULT_DARK;
        setIsDarkMode(resolved);
      } catch {
        // Error storage → tetap dark (default)
        setIsDarkMode(APP_DEFAULT_DARK);
      }
    };
    loadDarkMode();

    // ✅ DIHAPUS: listener sistem HP tidak dipakai lagi.
    //    App punya default sendiri (dark). User bisa ubah manual via toggle settings.
    //    Mengikuti sistem HP menyebabkan konflik saat HP user di light mode.
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode(prev => {
      const newValue = !prev;
      storage.set(DARK_MODE_KEY, String(newValue));
      // ✅ FIX: Tidak panggil syncStatusBar di sini.
      //    State update akan trigger useEffect di ThemeWrapper → sync bars sekali.
      return newValue;
    });
  };

  const setDarkMode = (value: boolean) => {
    setIsDarkMode(value);
    storage.set(DARK_MODE_KEY, String(value));
    // ✅ FIX: Tidak panggil syncStatusBar di sini.
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
    // ✅ Fallback juga dark (konsisten dengan APP_DEFAULT_DARK)
    return { isDarkMode: APP_DEFAULT_DARK, toggleDarkMode: () => {}, setDarkMode: () => {} };
  }
  return context;
}