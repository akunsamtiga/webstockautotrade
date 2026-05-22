'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, type ExecutionLog, type FastradeLog, type IndicatorLog, type MomentumLog } from '@/lib/api';
import { storage } from '@/lib/storage';
import { LanguageProvider, useLanguage, formatDate, formatTime, Language } from '@/lib';
import { useDarkMode } from '@/lib/DarkModeContext';
import {
  TrendingUp, TrendingDown, Filter, History, RotateCcw,
  ArrowUpRight, ArrowDownRight, BarChart3, ChevronRight,
  CheckCircle, XCircle, MinusCircle,
} from 'lucide-react';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
type LogType      = 'all' | 'schedule' | 'fastrade' | 'ctc' | 'indicator' | 'momentum';
type ResultFilter = 'all' | 'win' | 'loss' | 'draw';
type DateFilter   = 'all' | 'today' | 'week' | 'month';

interface CombinedLog {
  id: string;
  type: 'schedule' | 'fastrade' | 'ctc' | 'indicator' | 'momentum';
  time: string;
  trend: 'call' | 'put';
  amount: number;
  result?: 'WIN' | 'LOSE' | 'DRAW' | 'LOSS';
  profit?: number;
  martingaleStep?: number;
  executedAt: number;
  note?: string;
}

// ─────────────────────────────────────────────
// SKELETON
// ─────────────────────────────────────────────
const Skel: React.FC<{ w?: number | string; h?: number; r?: number; dark?: boolean }> = ({
  w = '100%', h = 14, r = 6, dark = false,
}) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(60,60,67,0.08)',
    animation: 'skel-pulse 1.6s ease-in-out infinite',
  }} />
);

