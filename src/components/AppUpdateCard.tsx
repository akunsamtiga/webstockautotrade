'use client';
// components/AppUpdateCard.tsx
// ✅ v5 — Dark mode support via useDarkMode context

import { useEffect, useState, useCallback, useRef } from 'react';
import { checkForUpdate, UpdateCheckResult } from '@/lib/appUpdateApi';
import { APP_VERSION_NAME } from '@/lib/appVersion';
import { useDarkMode } from '@/lib/DarkModeContext';

// ── State ──────────────────────────────────────────────────────────────────────
type CardState =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'update-available'
  | 'downloading'
  | 'installing'
  | 'done'
  | 'error';

// ── isCapacitorNative ──────────────────────────────────────────────────────────
function isCapacitorNative(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as any).Capacitor?.isNativePlatform?.() === true
  );
}

// ── getApkInstallerPlugin ──────────────────────────────────────────────────────
function getApkInstallerPlugin(): any | null {
  if (!isCapacitorNative()) return null;
  const plugins = (window as any).Capacitor?.Plugins;
  return plugins?.ApkInstaller ?? null;
}

// ── downloadWithProgressWeb ────────────────────────────────────────────────────
function downloadWithProgressWeb(
  url: string,
  onProgress: (pct: number) => void,
  onDone: (blob: Blob) => void,
  onError: (msg: string) => void,
): () => void {
  const xhr = new XMLHttpRequest();
  let aborted = false;

  xhr.open('GET', url, true);
  xhr.responseType = 'blob';

  xhr.onprogress = (e) => {
    if (aborted) return;
    if (e.lengthComputable && e.total > 0) {
      onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    } else {
      onProgress(-1);
    }
  };

  xhr.onload = () => {
    if (aborted) return;
    if (xhr.status >= 200 && xhr.status < 300) {
      onProgress(100);
      onDone(xhr.response as Blob);
    } else {
      onError(`Download gagal (HTTP ${xhr.status})`);
    }
  };

  xhr.onerror   = () => { if (!aborted) onError('Download gagal. Periksa koneksi.'); };
  xhr.ontimeout = () => { if (!aborted) onError('Download timeout. Coba lagi.'); };
  xhr.timeout   = 5 * 60 * 1000;
  xhr.send();

  return () => { aborted = true; xhr.abort(); };
}

// ── triggerInstallWeb ──────────────────────────────────────────────────────────
async function triggerInstallWeb(blob: Blob, originalUrl: string): Promise<void> {
  const blobUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href     = blobUrl;
    a.download = 'app-update.apk';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
  } catch {
    URL.revokeObjectURL(blobUrl);
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: originalUrl, presentationStyle: 'fullscreen' });
    } catch {
      window.open(originalUrl, '_blank', 'noopener,noreferrer');
    }
  }
}

