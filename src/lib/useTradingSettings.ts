// lib/useTradingSettings.ts
// ✅ Custom hook — persist & restore pengaturan trading terakhir di dashboard
// Simpan ke localStorage (via storage.ts) setiap kali settings berubah.
// Di-load kembali saat dashboard dibuka.

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { storage } from './storage';

// ── Types (harus sama dengan page.tsx) ────────────────────────────────────────
type TradingMode      = 'schedule' | 'fastrade' | 'ctc' | 'aisignal' | 'indicator' | 'momentum';
type FastTradeTimeframe = '1m' | '5m' | '15m' | '30m' | '1h';
type IndicatorType    = 'SMA' | 'EMA' | 'RSI';

interface MartingaleConfig {
  enabled:      boolean;
  maxStep:      number;
  multiplier:   number;
  alwaysSignal?: boolean;
}

interface MomentumPatterns {
  candleSabit:      boolean;
  dojiTerjepit:     boolean;
  dojiPembatalan:   boolean;
  bbSarBreak:       boolean;
}

export interface TradingSettings {
  tradingMode:          TradingMode;
  selectedRic:          string;
  isDemo:               boolean;
  duration:             number;
  amount:               number;
  martingale:           MartingaleConfig;
  ftTf:                 FastTradeTimeframe;
  stopLoss:             number;
  stopProfit:           number;
  indicatorType:        IndicatorType;
  indicatorPeriod:      number;
  indicatorSensitivity: number;
  rsiOverbought:        number;
  rsiOversold:          number;
  momentumPatterns:     MomentumPatterns;
}

// ── Default values — identik dengan useState defaults di page.tsx ─────────────
const DEFAULTS: TradingSettings = {
  tradingMode:          'schedule',
  selectedRic:          '',
  isDemo:               true,
  duration:             60,
  amount:               50_000,
  martingale:           { enabled: false, maxStep: 3, multiplier: 2.5, alwaysSignal: false },
  ftTf:                 '1m',
  stopLoss:             0,
  stopProfit:           0,
  indicatorType:        'SMA',
  indicatorPeriod:      14,
  indicatorSensitivity: 0.5,
  rsiOverbought:        70,
  rsiOversold:          30,
  momentumPatterns:     { candleSabit: true, dojiTerjepit: true, dojiPembatalan: true, bbSarBreak: true },
};

const STORAGE_KEY  = 'stc_trading_settings';
const SAVE_DELAY   = 500; // debounce ms — tidak menyimpan setiap keystroke

// ── Helpers ───────────────────────────────────────────────────────────────────
function mergeWithDefaults(saved: Partial<TradingSettings>): TradingSettings {
  return {
    ...DEFAULTS,
    ...saved,
    // Deep merge untuk object fields agar field baru di DEFAULTS tidak hilang
    martingale:       { ...DEFAULTS.martingale,       ...(saved.martingale       ?? {}) },
    momentumPatterns: { ...DEFAULTS.momentumPatterns, ...(saved.momentumPatterns ?? {}) },
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useTradingSettings() {
  const [settings, setSettings] = useState<TradingSettings>(DEFAULTS);
  const [loaded,   setLoaded]   = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load sekali saat mount ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await storage.get(STORAGE_KEY);
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw) as Partial<TradingSettings>;
          setSettings(mergeWithDefaults(parsed));
        }
      } catch (e) {
        console.warn('[useTradingSettings] Failed to load:', e);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Save dengan debounce ────────────────────────────────────────────────────
  const save = useCallback((next: TradingSettings) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      storage.set(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    }, SAVE_DELAY);
  }, []);

  // ── Setter yang sekaligus menyimpan ────────────────────────────────────────
  const update = useCallback(<K extends keyof TradingSettings>(
    key: K,
    value: TradingSettings[K],
  ) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      save(next);
      return next;
    });
  }, [save]);

  // Versi batch update (untuk perubahan banyak field sekaligus)
  const updateMany = useCallback((partial: Partial<TradingSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      save(next);
      return next;
    });
  }, [save]);

  return { settings, loaded, update, updateMany };
}