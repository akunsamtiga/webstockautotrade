'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { storage } from './storage';

const DARK_MODE_KEY = 'stc_dark_mode';

interface DarkModeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  setDarkMode: (value: boolean) => void;
}

const DarkModeContext = createContext<DarkModeContextType | undefined>(undefined);

export function DarkModeProvider({ children }: { children: ReactNode }) {
  const [isDarkMode, setIsDarkMode] = useState(true); // default dark mode for dashboard

  useEffect(() => {
    // Load saved preference
    const loadDarkMode = async () => {
      try {
        const saved = await storage.get(DARK_MODE_KEY);
        if (saved !== null) {
          setIsDarkMode(saved === 'true');
        }
      } catch {
        // Default to dark mode
      }
    };
    loadDarkMode();
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode(prev => {
      const newValue = !prev;
      storage.set(DARK_MODE_KEY, String(newValue));
      return newValue;
    });
  };

  const setDarkMode = (value: boolean) => {
    setIsDarkMode(value);
    storage.set(DARK_MODE_KEY, String(value));
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
    // Return default values if used outside provider (e.g., in non-dashboard pages)
    return { isDarkMode: true, toggleDarkMode: () => {}, setDarkMode: () => {} };
  }
  return context;
}