// ── buildColors ────────────────────────────────────────────────────────────────
function buildColors(dark: boolean) {
  if (dark) {
    return {
      card:         'rgb(28,28,30)',
      cardBorder:   'rgba(255,255,255,0.10)',
      cardShadow:   '0 1px 0 rgba(0,0,0,0.30), 0 2px 10px rgba(0,0,0,0.25)',
      text:         'rgba(255,255,255,0.92)',
      subtext:      'rgba(235,235,245,0.55)',
      muted:        'rgba(235,235,245,0.40)',
      divider:      'rgba(255,255,255,0.07)',
      trackBg:      'rgba(255,255,255,0.06)',
      badgeGreen:   'rgba(52,199,89,0.18)',
      badgeGreenTx: '#34C759',
      badgeBlue:    'rgba(10,132,255,0.18)',
      badgeBlueTx:  '#0A84FF',
      badgeRed:     'rgba(255,69,58,0.18)',
      badgeRedTx:   '#FF453A',
      iconBg:       'rgba(10,132,255,0.18)',
      btnPrimary:   '#0A84FF',
      btnSecondary: 'rgba(118,118,128,0.18)',
      btnSecTx:     'rgba(235,235,245,0.75)',
      spinner:      'rgba(235,235,245,0.30)',
      progressFill: '#0A84FF',
      progressBg:   'rgba(10,132,255,0.15)',
    };
  }

  return {
    card:         '#FFFFFF',
    cardBorder:   'rgba(60,60,67,0.12)',
    cardShadow:   '0 1px 0 rgba(0,0,0,0.04), 0 2px 10px rgba(0,0,0,0.04)',
    text:         '#1c1c1e',
    subtext:      '#6e6e73',
    muted:        '#8e8e93',
    divider:      'rgba(60,60,67,0.07)',
    trackBg:      'rgba(60,60,67,0.06)',
    badgeGreen:   'rgba(52,199,89,0.12)',
    badgeGreenTx: '#1D7D37',
    badgeBlue:    'rgba(0,122,255,0.10)',
    badgeBlueTx:  '#007AFF',
    badgeRed:     'rgba(255,59,48,0.10)',
    badgeRedTx:   '#ff3b30',
    iconBg:       'rgba(0,122,255,0.10)',
    btnPrimary:   '#007AFF',
    btnSecondary: 'rgba(116,116,128,0.12)',
    btnSecTx:     '#3c3c43',
    spinner:      'rgba(60,60,67,0.30)',
    progressFill: '#007AFF',
    progressBg:   'rgba(0,122,255,0.10)',
  };
}

// ── AppUpdateCard (main export) ────────────────────────────────────────────────
export function AppUpdateCard() {
  const { isDarkMode } = useDarkMode();
  const colors = buildColors(isDarkMode);

  const [result,    setResult]    = useState<UpdateCheckResult | null>(null);
  const [cardState, setCardState] = useState<CardState>('idle');
  const [progress,  setProgress]  = useState(0);

  const webAbortRef  = useRef<(() => void) | null>(null);
  const listenerRef  = useRef<{ remove: () => void } | null>(null);

  // ── Cek update ───────────────────────────────────────────────────────────────
  const runCheck = useCallback(async () => {
    setCardState('checking');
    setProgress(0);
    try {
      const res = await checkForUpdate();
      setResult(res);
      setCardState(
        res.error       ? 'error'
        : res.hasUpdate ? 'update-available'
        : 'up-to-date'
      );
    } catch {
      setCardState('error');
    }
  }, []);

  useEffect(() => { runCheck(); }, [runCheck]);

  // ── Cleanup saat unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      webAbortRef.current?.();
      listenerRef.current?.remove();
    };
  }, []);

  // ── handleDownload ────────────────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    const url = result?.resolvedDownloadUrl;
    if (!url || cardState === 'downloading' || cardState === 'installing') return;

    setCardState('downloading');
    setProgress(0);

    const plugin = getApkInstallerPlugin();

    if (plugin) {
      try {
        const listener = await plugin.addListener(
          'downloadProgress',
          (event: { progress: number }) => { setProgress(event.progress); },
        );
        listenerRef.current = listener;

        await plugin.downloadAndInstall({ url });

        setProgress(100);
        setCardState('installing');
        setTimeout(() => setCardState('done'), 2000);

      } catch (err: any) {
        const msg: string = err?.message ?? 'Download gagal';
        if (!msg.includes('dibatalkan') && !msg.includes('cancelled')) {
          console.error('[AppUpdateCard]', msg);
          setResult(prev => prev ? { ...prev, error: msg } : prev);
        }
        setCardState('update-available');
        setProgress(0);
      } finally {
        listenerRef.current?.remove();
        listenerRef.current = null;
      }
    } else {
      webAbortRef.current = downloadWithProgressWeb(
        url,
        (pct) => setProgress(pct),
        async (blob) => {
          setCardState('installing');
          setProgress(100);
          await triggerInstallWeb(blob, url);
          setTimeout(() => setCardState('done'), 1500);
          webAbortRef.current = null;
        },
        (msg) => {
          console.error('[AppUpdateCard]', msg);
          setResult(prev => prev ? { ...prev, error: msg } : prev);
          setCardState('update-available');
          setProgress(0);
          webAbortRef.current = null;
        },
      );
    }
  }, [result, cardState]);

  // ── handleCancel ─────────────────────────────────────────────────────────────
  const handleCancel = useCallback(async () => {
    const plugin = getApkInstallerPlugin();

    if (plugin) {
      try { await plugin.cancelDownload(); } catch { /* ignore */ }
    } else {
      webAbortRef.current?.();
      webAbortRef.current = null;
    }

    listenerRef.current?.remove();
    listenerRef.current = null;

    setCardState('update-available');
    setProgress(0);
  }, []);

  // ── Mandatory overlay ────────────────────────────────────────────────────────
  if (result?.isMandatory && cardState === 'update-available') {
    return (
      <>
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 24px',
        }}>
          <div style={{
            background: colors.card, borderRadius: 20,
            padding: '32px 24px 28px', maxWidth: 360, width: '100%',
            textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🚀</div>
            <p style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: colors.text }}>
              Pembaruan Wajib
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: colors.subtext, lineHeight: 1.5 }}>
              Versi {result.latest?.versionName} wajib diinstall untuk melanjutkan.
            </p>
            <button
              onClick={handleDownload}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 12,
                border: 'none', background: colors.btnPrimary, color: '#fff',
                fontSize: 15, fontWeight: 700, cursor: 'pointer',
              }}
            >
              ⬇ Download Sekarang
            </button>
          </div>
        </div>

        <CardShell
          colors={colors} cardState={cardState} result={result}
          progress={progress} onCheck={runCheck}
          onDownload={handleDownload} onCancel={handleCancel}
        />
      </>
    );
  }

  return (
    <CardShell
      colors={colors} cardState={cardState} result={result}
      progress={progress} onCheck={runCheck}
      onDownload={handleDownload} onCancel={handleCancel}
    />
  );
}