// ─────────────────────────────────────────────
// MAIN CONTENT
// ─────────────────────────────────────────────
function HistoryPageContent() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const { isDarkMode } = useDarkMode();

  // ── Dark Mode Theme ──────────────────────────────────────────────────────────
  const D = isDarkMode;
  const th = {
    pageBg:        D ? '#000000'                        : '#f2f2f7',
    cardBg:        D ? '#1c1c1e'                        : '#ffffff',
    headerBg:      D ? 'rgba(28,28,30,0.94)'            : 'rgba(242,242,247,0.92)',
    sidebarBg:     D ? 'rgba(22,22,24,0.7)'             : 'rgba(228,228,235,0.55)',
    sidebarBorder: D ? 'rgba(255,255,255,0.08)'         : 'rgba(60,60,67,0.11)',
    textPrimary:   D ? '#ffffff'                        : '#1c1c1e',
    textSecondary: D ? 'rgba(235,235,245,0.60)'         : '#3c3c43',
    textTertiary:  D ? 'rgba(235,235,245,0.40)'         : '#6e6e73',
    textQuaternary:D ? 'rgba(235,235,245,0.25)'         : '#8e8e93',
    textFaint:     D ? 'rgba(235,235,245,0.18)'         : '#aeaeb2',
    textPlaceholder:D? 'rgba(235,235,245,0.12)'         : '#c7c7cc',
    separator:     D ? 'rgba(84,84,88,0.40)'            : 'rgba(60,60,67,0.07)',
    border:        D ? 'rgba(84,84,88,0.55)'            : 'rgba(60,60,67,0.14)',
    borderFaint:   D ? 'rgba(84,84,88,0.30)'            : 'rgba(60,60,67,0.10)',
    btnBg:         D ? 'rgba(255,255,255,0.08)'         : 'rgba(0,0,0,0.05)',
    labelBg:       D ? 'rgba(255,255,255,0.07)'         : 'rgba(60,60,67,0.06)',
    monoBg:        D ? 'rgba(255,255,255,0.08)'         : 'rgba(60,60,67,0.06)',
    inputBg:       D ? 'rgba(255,255,255,0.10)'         : 'rgba(116,116,128,0.12)',
    cardShadow:    D
      ? '0 1px 0 rgba(255,255,255,0.04), 0 2px 12px rgba(0,0,0,0.35)'
      : '0 1px 0 rgba(0,0,0,0.04), 0 2px 12px rgba(0,0,0,0.04)',
    // Desktop-specific
    deskSidebarBg: D ? '#0d0d0f'                        : '#f7f7fa',
    deskRowHover:  D ? 'rgba(255,255,255,0.025)'        : 'rgba(0,0,0,0.018)',
    deskTableHead: D ? 'rgba(255,255,255,0.04)'         : 'rgba(60,60,67,0.04)',
  };

  const [isLoading, setIsLoading]       = useState(true);
  const [logs, setLogs]                 = useState<CombinedLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<CombinedLog[]>([]);
  const [typeFilter, setTypeFilter]     = useState<LogType>('all');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [dateFilter, setDateFilter]     = useState<DateFilter>('all');
  const [showFilters, setShowFilters]   = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [stats, setStats] = useState({
    totalTrades: 0, wins: 0, losses: 0, draws: 0, totalPnL: 0, winRate: 0,
  });

  const getTypeLabel = (type: LogType): string => {
    const labels: Record<LogType, string> = {
      all: t('history.all'), schedule: t('history.signal'), fastrade: t('history.fastTrade'),
      ctc: t('history.ctc'), indicator: t('history.indicator'), momentum: t('history.momentum'),
    };
    return labels[type];
  };

  const getResultLabel = (result: ResultFilter): string => {
    const labels: Record<ResultFilter, string> = {
      all: t('history.all'), win: 'Profit', loss: 'Loss', draw: t('history.draw'),
    };
    return labels[result];
  };

  const getPeriodLabel = (period: DateFilter): string => {
    const labels: Record<DateFilter, string> = {
      all: t('history.all'), today: t('history.today'), week: t('history.week'), month: t('history.month'),
    };
    return labels[period];
  };

  useEffect(() => {
    const init = async () => {
      const token = await storage.get('stc_token');
      if (!token) { router.push('/login'); return; }
      loadHistory();
    };
    init();
  }, []); // eslint-disable-line

  useEffect(() => {
    if (showFilters) {
      const originalOverflow    = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;
      document.body.style.overflow    = 'hidden';
      document.body.style.touchAction = 'none';
      return () => {
        document.body.style.overflow    = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    }
  }, [showFilters]);

  const fmtTime = (ts: number) =>
    formatTime(ts, language, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  const loadHistory = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true); else setRefreshing(true);
    try {
      const [scheduleLogs, fastradeLogs, indicatorLogs, momentumLogs] = await Promise.all([
        api.scheduleLogs(200).catch(() => [] as ExecutionLog[]),
        api.fastradeLogs(200).catch(() => [] as FastradeLog[]),
        api.indicatorLogs(200).catch(() => [] as IndicatorLog[]),
        api.momentumLogs(200).catch(() => [] as MomentumLog[]),
      ]);

      const combined: CombinedLog[] = [
        ...scheduleLogs.map((l): CombinedLog => ({
          id: l.id, type: 'schedule',
          time: l.time || '--:--',
          trend: (l.trend as 'call' | 'put') || 'call',
          amount: l.amount || 0,
          result: l.result as any,
          profit: l.profit,
          martingaleStep: l.martingaleStep,
          executedAt: l.executedAt || Date.now(),
          note: l.note,
        })),
        ...fastradeLogs.map((l): CombinedLog => ({
          id: l.id, type: l.mode === 'CTC' ? 'ctc' : 'fastrade',
          time: fmtTime(l.executedAt),
          trend: (l.trend as 'call' | 'put') || 'call',
          amount: l.amount || 0,
          result: l.result as any,
          profit: l.profit,
          martingaleStep: l.martingaleStep,
          executedAt: l.executedAt,
          note: l.note,
        })),
        ...indicatorLogs.map((l): CombinedLog => ({
          id: l.id, type: 'indicator',
          time: fmtTime(l.executedAt),
          trend: (l.trend as 'call' | 'put') || 'call',
          amount: l.amount || 0,
          result: l.result as any,
          profit: l.profit,
          martingaleStep: l.martingaleStep,
          executedAt: l.executedAt,
          note: l.note ?? l.indicatorType,
        })),
        ...momentumLogs.map((l): CombinedLog => ({
          id: l.id, type: 'momentum',
          time: fmtTime(l.executedAt),
          trend: (l.trend as 'call' | 'put') || 'call',
          amount: l.amount || 0,
          result: l.result as any,
          profit: l.profit,
          martingaleStep: l.martingaleStep,
          executedAt: l.executedAt,
          note: l.note ?? l.momentumType,
        })),
      ];

      const map = new Map<string, CombinedLog>();
      for (const l of combined) {
        const ex = map.get(l.id);
        if (!ex || (!ex.result && l.result)) map.set(l.id, l);
      }
      const deduped = Array.from(map.values()).sort((a, b) => b.executedAt - a.executedAt);

      setLogs(deduped);

      const done   = deduped.filter(l => l.result);
      const wins   = done.filter(l => l.result === 'WIN').length;
      const losses = done.filter(l => l.result === 'LOSE' || l.result === 'LOSS').length;
      const draws  = done.filter(l => l.result === 'DRAW').length;
      const pnl    = deduped.reduce((s, l) => s + (l.profit || 0), 0);
      setStats({
        totalTrades: done.length, wins, losses, draws, totalPnL: pnl,
        winRate: done.length > 0 ? Math.round((wins / done.length) * 100) : 0,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false); setRefreshing(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    let f = [...logs];
    if (typeFilter !== 'all') f = f.filter(l => l.type === typeFilter);
    if (resultFilter === 'win')  f = f.filter(l => l.result === 'WIN');
    if (resultFilter === 'loss') f = f.filter(l => l.result === 'LOSE' || l.result === 'LOSS');
    if (resultFilter === 'draw') f = f.filter(l => l.result === 'DRAW');
    const ms = 24 * 60 * 60 * 1000;
    const now = Date.now();
    if (dateFilter === 'today') f = f.filter(l => now - l.executedAt < ms);
    if (dateFilter === 'week')  f = f.filter(l => now - l.executedAt < 7 * ms);
    if (dateFilter === 'month') f = f.filter(l => now - l.executedAt < 30 * ms);
    setFilteredLogs(f);
  }, [logs, typeFilter, resultFilter, dateFilter]);

  const hasActiveFilter = typeFilter !== 'all' || resultFilter !== 'all' || dateFilter !== 'all';
  const pnlPos = stats.totalPnL >= 0;

  const fmt = (n?: number) => {
    if (n == null) return '0';
    return Math.abs(n / 100).toLocaleString(language === 'en' ? 'en-US' : language === 'ru' ? 'ru-RU' : 'id-ID', { maximumFractionDigits: 0 });
  };

  const fmtDate = (ts: number) =>
    formatDate(ts, language, { day: '2-digit', month: 'short' });

  // ─────────────────────────────────────────────
  // SUB-COMPONENTS
  // ─────────────────────────────────────────────
  const TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
    schedule:  { label: t('history.signal'),    color: '#34c759', bg: 'rgba(52,199,89,0.10)'  },
    fastrade:  { label: t('history.fastTrade'), color: '#007aff', bg: 'rgba(0,122,255,0.10)'  },
    ctc:       { label: t('history.ctc'),       color: '#af52de', bg: 'rgba(175,82,222,0.10)' },
    indicator: { label: t('history.indicator'), color: '#ff9500', bg: 'rgba(255,149,0,0.10)'  },
    momentum:  { label: t('history.momentum'),  color: '#ff2d55', bg: 'rgba(255,45,85,0.10)'  },
  };

  const RESULT_META = {
    WIN:  { label: 'Profit', color: '#34c759', bg: 'rgba(52,199,89,0.12)',  icon: <CheckCircle  size={11} /> },
    LOSE: { label: 'Loss',   color: '#ff3b30', bg: 'rgba(255,59,48,0.12)',  icon: <XCircle      size={11} /> },
    LOSS: { label: 'Loss',   color: '#ff3b30', bg: 'rgba(255,59,48,0.12)',  icon: <XCircle      size={11} /> },
    DRAW: { label: t('history.draw'), color: '#ff9500', bg: 'rgba(255,149,0,0.12)', icon: <MinusCircle size={11} /> },
  };

  const Chip: React.FC<{ label: string; active: boolean; color?: string; onClick: () => void }> = ({
    label, active, color = '#007aff', onClick,
  }) => (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: active ? 600 : 400,
      background: active ? `${color}18` : th.btnBg,
      border: `1px solid ${active ? color : th.border}`,
      color: active ? color : th.textTertiary,
      cursor: 'pointer', transition: 'all 0.18s', whiteSpace: 'nowrap',
      WebkitTapHighlightColor: 'transparent', flexShrink: 0,
    }}>
      {label}
    </button>
  );

  const StatTile: React.FC<{
    label: string; value: string | number; sub?: string;
    color: string; icon: React.ReactNode;
  }> = ({ label, value, sub, color, icon }) => (
    <div style={{
      background: th.cardBg, borderRadius: 14, padding: '14px 16px',
      boxShadow: th.cardShadow,
      display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: th.textTertiary, textTransform: 'uppercase', letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>{icon}</div>
      </div>
      <p style={{ fontSize: 22, fontWeight: 700, color: th.textPrimary, letterSpacing: -0.5, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: th.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</p>}
    </div>
  );

  // ── Mobile LogRow (unchanged) ───────────────────────────────────────────────
  const LogRow: React.FC<{ log: CombinedLog; last: boolean }> = ({ log, last }) => {
    const type      = TYPE_META[log.type] || TYPE_META.fastrade;
    const res       = log.result ? (RESULT_META[log.result] || null) : null;
    const isCall    = log.trend === 'call';
    const profitPos = (log.profit ?? 0) >= 0;
    const pending   = !log.result;

    const accentGrad = res
      ? res.color === '#34c759'
        ? 'linear-gradient(180deg,#34c759,#2aad4e)'
        : res.color === '#ff3b30'
          ? 'linear-gradient(180deg,#ff3b30,#d93025)'
          : 'linear-gradient(180deg,#ff9500,#e08500)'
      : th.border;

    return (
      <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: last ? 'none' : `1px solid ${th.separator}`, position: 'relative' }}>
        {/* Left accent stripe */}
        <div style={{ width: 3, flexShrink: 0, borderRadius: '0 2px 2px 0', background: accentGrad, margin: '8px 0' }} />

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px 11px 12px', minWidth: 0 }}>

          {/* Icon bubble */}
          <div style={{
            width: 38, height: 38, borderRadius: 11, flexShrink: 0,
            background: isCall ? 'rgba(52,199,89,0.12)' : 'rgba(255,59,48,0.12)',
            border: `1px solid ${isCall ? 'rgba(52,199,89,0.22)' : 'rgba(255,59,48,0.22)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isCall ? '#34c759' : '#ff3b30',
          }}>
            {isCall ? <TrendingUp size={17} strokeWidth={2.2} /> : <TrendingDown size={17} strokeWidth={2.2} />}
          </div>

          {/* Center info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Row 1: badges + direction */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: type.color, background: type.bg, padding: '2px 7px', borderRadius: 5, border: `1px solid ${type.color}30`, flexShrink: 0 }}>
                {type.label}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', color: isCall ? '#34c759' : '#ff3b30', flexShrink: 0 }}>
                {isCall ? `↑ Buy` : `↓ Sell`}
              </span>
              {log.martingaleStep !== undefined && log.martingaleStep > 0 && (
                <span style={{ fontSize: 9.5, fontWeight: 700, color: '#ff9500', background: 'rgba(255,149,0,0.12)', border: '1px solid rgba(255,149,0,0.25)', padding: '1px 6px', borderRadius: 4, flexShrink: 0 }}>
                  MG ×{log.martingaleStep}
                </span>
              )}
              {pending && (
                <span style={{ fontSize: 9.5, fontWeight: 600, color: th.textQuaternary, background: th.labelBg, border: `1px solid ${th.border}`, padding: '1px 6px', borderRadius: 4, flexShrink: 0 }}>
                  {t('history.pending') || 'Pending'}
                </span>
              )}
            </div>
            {/* Row 2: time + date + note */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: th.textSecondary, fontFamily: "'SF Mono','Fira Mono',monospace", letterSpacing: '0.01em', background: th.monoBg, borderRadius: 5, padding: '1px 6px', flexShrink: 0 }}>
                {log.time}
              </span>
              <span style={{ fontSize: 10, color: th.textPlaceholder, flexShrink: 0 }}>•</span>
              <span style={{ fontSize: 11, color: th.textQuaternary, flexShrink: 0 }}>{fmtDate(log.executedAt)}</span>
              {log.note && (
                <>
                  <span style={{ fontSize: 10, color: th.textPlaceholder, flexShrink: 0 }}>•</span>
                  <span style={{ fontSize: 10.5, color: th.textQuaternary, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'min(90px, 25vw)' }}>
                    {log.note}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Right: amount + result + profit */}
          <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, minWidth: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: th.textPrimary, letterSpacing: -0.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'min(110px, 28vw)' }}>
              Rp {fmt(log.amount)}
            </span>
            {res ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: res.color, background: res.bg, padding: '3px 8px', borderRadius: 99, border: `1px solid ${res.color}35`, flexShrink: 0, whiteSpace: 'nowrap' }}>
                {res.icon} {res.label}
              </span>
            ) : (
              <span style={{ fontSize: 10, color: th.textFaint, background: th.labelBg, padding: '3px 8px', borderRadius: 99, border: `1px solid ${th.border}`, flexShrink: 0, whiteSpace: 'nowrap' }}>—</span>
            )}
            {log.profit != null && log.result && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: profitPos ? '#34c759' : '#ff3b30', letterSpacing: -0.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'min(100px, 28vw)' }}>
                {profitPos ? '+' : '−'}Rp {fmt(log.profit)}
              </span>
            )}
          </div>

        </div>
      </div>
    );
  };

  // ── Desktop Table Row ──────────────────────────────────────────────────────
  // Grid: 3px accent | 72px type | 100px time | 72px date | 80px dir | 1fr amount | 88px result | 100px p&l
  const DesktopLogRow: React.FC<{ log: CombinedLog; last: boolean }> = ({ log, last }) => {
    const type      = TYPE_META[log.type] || TYPE_META.fastrade;
    const res       = log.result ? (RESULT_META[log.result] || null) : null;
    const isCall    = log.trend === 'call';
    const profitPos = (log.profit ?? 0) >= 0;
    const pending   = !log.result;

    const accentColor = res
      ? res.color
      : pending ? th.borderFaint : th.borderFaint;

    return (
      <div
        className="hist-drow"
        style={{
          display: 'grid',
          gridTemplateColumns: '3px 72px 108px 68px 80px 1fr 92px 108px',
          alignItems: 'center',
          borderBottom: last ? 'none' : `1px solid ${th.separator}`,
          transition: 'background 0.12s ease',
          cursor: 'default',
        }}
      >
        {/* Accent bar */}
        <div style={{
          alignSelf: 'stretch',
          width: 3,
          background: accentColor,
          margin: '10px 0',
          borderRadius: '0 2px 2px 0',
          opacity: res ? 1 : 0.25,
        }} />

        {/* Type badge */}
        <div style={{ padding: '14px 10px 14px 14px' }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.07em',
            textTransform: 'uppercase', color: type.color,
            background: type.bg, padding: '3px 7px', borderRadius: 5,
            border: `1px solid ${type.color}28`, whiteSpace: 'nowrap',
          }}>
            {type.label}
          </span>
        </div>

        {/* Time */}
        <div style={{ padding: '14px 8px' }}>
          <span style={{
            fontSize: 12, fontWeight: 600, color: th.textSecondary,
            fontFamily: "'SF Mono','Fira Mono','Consolas',monospace",
            letterSpacing: '0.01em',
          }}>
            {log.time}
          </span>
          {log.martingaleStep !== undefined && log.martingaleStep > 0 && (
            <span style={{
              display: 'block', marginTop: 2,
              fontSize: 9, fontWeight: 700, color: '#ff9500',
            }}>
              MG ×{log.martingaleStep}
            </span>
          )}
        </div>

        {/* Date */}
        <div style={{ padding: '14px 8px' }}>
          <span style={{ fontSize: 11.5, color: th.textQuaternary }}>
            {fmtDate(log.executedAt)}
          </span>
        </div>

        {/* Direction */}
        <div style={{ padding: '14px 8px' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 12, fontWeight: 700, color: isCall ? '#34c759' : '#ff3b30',
          }}>
            {isCall
              ? <><TrendingUp size={13} strokeWidth={2.4} /> Buy</>
              : <><TrendingDown size={13} strokeWidth={2.4} /> Sell</>
            }
          </span>
          {log.note && (
            <span style={{
              display: 'block', marginTop: 2,
              fontSize: 9.5, color: th.textQuaternary,
              fontStyle: 'italic',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {log.note}
            </span>
          )}
        </div>

        {/* Amount */}
        <div style={{ padding: '14px 8px' }}>
          <span style={{
            fontSize: 13, fontWeight: 700, color: th.textPrimary,
            letterSpacing: -0.2,
          }}>
            Rp {fmt(log.amount)}
          </span>
        </div>

        {/* Result badge */}
        <div style={{ padding: '14px 8px' }}>
          {res ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em',
              color: res.color, background: res.bg,
              padding: '4px 10px', borderRadius: 99,
              border: `1px solid ${res.color}30`,
              whiteSpace: 'nowrap',
            }}>
              {res.icon} {res.label}
            </span>
          ) : (
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              fontSize: 10.5, color: th.textFaint, background: th.labelBg,
              padding: '4px 10px', borderRadius: 99, border: `1px solid ${th.border}`,
              whiteSpace: 'nowrap',
            }}>
              {pending ? (t('history.pending') || '—') : '—'}
            </span>
          )}
        </div>

        {/* P&L */}
        <div style={{ padding: '14px 16px 14px 8px', textAlign: 'right' }}>
          {log.profit != null && log.result ? (
            <span style={{
              fontSize: 13, fontWeight: 700,
              color: profitPos ? '#34c759' : '#ff3b30',
              letterSpacing: -0.2,
            }}>
              {profitPos ? '+' : '−'}Rp {fmt(log.profit)}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: th.textFaint }}>—</span>
          )}
        </div>
      </div>
    );
  };

  // ── Desktop: sidebar filter section renderer ───────────────────────────────
  const SidebarSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div style={{ padding: '20px 0 4px' }}>
      <p style={{
        fontSize: 10, fontWeight: 600, color: th.textQuaternary,
        textTransform: 'uppercase', letterSpacing: '0.09em',
        padding: '0 20px', marginBottom: 6,
      }}>
        {title}
      </p>
      {children}
    </div>
  );

  type FilterVal = LogType | ResultFilter | DateFilter;

  const SidebarFilterItem: React.FC<{
    label: string;
    active: boolean;
    color?: string;
    onClick: () => void;
    dot?: boolean;
  }> = ({ label, active, color = '#007aff', onClick, dot }) => (
    <button
      onClick={onClick}
      className="hist-sidebar-item"
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 20px', background: 'transparent',
        border: 'none', cursor: 'pointer', textAlign: 'left',
        WebkitTapHighlightColor: 'transparent', position: 'relative',
      }}
    >
      {/* Active left indicator */}
      <div style={{
        position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
        width: 2.5, height: active ? 18 : 0, borderRadius: 99,
        background: color,
        transition: 'height 0.2s cubic-bezier(0.34,1.56,0.64,1)',
      }} />
      {dot && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: active ? color : th.textFaint,
          transition: 'background 0.15s',
        }} />
      )}
      <span style={{
        fontSize: 13.5, color: active ? color : th.textSecondary,
        fontWeight: active ? 600 : 400,
        transition: 'color 0.15s',
      }}>
        {label}
      </span>
    </button>
  );

  // ── Desktop stats bar (4 metrics in a row) ────────────────────────────────
  const DesktopStatBar = () => (
    <div className="hist-desktop-stats" style={{ display: 'none' }}>
      {[
        {
          label: t('history.totalTrades'),
          value: isLoading ? '—' : stats.totalTrades,
          color: '#007aff',
          sub: isLoading ? '' : `${stats.wins}W · ${stats.losses}L${stats.draws > 0 ? ` · ${stats.draws}D` : ''}`,
        },
        {
          label: t('history.winRate'),
          value: isLoading ? '—' : `${stats.winRate}%`,
          color: stats.winRate >= 50 ? '#34c759' : '#ff3b30',
          sub: '',
        },
        {
          label: 'Profit',
          value: isLoading ? '—' : stats.wins,
          color: '#34c759',
          sub: '',
        },
        {
          label: t('history.profitLoss'),
          value: isLoading ? '—' : `${pnlPos ? '+' : '−'}Rp ${fmt(stats.totalPnL)}`,
          color: pnlPos ? '#34c759' : '#ff3b30',
          sub: '',
        },
      ].map(({ label, value, color, sub }) => (
        <div key={label} style={{
          padding: '16px 20px',
          borderRight: `1px solid ${th.separator}`,
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <p style={{
            fontSize: 10, fontWeight: 500, color: th.textQuaternary,
            textTransform: 'uppercase', letterSpacing: '0.09em',
          }}>
            {label}
          </p>
          {isLoading
            ? <Skel w={60} h={20} r={4} dark={D} />
            : <p style={{ fontSize: 20, fontWeight: 700, color, letterSpacing: -0.5, lineHeight: 1 }}>{value}</p>
          }
          {sub && !isLoading && (
            <p style={{ fontSize: 10.5, color: th.textFaint }}>{sub}</p>
          )}
        </div>
      ))}
    </div>
  );

  const TYPE_COLORS: Record<LogType, string> = {
    all: '#007aff', schedule: '#34c759', fastrade: '#007aff',
    ctc: '#af52de', indicator: '#ff9500', momentum: '#ff2d55',
  };

  return (
    <div style={{
      minHeight: '100%',
      background: th.pageBg,
      fontFamily: "-apple-system,'SF Pro Display',BlinkMacSystemFont,'Helvetica Neue',sans-serif",
      WebkitFontSmoothing: 'antialiased',
      transition: 'background 0.3s ease',
      display: 'flex', flexDirection: 'column',
    }}>
      <style>{`
        @keyframes skel-pulse { 0%,100%{opacity:.5} 50%{opacity:1} }
        @keyframes spin        { to{transform:rotate(360deg)} }
        @keyframes fade-up     { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

        .hist-chip-scroll { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch; }
        .hist-chip-scroll::-webkit-scrollbar { display: none; }
        .hist-tap { -webkit-tap-highlight-color: transparent; }
        .hist-tap:active { opacity: 0.6; }

        .hist-row { animation: fade-up 0.3s cubic-bezier(0.22,1,0.36,1) both; }
        .hist-row:nth-child(1)  { animation-delay: 0.03s; }
        .hist-row:nth-child(2)  { animation-delay: 0.06s; }
        .hist-row:nth-child(3)  { animation-delay: 0.09s; }
        .hist-row:nth-child(4)  { animation-delay: 0.12s; }
        .hist-row:nth-child(5)  { animation-delay: 0.15s; }
        .hist-row:nth-child(n+6){ animation-delay: 0.18s; }

        /* Mobile: desktop-only elements hidden */
        .hist-drow          { display: none !important; }
        .hist-desktop-stats { display: none !important; }
        .hist-table-head    { display: none !important; }
        .hist-desktop-only  { display: none !important; }

        @media (hover: hover) {
          .hist-sidebar-item:hover { background: rgba(128,128,128,0.06) !important; }
          .hist-drow:hover { background: var(--row-hover) !important; }
        }

        /* ══════════════════════════════════════════
           DESKTOP REDESIGN — min-width: 768px
           ══════════════════════════════════════════ */
        @media (min-width: 768px) {

          /* ── Root: fixed viewport height, no page overflow (like profile page) ── */
          .hist-root {
            height: 100dvh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }

          /* ── Body: fill remaining space, each panel scrolls internally ── */
          .hist-body {
            display: flex !important;
            flex: 1;
            min-height: 0;
            overflow: hidden;
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }

          /* ── layout: contents so sidebar+main become direct flex children ── */
          .hist-layout {
            display: contents !important;
          }

          /* ── Sidebar: fixed width, scrolls internally ── */
          .hist-sidebar {
            display: flex !important;
            flex-direction: column;
            flex-shrink: 0;
            width: 220px;
            height: 100%;
            overflow-y: auto;
            overflow-x: hidden;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
            border-right: 1px solid var(--sidebar-border);
            padding-bottom: 32px;
          }
          .hist-sidebar::-webkit-scrollbar { display: none; }

          /* ── Main column: fills rest, scrolls internally ── */
          .hist-main-col {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-width: 0;
            height: 100%;
            overflow-y: auto;
            overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior-y: contain;
          }
          .hist-main-col::-webkit-scrollbar { width: 0; }

          /* ── Desktop stats bar ── */
          .hist-desktop-stats {
            display: grid !important;
            grid-template-columns: repeat(4, 1fr);
            border-bottom: 1px solid var(--separator);
            flex-shrink: 0;
          }

          /* ── Desktop table header ── */
          .hist-table-head {
            display: grid !important;
            grid-template-columns: 3px 72px 108px 68px 80px 1fr 92px 108px;
            padding: 0;
            border-bottom: 1px solid var(--separator);
            background: var(--table-head-bg);
          }

          /* ── Desktop log rows ── */
          .hist-drow {
            display: grid !important;
            animation: fade-up 0.25s cubic-bezier(0.22,1,0.36,1) both;
          }
          .hist-drow:nth-child(1)  { animation-delay: 0.02s; }
          .hist-drow:nth-child(2)  { animation-delay: 0.04s; }
          .hist-drow:nth-child(3)  { animation-delay: 0.06s; }
          .hist-drow:nth-child(4)  { animation-delay: 0.08s; }
          .hist-drow:nth-child(5)  { animation-delay: 0.10s; }
          .hist-drow:nth-child(n+6){ animation-delay: 0.12s; }

          /* ── Mobile-only elements hidden on desktop ── */
          .hist-main-top    { display: none !important; }
          .hist-row         { display: none !important; }
          .hist-filter-btn  { display: none !important; }

          /* ── Desktop-only elements shown ── */
          .hist-desktop-only { display: flex !important; }

          /* ── Log wrap: clean desktop padding, no bottom-nav offset ── */
          .hist-log-wrap {
            padding: 24px 28px 40px !important;
            flex: 1;
          }

          /* ── Header: desktop variant ── */
          .hist-header-inner {
            max-width: none !important;
            padding: 0 24px !important;
          }
        }
      `}</style>

      {/* CSS variables injected via inline style on root */}
      <div
        className="hist-root"
        style={{
          // Expose theme tokens as CSS vars for media-query-driven styles
          ['--sidebar-border' as any]: th.sidebarBorder,
          ['--separator' as any]:      th.separator,
          ['--row-hover' as any]:      th.deskRowHover,
          ['--table-head-bg' as any]:  th.deskTableHead,
        }}
      >

        {/* ── HEADER ── */}
        <div style={{
          width: '100%',
          background: th.headerBg,
          borderBottom: `0.5px solid ${th.border}`,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          flexShrink: 0,
          transition: 'background 0.3s ease, border-color 0.3s ease',
        }}>
          <div className="hist-header-inner" style={{ maxWidth: 1120, margin: '0 auto', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 17, fontWeight: 600, color: th.textPrimary, letterSpacing: -0.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 4 }}>
              {t('history.title')}
            </h1>

            {/* Desktop: subtle summary in header */}
            {!isLoading && (
              <div className="hist-desktop-only" style={{ display: 'none', alignItems: 'center', gap: 16, flex: 1, paddingLeft: 8 }}>
                <span style={{ fontSize: 12.5, color: th.textTertiary }}>
                  <span style={{ fontWeight: 600, color: th.textPrimary }}>{stats.totalTrades}</span> {t('history.trades')}
                </span>
                <span style={{ width: 1, height: 14, background: th.border, flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, color: th.textTertiary }}>
                  Win rate{' '}
                  <span style={{ fontWeight: 600, color: stats.winRate >= 50 ? '#34c759' : '#ff3b30' }}>
                    {stats.winRate}%
                  </span>
                </span>
                <span style={{ width: 1, height: 14, background: th.border, flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, color: th.textTertiary }}>
                  P&L{' '}
                  <span style={{ fontWeight: 600, color: pnlPos ? '#34c759' : '#ff3b30' }}>
                    {pnlPos ? '+' : '−'}Rp {fmt(stats.totalPnL)}
                  </span>
                </span>
              </div>
            )}

            <div style={{ flex: 1 }} className="hist-filter-btn" />

            <button
              onClick={() => loadHistory(true)}
              disabled={refreshing || isLoading}
              className="hist-tap"
              style={{
                width: 32, height: 32, borderRadius: 8, background: th.btnBg,
                border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#007aff', cursor: 'pointer', opacity: (refreshing || isLoading) ? 0.4 : 1, flexShrink: 0,
              }}
            >
              <RotateCcw size={15} style={{ animation: (refreshing || isLoading) ? 'spin 0.8s linear infinite' : 'none' }} />
            </button>

            {/* Filter button — mobile only */}
            <button
              onClick={() => setShowFilters(v => !v)}
              className="hist-tap hist-filter-btn"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 13px', borderRadius: 99,
                background: showFilters ? 'rgba(0,122,255,0.12)' : th.btnBg,
                border: `1px solid ${showFilters ? 'rgba(0,122,255,0.28)' : th.border}`,
                color: showFilters ? '#007aff' : th.textSecondary,
                fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <Filter size={13} />
              <span style={{ whiteSpace: 'nowrap' }}>{t('common.filter')}</span>
              {hasActiveFilter && (
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#007aff', marginLeft: 1, flexShrink: 0 }} />
              )}
            </button>
          </div>
        </div>

        {/* ── BODY ── */}
        <div className="hist-body" style={{ maxWidth: 1120, margin: '0 auto', width: '100%' }}>
          <div className="hist-layout" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ══ SIDEBAR ══ */}
            <div
              className="hist-sidebar"
              style={{ display: 'none', flexDirection: 'column', background: th.deskSidebarBg, transition: 'background 0.3s ease' }}
            >
              {/* Sidebar header */}
              <div style={{
                padding: '20px 20px 16px',
                borderBottom: `1px solid ${th.separator}`,
              }}>
                <p style={{
                  fontSize: 10, fontWeight: 600, color: th.textQuaternary,
                  textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 10,
                }}>
                  {t('history.summary')}
                </p>
                {isLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Skel w={80} h={26} r={5} dark={D} />
                    <Skel w={120} h={13} r={4} dark={D} />
                  </div>
                ) : (
                  <>
                    <p style={{
                      fontSize: 28, fontWeight: 700, color: th.textPrimary,
                      letterSpacing: -0.8, lineHeight: 1, marginBottom: 6,
                    }}>
                      {stats.totalTrades}
                    </p>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <span style={{ fontSize: 11.5, color: '#34c759', fontWeight: 600 }}>{stats.wins}W</span>
                      <span style={{ fontSize: 11.5, color: '#ff3b30', fontWeight: 600 }}>{stats.losses}L</span>
                      {stats.draws > 0 && <span style={{ fontSize: 11.5, color: '#ff9500', fontWeight: 600 }}>{stats.draws}D</span>}
                    </div>
                    <div style={{
                      marginTop: 10, paddingTop: 10,
                      borderTop: `1px solid ${th.separator}`,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    }}>
                      <span style={{ fontSize: 11, color: th.textQuaternary }}>Win rate</span>
                      <span style={{
                        fontSize: 15, fontWeight: 700, letterSpacing: -0.3,
                        color: stats.winRate >= 50 ? '#34c759' : '#ff3b30',
                      }}>
                        {stats.winRate}%
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
                      <span style={{ fontSize: 11, color: th.textQuaternary }}>P&L</span>
                      <span style={{
                        fontSize: 12.5, fontWeight: 700, letterSpacing: -0.2,
                        color: pnlPos ? '#34c759' : '#ff3b30',
                      }}>
                        {pnlPos ? '+' : '−'}Rp {fmt(stats.totalPnL)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Reset filters */}
              {hasActiveFilter && (
                <div style={{ padding: '10px 20px 0' }}>
                  <button
                    onClick={() => { setTypeFilter('all'); setResultFilter('all'); setDateFilter('all'); }}
                    style={{
                      width: '100%', padding: '8px', borderRadius: 8,
                      background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)',
                      color: '#ff3b30', fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {t('history.resetFilters')}
                  </button>
                </div>
              )}

              {/* Type filter */}
              <SidebarSection title={t('history.type')}>
                {(['all', 'schedule', 'fastrade', 'ctc', 'indicator', 'momentum'] as LogType[]).map((val) => (
                  <SidebarFilterItem
                    key={val}
                    label={getTypeLabel(val)}
                    active={typeFilter === val}
                    color={TYPE_COLORS[val]}
                    onClick={() => setTypeFilter(val)}
                    dot={val !== 'all'}
                  />
                ))}
              </SidebarSection>

              {/* Separator */}
              <div style={{ height: 1, background: th.separator, margin: '8px 20px 0' }} />

              {/* Result filter */}
              <SidebarSection title={t('history.filterByResult')}>
                {([
                  { v: 'all'  as ResultFilter, color: '#007aff' },
                  { v: 'win'  as ResultFilter, color: '#34c759' },
                  { v: 'loss' as ResultFilter, color: '#ff3b30' },
                  { v: 'draw' as ResultFilter, color: '#ff9500' },
                ]).map(({ v, color }) => (
                  <SidebarFilterItem
                    key={v}
                    label={getResultLabel(v)}
                    active={resultFilter === v}
                    color={color}
                    onClick={() => setResultFilter(v)}
                    dot={v !== 'all'}
                  />
                ))}
              </SidebarSection>

              {/* Separator */}
              <div style={{ height: 1, background: th.separator, margin: '8px 20px 0' }} />

              {/* Period filter */}
              <SidebarSection title={t('history.period')}>
                {(['all', 'today', 'week', 'month'] as DateFilter[]).map((val) => (
                  <SidebarFilterItem
                    key={val}
                    label={getPeriodLabel(val)}
                    active={dateFilter === val}
                    color="#007aff"
                    onClick={() => setDateFilter(val)}
                  />
                ))}
              </SidebarSection>
            </div>

            {/* ══ MAIN COLUMN ══ */}
            <div className="hist-main-col" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

              {/* Mobile stat tiles */}
              <div className="hist-main-top" style={{ display: 'block', padding: '0 16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <StatTile
                    label={t('history.totalTrades')}
                    value={isLoading ? '—' : stats.totalTrades}
                    sub={isLoading ? '' : `${stats.wins}P · ${stats.losses}L${stats.draws > 0 ? ` · ${stats.draws}${t('history.draw')[0]}` : ''}`}
                    color="#007aff"
                    icon={<BarChart3 size={14} />}
                  />
                  <StatTile
                    label={t('history.winRate')}
                    value={isLoading ? '—' : `${stats.winRate}%`}
                    sub={isLoading ? '' : `${pnlPos ? '+' : '-'}Rp ${fmt(stats.totalPnL)}`}
                    color={stats.winRate >= 50 ? '#34c759' : '#ff3b30'}
                    icon={stats.winRate >= 50 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  />
                </div>
              </div>

              {/* Desktop stats bar (4-col) */}
              <DesktopStatBar />

              {/* Mobile: filter drawer */}
              {showFilters && (
                <div style={{ background: th.cardBg, borderRadius: 14, boxShadow: th.cardShadow, padding: '14px 16px', margin: '0 16px', animation: 'fade-up 0.22s ease both' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: th.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('common.filter')}</span>
                    {hasActiveFilter && (
                      <button onClick={() => { setTypeFilter('all'); setResultFilter('all'); setDateFilter('all'); }}
                        style={{ fontSize: 13, color: '#ff3b30', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0, WebkitTapHighlightColor: 'transparent' }}>{t('history.resetFilters')}</button>
                    )}
                  </div>
                  <p style={{ fontSize: 11, color: th.textTertiary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('history.filterByType')}</p>
                  <div className="hist-chip-scroll" style={{ marginBottom: 14 }}>
                    {(['all','schedule','fastrade','ctc','indicator','momentum'] as LogType[]).map((v) => (
                      <Chip key={v} label={getTypeLabel(v)} active={typeFilter===v} color={TYPE_META[v]?.color || '#007aff'} onClick={() => setTypeFilter(v)} />
                    ))}
                  </div>
                  <p style={{ fontSize: 11, color: th.textTertiary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('history.filterByResult')}</p>
                  <div className="hist-chip-scroll" style={{ marginBottom: 14 }}>
                    {(['all','win','loss','draw'] as ResultFilter[]).map((v) => (
                      <Chip key={v} label={getResultLabel(v)} active={resultFilter===v} color={v==='win'?'#34c759':v==='loss'?'#ff3b30':v==='draw'?'#ff9500':'#007aff'} onClick={() => setResultFilter(v)} />
                    ))}
                  </div>
                  <p style={{ fontSize: 11, color: th.textTertiary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('history.filterByPeriod')}</p>
                  <div className="hist-chip-scroll">
                    {(['all','today','week','month'] as DateFilter[]).map((v) => (
                      <Chip key={v} label={getPeriodLabel(v)} active={dateFilter===v} onClick={() => setDateFilter(v)} />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Log list ── */}
              <div className="hist-log-wrap" style={{ padding: '0 16px calc(56px + env(safe-area-inset-bottom, 0px) + 24px)' }}>

                {/* Mobile: section label */}
                <div className="hist-main-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 4px' }}>
                  <p style={{ fontSize: 11.5, fontWeight: 500, color: th.textTertiary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('history.trades')}</p>
                  <p style={{ fontSize: 11.5, color: th.textFaint, whiteSpace: 'nowrap', flexShrink: 0 }}>{filteredLogs.length} {t('common.data')}</p>
                </div>

                {/* Desktop: table column header */}
                <div
                  className="hist-table-head"
                  style={{ display: 'none', borderRadius: '8px 8px 0 0', overflow: 'hidden' }}
                >
                  {/* spacer for accent column */}
                  <div />
                  {[
                    { label: t('history.type') || 'Type',   pad: '10px 10px 10px 14px' },
                    { label: t('history.time') || 'Time',   pad: '10px 8px' },
                    { label: t('history.date') || 'Date',   pad: '10px 8px' },
                    { label: 'Direction',                    pad: '10px 8px' },
                    { label: t('history.amount') || 'Amount', pad: '10px 8px' },
                    { label: 'Result',                       pad: '10px 8px' },
                    { label: 'P&L',                          pad: '10px 16px 10px 8px', right: true },
                  ].map(({ label, pad, right }) => (
                    <div key={label} style={{
                      padding: pad,
                      fontSize: 10, fontWeight: 600, color: th.textQuaternary,
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                      textAlign: right ? 'right' : 'left',
                    }}>
                      {label}
                    </div>
                  ))}
                </div>

                {/* Card wrapper (mobile) / flat wrapper (desktop) */}
                <div style={{
                  background: th.cardBg,
                  borderRadius: 14,
                  overflow: 'hidden',
                  boxShadow: th.cardShadow,
                  transition: 'background 0.3s ease',
                }}>
                  {isLoading ? (
                    <div style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(0,122,255,0.18)', borderTopColor: '#007aff', animation: 'spin 0.8s linear infinite' }} />
                      <p style={{ fontSize: 13, color: th.textTertiary }}>{t('history.loading')}</p>
                    </div>
                  ) : filteredLogs.length === 0 ? (
                    <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                      <History size={36} style={{ color: th.textPlaceholder, margin: '0 auto 12px', display: 'block' }} />
                      <p style={{ fontSize: 15, fontWeight: 500, color: th.textSecondary, marginBottom: 4 }}>{t('history.noTransactions')}</p>
                      <p style={{ fontSize: 13, color: th.textFaint }}>{logs.length > 0 ? t('history.noTransactionsFilter') : t('history.startTrading')}</p>
                    </div>
                  ) : (
                    <div>
                      {filteredLogs.map((log, idx) => (
                        <React.Fragment key={log.id}>
                          {/* Mobile row */}
                          <div className="hist-row">
                            <LogRow log={log} last={idx === filteredLogs.length - 1} />
                          </div>
                          {/* Desktop row */}
                          <DesktopLogRow log={log} last={idx === filteredLogs.length - 1} />
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </div>

                {/* Desktop: count below table */}
                {!isLoading && filteredLogs.length > 0 && (
                  <div className="hist-desktop-only" style={{
                    display: 'none', justifyContent: 'flex-end',
                    padding: '10px 2px 0',
                  }}>
                    <p style={{ fontSize: 11.5, color: th.textFaint }}>
                      {filteredLogs.length} {t('common.data')}
                      {hasActiveFilter && (
                        <button
                          onClick={() => { setTypeFilter('all'); setResultFilter('all'); setDateFilter('all'); }}
                          style={{
                            marginLeft: 12, fontSize: 11.5, color: '#007aff',
                            background: 'transparent', border: 'none',
                            cursor: 'pointer', fontFamily: 'inherit',
                            WebkitTapHighlightColor: 'transparent',
                          }}
                        >
                          {t('history.resetFilters')}
                        </button>
                      )}
                    </p>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Export with LanguageProvider
export default function HistoryPage() {
  return (
    <LanguageProvider>
      <HistoryPageContent />
    </LanguageProvider>
  );
}