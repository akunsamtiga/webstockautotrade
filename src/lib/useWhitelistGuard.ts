// lib/useWhitelistGuard.ts
// ✅ Hook — cek status whitelist user secara berkala + realtime Supabase
//
// Cara kerja:
//  1. Ambil email dari session storage
//  2. Cek `isWhitelisted(email)` saat mount (setelah session valid)
//  3. Re-check setiap CHECK_INTERVAL_MS (5 menit)
//  4. Subscribe ke Supabase realtime → user diblokir langsung terdeteksi
//     tanpa perlu tunggu interval berikutnya
//  5. Return { isBlocked, isChecking } — ClientLayout pakai ini untuk
//     menampilkan overlay & melakukan auto-logout

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { storage, SESSION_KEYS } from './storage';
import { isWhitelisted } from './supabaseRepository';
import { supabase } from './supabase';

// ── Konfigurasi ───────────────────────────────────────────────────────────────
const CHECK_INTERVAL_MS  = 5 * 60 * 1000; // Re-check setiap 5 menit
const INITIAL_DELAY_MS   = 2_000;          // Tunda 2 detik setelah mount agar session settle
const RETRY_ON_ERROR_MS  = 30_000;         // Jika cek gagal (network error), retry 30 detik

export interface WhitelistGuardState {
  /** true = user terkonfirmasi diblokir / dihapus dari whitelist */
  isBlocked:  boolean;
  /** true = sedang melakukan pengecekan pertama (initial check belum selesai) */
  isChecking: boolean;
  /** Email user saat ini (diisi setelah session dibaca) */
  email:      string | null;
}

export function useWhitelistGuard(
  /** Pass false untuk non-protected routes (login, register) — hook jadi no-op */
  enabled: boolean,
): WhitelistGuardState {
  const [state, setState] = useState<WhitelistGuardState>({
    isBlocked:  false,
    isChecking: true,
    email:      null,
  });

  const emailRef       = useRef<string | null>(null);
  const blockedRef     = useRef(false);       // hindari double-dispatch
  const intervalRef    = useRef<ReturnType<typeof setInterval>>();
  const channelRef     = useRef<ReturnType<typeof supabase.channel>>();
  const mountedRef     = useRef(true);

  // ── Fungsi inti: ambil email + cek whitelist ──────────────────────────────
  const runCheck = useCallback(async (isInitial = false): Promise<void> => {
    if (!mountedRef.current) return;

    // Ambil email dari session (lazy — sekali saja)
    if (!emailRef.current) {
      const email = await storage.get(SESSION_KEYS.EMAIL);
      if (!email) {
        // Tidak ada session email — bukan urusan hook ini, biarkan ClientLayout handle
        if (mountedRef.current) {
          setState(prev => ({ ...prev, isChecking: false }));
        }
        return;
      }
      emailRef.current = email;
      if (mountedRef.current) {
        setState(prev => ({ ...prev, email }));
      }
    }

    try {
      const allowed = await isWhitelisted(emailRef.current!);

      if (!mountedRef.current) return;

      if (!allowed && !blockedRef.current) {
        blockedRef.current = true;
        console.warn('[WhitelistGuard] User diblokir:', emailRef.current);
        setState({ isBlocked: true, isChecking: false, email: emailRef.current });
      } else if (allowed && isInitial) {
        // Hanya update isChecking pada initial check — jangan reset isBlocked ke false
        // setelah blocked (hindari flicker jika ada race condition)
        setState(prev => ({ ...prev, isChecking: false }));
      }
    } catch (err) {
      console.warn('[WhitelistGuard] Check error:', err);
      if (mountedRef.current && isInitial) {
        setState(prev => ({ ...prev, isChecking: false }));
      }
      // Jika error (network), jadwalkan retry lebih cepat dari interval normal
      if (mountedRef.current) {
        clearInterval(intervalRef.current);
        setTimeout(() => {
          if (mountedRef.current) {
            runCheck();
            intervalRef.current = setInterval(() => runCheck(), CHECK_INTERVAL_MS);
          }
        }, RETRY_ON_ERROR_MS);
      }
    }
  }, []);

  // ── Setup realtime subscription ke tabel whitelist_users ─────────────────
  const setupRealtime = useCallback((email: string) => {
    // Unsubscribe dulu jika sudah ada channel lama
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    channelRef.current = supabase
      .channel(`whitelist_guard:${email}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'whitelist_users',
          filter: `email=eq.${email.toLowerCase().trim()}`,
        },
        (payload) => {
          if (!mountedRef.current) return;
          console.log('[WhitelistGuard] Realtime update:', payload.eventType, payload.new);

          // DELETE → langsung blokir
          if (payload.eventType === 'DELETE') {
            if (!blockedRef.current) {
              blockedRef.current = true;
              setState({ isBlocked: true, isChecking: false, email });
            }
            return;
          }

          // UPDATE → cek is_active
          const row = payload.new as { is_active?: boolean };
          if (payload.eventType === 'UPDATE' && row.is_active === false) {
            if (!blockedRef.current) {
              blockedRef.current = true;
              setState({ isBlocked: true, isChecking: false, email });
            }
            return;
          }

          // INSERT atau UPDATE is_active=true → user dipulihkan, re-check
          runCheck();
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[WhitelistGuard] Realtime subscribed untuk:', email);
        }
      });
  }, [runCheck]);

  // ── Effect utama ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) {
      setState({ isBlocked: false, isChecking: false, email: null });
      return;
    }

    mountedRef.current  = true;
    blockedRef.current  = false;

    // Tunda initial check agar session (localStorage) sempat ter-load
    const initTimer = setTimeout(async () => {
      await runCheck(true);

      // Setup realtime jika email sudah diketahui
      if (emailRef.current) {
        setupRealtime(emailRef.current);
      }

      // Interval periodik (fallback jika realtime tidak tersedia)
      intervalRef.current = setInterval(() => runCheck(), CHECK_INTERVAL_MS);
    }, INITIAL_DELAY_MS);

    return () => {
      mountedRef.current = false;
      clearTimeout(initTimer);
      clearInterval(intervalRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = undefined;
      }
    };
  }, [enabled, runCheck, setupRealtime]);

  return state;
}