// ── CardShell ──────────────────────────────────────────────────────────────────
type Colors = ReturnType<typeof buildColors>;

interface ShellProps {
  colors:     Colors;
  cardState:  CardState;
  result:     UpdateCheckResult | null;
  progress:   number;
  onCheck:    () => void;
  onDownload: () => void;
  onCancel:   () => void;
}

function CardShell({ colors, cardState, result, progress, onCheck, onDownload, onCancel }: ShellProps) {
  const isChecking    = cardState === 'checking';
  const isDownloading = cardState === 'downloading';
  const isInstalling  = cardState === 'installing';
  const isBusy        = isDownloading || isInstalling;
  const isDone        = cardState === 'done';

  const StatusBadge = () => {
    switch (cardState) {
      case 'checking':
        return <Badge bg={colors.badgeBlue} tx={colors.badgeBlueTx} label="Memeriksa..." />;
      case 'up-to-date':
        return <Badge bg={colors.badgeGreen} tx={colors.badgeGreenTx} label="✓ Terbaru" />;
      case 'update-available':
        return <Badge bg={colors.badgeBlue} tx={colors.badgeBlueTx} label={`v${result?.latest?.versionName} tersedia`} />;
      case 'downloading':
        return <Badge bg={colors.badgeBlue} tx={colors.badgeBlueTx} label={progress < 0 ? 'Mengunduh…' : `${Math.max(0, progress)}%`} />;
      case 'installing':
        return <Badge bg={colors.badgeGreen} tx={colors.badgeGreenTx} label="Memproses…" />;
      case 'done':
        return <Badge bg={colors.badgeGreen} tx={colors.badgeGreenTx} label="✓ Selesai" />;
      case 'error':
        return <Badge bg={colors.badgeBlue} tx={colors.badgeBlueTx} label="Terbaru" />;
      default:
        return null;
    }
  };

  return (
    <div style={{
      background:   colors.card,
      borderRadius: 16,
      border:       `1px solid ${colors.cardBorder}`,
      boxShadow:    colors.cardShadow,
      overflow:     'hidden',
      marginBottom: 12,
    }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
        <div style={{
          width: 30, height: 30, borderRadius: 7,
          background: 'linear-gradient(135deg, #007aff, #5ac8fa)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: colors.text,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Pembaruan Aplikasi
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: colors.subtext }}>
            Versi saat ini:{' '}
            <strong style={{ color: colors.muted, fontWeight: 600 }}>v{APP_VERSION_NAME}</strong>
          </p>
        </div>

        <StatusBadge />
      </div>

      {/* ── Divider ─────────────────────────────────────────────────────── */}
      <div style={{ height: 1, background: colors.divider, margin: '0 16px' }} />

      {/* ── Progress: tampil saat downloading / installing ───────────────── */}
      {isBusy && (
        <div style={{ padding: '12px 16px 0' }}>
          <ProgressSection colors={colors} progress={progress} installing={isInstalling} />
        </div>
      )}

      {/* ── Body: update tersedia ────────────────────────────────────────── */}
      {cardState === 'update-available' && result?.latest && (
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 10,
            background: colors.badgeBlue, marginBottom: 10,
          }}>
            <span style={{ fontSize: 20 }}>✨</span>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.badgeBlueTx }}>
                Versi {result.latest.versionName} tersedia!
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: colors.subtext }}>
                {result.latest.isMandatory ? 'Pembaruan wajib' : 'Pembaruan opsional'}
              </p>
            </div>
          </div>

          {result.latest.releaseNotes ? (
            <div style={{
              padding: '10px 12px', borderRadius: 10,
              background: colors.btnSecondary, marginBottom: 12,
            }}>
              <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 600, color: colors.subtext,
                textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Apa yang baru
              </p>
              <p style={{ margin: 0, fontSize: 12, color: colors.text, lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                {result.latest.releaseNotes}
              </p>
            </div>
          ) : null}

          {result.error && (
            <p style={{ margin: '0 0 12px', fontSize: 12, color: colors.badgeRedTx, lineHeight: 1.5 }}>
              {result.error}
            </p>
          )}
        </div>
      )}

      {/* ── Body: done ───────────────────────────────────────────────────── */}
      {isDone && (
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 10,
            background: colors.badgeGreen,
          }}>
            <span style={{ fontSize: 20 }}>✅</span>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: colors.badgeGreenTx }}>
              APK berhasil diunduh. Ikuti instruksi instalasi di perangkat Anda.
            </p>
          </div>
        </div>
      )}

      {/* ── Body: error ──────────────────────────────────────────────────── */}
      {cardState === 'error' && result?.error && (
        <div style={{ padding: '10px 16px 0' }}>
          <p style={{ margin: 0, fontSize: 12, color: colors.badgeRedTx, lineHeight: 1.5 }}>
            {result.error}
          </p>
        </div>
      )}

      {/* ── Tombol ───────────────────────────────────────────────────────── */}
      <div style={{ padding: 16, display: 'flex', gap: 8 }}>
        {isBusy ? (
          <button
            onClick={onCancel}
            disabled={isInstalling}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 10, border: 'none',
              background: isInstalling ? colors.btnSecondary : colors.badgeRed,
              color: isInstalling ? colors.subtext : colors.badgeRedTx,
              fontSize: 14, fontWeight: 600,
              cursor: isInstalling ? 'default' : 'pointer',
              opacity: isInstalling ? 0.6 : 1,
              transition: 'all 0.15s',
            }}
          >
            {isInstalling ? 'Memproses instalasi…' : '✕ Batalkan'}
          </button>

        ) : cardState === 'update-available' ? (
          <>
            <button
              onClick={onDownload}
              style={{
                flex: 1, padding: '11px 0', borderRadius: 10,
                border: 'none', background: colors.btnPrimary, color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              } as React.CSSProperties}
            >
              ⬇ Perbarui Sekarang
            </button>
            <button
              onClick={onCheck}
              disabled={isChecking}
              style={{
                padding: '11px 14px', borderRadius: 10,
                border: 'none', background: colors.btnSecondary,
                color: colors.btnSecTx, fontSize: 13, fontWeight: 600,
                cursor: isChecking ? 'default' : 'pointer',
                WebkitTapHighlightColor: 'transparent',
              } as React.CSSProperties}
            >
              ↻
            </button>
          </>

        ) : isDone ? (
          <button
            onClick={onCheck}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 10,
              border: 'none', background: colors.btnSecondary,
              color: colors.btnSecTx, fontSize: 14, fontWeight: 600,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            } as React.CSSProperties}
          >
            ↻ Cek Ulang
          </button>

        ) : (
          <button
            onClick={onCheck}
            disabled={isChecking}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 10,
              border: 'none', background: colors.btnSecondary,
              color: isChecking ? colors.spinner : colors.btnSecTx,
              fontSize: 14, fontWeight: 600,
              cursor: isChecking ? 'default' : 'pointer',
              transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              WebkitTapHighlightColor: 'transparent',
            } as React.CSSProperties}
          >
            {isChecking
              ? <><SpinnerIcon color={colors.spinner} /> Memeriksa...</>
              : '↻ Cek Pembaruan'
            }
          </button>
        )}
      </div>
    </div>
  );
}

// ── ProgressSection ────────────────────────────────────────────────────────────
function ProgressSection({
  colors, progress, installing,
}: { colors: Colors; progress: number; installing: boolean }) {
  const isIndeterminate = progress < 0;
  const pct             = isIndeterminate ? 0 : Math.max(0, Math.min(100, progress));

  return (
    <div style={{
      padding: '12px 14px', borderRadius: 12,
      background: colors.progressBg,
      marginBottom: 4,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: colors.badgeBlueTx }}>
          {installing ? '⚙ Menyiapkan instalasi…' : '⬇ Mengunduh pembaruan…'}
        </span>
        <span style={{
          fontSize: 12, fontWeight: 700, color: colors.badgeBlueTx,
          fontVariantNumeric: 'tabular-nums',
        } as React.CSSProperties}>
          {isIndeterminate ? '···' : `${pct}%`}
        </span>
      </div>

      <div style={{
        height: 6, borderRadius: 99,
        background: colors.progressBg,
        overflow: 'hidden', position: 'relative',
      }}>
        {isIndeterminate ? (
          <div style={{
            position: 'absolute', top: 0, height: '100%',
            width: '40%', borderRadius: 99,
            background: colors.progressFill,
            animation: 'stc-slide 1.2s cubic-bezier(0.4,0,0.6,1) infinite',
          }} />
        ) : (
          <div style={{
            height: '100%', borderRadius: 99,
            background: installing ? colors.badgeGreenTx : colors.progressFill,
            width: `${pct}%`,
            transition: 'width 0.3s ease, background 0.4s ease',
          }} />
        )}
      </div>

      <p style={{ margin: '7px 0 0', fontSize: 11, color: colors.subtext }}>
        {installing
          ? 'Buka dialog instalasi di perangkat Anda'
          : isIndeterminate
            ? 'Menghitung ukuran file…'
            : pct < 100
              ? 'Jangan tutup aplikasi selama proses unduhan'
              : 'Unduhan selesai, mempersiapkan instalasi…'
        }
      </p>

      <style>{`
        @keyframes stc-slide {
          0%   { left: -45%; }
          100% { left: 105%; }
        }
        @keyframes stc-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ── Badge ──────────────────────────────────────────────────────────────────────
function Badge({ bg, tx, label }: { bg: string; tx: string; label: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 8px', borderRadius: 99,
      background: bg, color: tx,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

// ── SpinnerIcon ────────────────────────────────────────────────────────────────
function SpinnerIcon({ color }: { color: string }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: 'stc-spin 0.8s linear infinite', flexShrink: 0 }}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}