'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, type ExecutionLog, type FastradeLog, type IndicatorLog, type MomentumLog } from '@/lib/api';
import { storage } from '@/lib/storage';
import { LanguageProvider, useLanguage, formatDate, formatTime, Language } from '@/lib/i18n';
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
const Skel: React.FC<{ w?: number | string; h?: number; r?: number }> = ({ w = '100%', h = 14, r = 6 }) => (
  <div style={{ width: w, height: h, borderRadius: r, background: 'rgba(60,60,67,0.08)', animation: 'skel-pulse 1.6s ease-in-out infinite' }} />
);

// ─────────────────────────────────────────────
// MAIN CONTENT
// ─────────────────────────────────────────────
function HistoryPageContent() {
  const router = useRouter();
  const { t, language } = useLanguage();
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

  // Get localized type labels
  const getTypeLabel = (type: LogType): string => {
    const labels: Record<LogType, string> = {
      all: t('history.all'),
      schedule: t('history.signal'),
      fastrade: t('history.fastTrade'),
      ctc: t('history.ctc'),
      indicator: t('history.indicator'),
      momentum: t('history.momentum'),
    };
    return labels[type];
  };

  // Get localized result labels
  const getResultLabel = (result: ResultFilter): string => {
    const labels: Record<ResultFilter, string> = {
      all: t('history.all'),
      win: 'Profit',
      loss: 'Loss',
      draw: t('history.draw'),
    };
    return labels[result];
  };

  // Get localized period labels
  const getPeriodLabel = (period: DateFilter): string => {
    const labels: Record<DateFilter, string> = {
      all: t('history.all'),
      today: t('history.today'),
      week: t('history.week'),
      month: t('history.month'),
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

  // Format helpers
  const fmt = (n?: number) => {
    if (n == null) return '0';
    return Math.abs(n / 100).toLocaleString(language === 'en' ? 'en-US' : language === 'ru' ? 'ru-RU' : 'id-ID', { maximumFractionDigits: 0 });
  };

  const fmtDate = (ts: number) =>
    formatDate(ts, language, { day: '2-digit', month: 'short' });

  const fmtTime = (ts: number) =>
    formatTime(ts, language, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

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
    WIN:  { label: 'Profit', color: '#34c759', bg: 'rgba(52,199,89,0.10)',   icon: <CheckCircle  size={11} /> },
    LOSE: { label: 'Loss',   color: '#ff3b30', bg: 'rgba(255,59,48,0.10)',   icon: <XCircle      size={11} /> },
    LOSS: { label: 'Loss',   color: '#ff3b30', bg: 'rgba(255,59,48,0.10)',   icon: <XCircle      size={11} /> },
    DRAW: { label: t('history.draw'), color: '#ff9500', bg: 'rgba(255,149,0,0.10)',   icon: <MinusCircle  size={11} /> },
  };

  const Chip: React.FC<{ label: string; active: boolean; color?: string; onClick: () => void }> = ({
    label, active, color = '#007aff', onClick,
  }) => (
    <button onClick={onClick} style={{
      padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: active ? 600 : 400,
      background: active ? `${color}12` : 'transparent',
      border: `1px solid ${active ? color : 'rgba(60,60,67,0.14)'}`,
      color: active ? color : '#6e6e73',
      cursor: 'pointer', transition: 'all 0.18s', whiteSpace: 'nowrap',
      WebkitTapHighlightColor: 'transparent',
    }}>
      {label}
    </button>
  );

  const StatTile: React.FC<{
    label: string; value: string | number; sub?: string;
    color: string; icon: React.ReactNode;
  }> = ({ label, value, sub, color, icon }) => (
    <div style={{
      background: '#fff', borderRadius: 14, padding: '14px 16px',
      boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 2px 12px rgba(0,0,0,0.04)',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: '#6e6e73', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>{icon}</div>
      </div>
      <p style={{ fontSize: 22, fontWeight: 700, color: '#1c1c1e', letterSpacing: -0.5, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: '#aeaeb2' }}>{sub}</p>}
    </div>
  );

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
      : 'rgba(60,60,67,0.12)';

    return (
      <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: last ? 'none' : '1px solid rgba(60,60,67,0.07)', position: 'relative' }}>
        {/* Left accent stripe */}
        <div style={{ width: 3, flexShrink: 0, borderRadius: '0 2px 2px 0', background: accentGrad, margin: '8px 0' }} />

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px 11px 12px' }}>

          {/* Icon bubble */}
          <div style={{
            width: 38, height: 38, borderRadius: 11, flexShrink: 0,
            background: isCall ? 'rgba(52,199,89,0.10)' : 'rgba(255,59,48,0.10)',
            border: `1px solid ${isCall ? 'rgba(52,199,89,0.18)' : 'rgba(255,59,48,0.18)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isCall ? '#34c759' : '#ff3b30',
          }}>
            {isCall ? <TrendingUp size={17} strokeWidth={2.2} /> : <TrendingDown size={17} strokeWidth={2.2} />}
          </div>

          {/* Center info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Row 1: badges + direction */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: type.color, background: type.bg, padding: '2px 7px', borderRadius: 5, border: `1px solid ${type.color}22` }}>
                {type.label}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', color: isCall ? '#34c759' : '#ff3b30' }}>
                {isCall ? `↑ Buy` : `↓ Sell`}
              </span>
              {log.martingaleStep !== undefined && log.martingaleStep > 0 && (
                <span style={{ fontSize: 9.5, fontWeight: 700, color: '#ff9500', background: 'rgba(255,149,0,0.10)', border: '1px solid rgba(255,149,0,0.20)', padding: '1px 6px', borderRadius: 4 }}>
                  MG ×{log.martingaleStep}
                </span>
              )}
              {pending && (
                <span style={{ fontSize: 9.5, fontWeight: 600, color: '#8e8e93', background: 'rgba(142,142,147,0.10)', border: '1px solid rgba(142,142,147,0.20)', padding: '1px 6px', borderRadius: 4 }}>
                  {t('history.pending') || 'Pending'}
                </span>
              )}
            </div>
            {/* Row 2: time + date + note */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: '#3c3c43', fontFamily: "'SF Mono','Fira Mono',monospace", letterSpacing: '0.01em', background: 'rgba(60,60,67,0.06)', borderRadius: 5, padding: '1px 6px' }}>
                {log.time}
              </span>
              <span style={{ fontSize: 10, color: '#c7c7cc' }}>•</span>
              <span style={{ fontSize: 11, color: '#8e8e93' }}>{fmtDate(log.executedAt)}</span>
              {log.note && (
                <>
                  <span style={{ fontSize: 10, color: '#c7c7cc' }}>•</span>
                  <span style={{ fontSize: 10.5, color: '#8e8e93', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>
                    {log.note}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Right: amount + result + profit */}
          <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1c1c1e', letterSpacing: -0.2 }}>
              Rp {fmt(log.amount)}
            </span>
            {res ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: res.color, background: res.bg, padding: '3px 8px', borderRadius: 99, border: `1px solid ${res.color}30` }}>
                {res.icon} {res.label}
              </span>
            ) : (
              <span style={{ fontSize: 10, color: '#aeaeb2', background: 'rgba(60,60,67,0.06)', padding: '3px 8px', borderRadius: 99, border: '1px solid rgba(60,60,67,0.10)' }}>—</span>
            )}
            {log.profit != null && log.result && (
              <span style={{ fontSize: 11.5, fontWeight: 700, color: profitPos ? '#34c759' : '#ff3b30', letterSpacing: -0.2 }}>
                {profitPos ? '+' : '−'}Rp {fmt(log.profit)}
              </span>
            )}
          </div>

        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100dvh', background: '#f2f2f7', fontFamily: "-apple-system,'SF Pro Display',BlinkMacSystemFont,'Helvetica Neue',sans-serif", WebkitFontSmoothing: 'antialiased', paddingBottom: 100 }}>
      <style>{`
        @keyframes skel-pulse { 0%,100%{opacity:.5} 50%{opacity:1} }
        @keyframes spin        { to{transform:rotate(360deg)} }
        @keyframes fade-up     { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

        .hist-chip-scroll { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
        .hist-chip-scroll::-webkit-scrollbar { display: none; }
        .hist-tap:active { opacity: 0.6; }

        .hist-row { animation: fade-up 0.3s cubic-bezier(0.22,1,0.36,1) both; }
        .hist-row:nth-child(1)  { animation-delay: 0.03s; }
        .hist-row:nth-child(2)  { animation-delay: 0.06s; }
        .hist-row:nth-child(3)  { animation-delay: 0.09s; }
        .hist-row:nth-child(4)  { animation-delay: 0.12s; }
        .hist-row:nth-child(5)  { animation-delay: 0.15s; }
        .hist-row:nth-child(n+6){ animation-delay: 0.18s; }

        @media (min-width: 768px) {
          .hist-grid-2 { grid-template-columns: 1fr 1fr !important; }
          .hist-grid-4 { grid-template-columns: repeat(4,1fr) !important; }
          .hist-layout { display: grid; grid-template-columns: 280px 1fr; gap: 24px; align-items: start; }
          .hist-sidebar { display: flex !important; }
          .hist-main-top { display: none !important; }
        }
      `}</style>

      {/* ── STICKY HEADER ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, flexShrink: 0, background: 'rgba(242,242,247,0.92)', backdropFilter: 'saturate(180%) blur(20px)', WebkitBackdropFilter: 'saturate(180%) blur(20px)', borderBottom: '0.5px solid rgba(60,60,67,0.16)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ flex: 1, fontSize: 17, fontWeight: 600, color: '#1c1c1e', letterSpacing: -0.4 }}>{t('history.title')}</h1>
          
          {/* Language Selector */}
          
          
          <button onClick={() => loadHistory(true)} disabled={refreshing || isLoading} className="hist-tap"
            style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,0,0,0.05)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#007aff', cursor: 'pointer', opacity: (refreshing || isLoading) ? 0.4 : 1 }}>
            <RotateCcw size={15} style={{ animation: (refreshing || isLoading) ? 'spin 0.8s linear infinite' : 'none' }} />
          </button>
          <button onClick={() => setShowFilters(v => !v)} className="hist-tap"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 99, background: showFilters ? 'rgba(0,122,255,0.10)' : 'rgba(0,0,0,0.05)', border: `1px solid ${showFilters ? 'rgba(0,122,255,0.22)' : 'rgba(60,60,67,0.12)'}`, color: showFilters ? '#007aff' : '#3c3c43', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            <Filter size={13} />
            {t('common.filter')}
            {hasActiveFilter && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#007aff', marginLeft: 1 }} />}
          </button>
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '20px 16px 0' }}>
        <div className="hist-layout" style={{ display: 'block' }}>

          {/* ══ SIDEBAR (desktop) ══ */}
          <div className="hist-sidebar" style={{ display: 'none', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 2px 12px rgba(0,0,0,0.04)' }}>
              <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(60,60,67,0.07)' }}>
                <p style={{ fontSize: 11, fontWeight: 500, color: '#6e6e73', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{t('history.summary')}</p>
                {isLoading ? <Skel w={100} h={28} r={6} /> : (
                  <p style={{ fontSize: 26, fontWeight: 700, color: '#1c1c1e', letterSpacing: -0.6, lineHeight: 1 }}>{stats.totalTrades} <span style={{ fontSize: 13, fontWeight: 400, color: '#6e6e73' }}>{t('history.trades')}</span></p>
                )}
              </div>
              {[
                { label: 'Profit', value: stats.wins, color: '#34c759' },
                { label: 'Loss', value: stats.losses, color: '#ff3b30' },
                { label: t('history.draw'), value: stats.draws, color: '#ff9500' },
              ].map(({ label, value, color }, i, arr) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: i < arr.length - 1 ? '1px solid rgba(60,60,67,0.07)' : 'none' }}>
                  <span style={{ fontSize: 14, color: '#3c3c43' }}>{label}</span>
                  {isLoading ? <Skel w={30} h={13} r={4} /> : <span style={{ fontSize: 14, fontWeight: 600, color }}>{value}</span>}
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: '#fff', borderRadius: 14, padding: '12px', boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 2px 12px rgba(0,0,0,0.04)' }}>
                <p style={{ fontSize: 10, fontWeight: 500, color: '#6e6e73', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{t('history.winRate')}</p>
                {isLoading ? <Skel w="70%" h={22} r={5} /> : <p style={{ fontSize: 20, fontWeight: 700, color: stats.winRate >= 50 ? '#34c759' : '#ff3b30', letterSpacing: -0.4 }}>{stats.winRate}%</p>}
              </div>
              <div style={{ background: '#fff', borderRadius: 14, padding: '12px', boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 2px 12px rgba(0,0,0,0.04)' }}>
                <p style={{ fontSize: 10, fontWeight: 500, color: '#6e6e73', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>{t('history.profitLoss')}</p>
                {isLoading ? <Skel w="80%" h={22} r={5} /> : <p style={{ fontSize: 14, fontWeight: 700, color: pnlPos ? '#34c759' : '#ff3b30', letterSpacing: -0.3, lineHeight: 1.2 }}>{pnlPos ? '+' : '-'}Rp {fmt(stats.totalPnL)}</p>}
              </div>
            </div>

            <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 2px 12px rgba(0,0,0,0.04)' }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: '#6e6e73', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 16px 8px' }}>{t('history.type')}</p>
              {(['all', 'schedule', 'fastrade', 'ctc', 'indicator', 'momentum'] as LogType[]).map((val, i, arr) => {
                const active = typeFilter === val;
                const colors: Record<LogType, string> = {
                  all: '#007aff', schedule: '#34c759', fastrade: '#007aff', 
                  ctc: '#af52de', indicator: '#ff9500', momentum: '#ff2d55'
                };
                return (
                  <button key={val} onClick={() => setTypeFilter(val)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', background: active ? `${colors[val]}08` : 'transparent', border: 'none', borderBottom: i < arr.length - 1 ? '1px solid rgba(60,60,67,0.07)' : 'none', borderLeft: active ? `2px solid ${colors[val]}` : '2px solid transparent', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: 14, color: active ? colors[val] : '#1c1c1e', fontWeight: active ? 600 : 400 }}>{getTypeLabel(val)}</span>
                    {active && <ChevronRight size={13} color={colors[val]} />}
                  </button>
                );
              })}
            </div>

            <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 2px 12px rgba(0,0,0,0.04)' }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: '#6e6e73', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '12px 16px 8px' }}>{t('history.period')}</p>
              {(['all', 'today', 'week', 'month'] as DateFilter[]).map((val, i, arr) => {
                const active = dateFilter === val;
                return (
                  <button key={val} onClick={() => setDateFilter(val)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', background: active ? 'rgba(0,122,255,0.06)' : 'transparent', border: 'none', borderBottom: i < arr.length - 1 ? '1px solid rgba(60,60,67,0.07)' : 'none', borderLeft: active ? '2px solid #007aff' : '2px solid transparent', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: 14, color: active ? '#007aff' : '#1c1c1e', fontWeight: active ? 600 : 400 }}>{getPeriodLabel(val)}</span>
                    {active && <ChevronRight size={13} color="#007aff" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ══ MAIN COLUMN ══ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div className="hist-main-top" style={{ display: 'block' }}>
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

            {showFilters && (
              <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 2px 12px rgba(0,0,0,0.04)', padding: '14px 16px', animation: 'fade-up 0.22s ease both' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1c1c1e' }}>{t('common.filter')}</span>
                  {hasActiveFilter && (
                    <button onClick={() => { setTypeFilter('all'); setResultFilter('all'); setDateFilter('all'); }}
                      style={{ fontSize: 13, color: '#ff3b30', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>{t('history.resetFilters')}</button>
                  )}
                </div>
                <p style={{ fontSize: 11, color: '#6e6e73', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('history.filterByType')}</p>
                <div className="hist-chip-scroll" style={{ marginBottom: 14 }}>
                  {(['all','schedule','fastrade','ctc','indicator','momentum'] as LogType[]).map((v) => (
                    <Chip key={v} label={getTypeLabel(v)} active={typeFilter===v} color={TYPE_META[v]?.color || '#007aff'} onClick={() => setTypeFilter(v)} />
                  ))}
                </div>
                <p style={{ fontSize: 11, color: '#6e6e73', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('history.filterByResult')}</p>
                <div className="hist-chip-scroll" style={{ marginBottom: 14 }}>
                  {(['all','win','loss','draw'] as ResultFilter[]).map((v) => (
                    <Chip key={v} label={getResultLabel(v)} active={resultFilter===v} color={v==='win'?'#34c759':v==='loss'?'#ff3b30':v==='draw'?'#ff9500':'#007aff'} onClick={() => setResultFilter(v)} />
                  ))}
                </div>
                <p style={{ fontSize: 11, color: '#6e6e73', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('history.filterByPeriod')}</p>
                <div className="hist-chip-scroll">
                  {(['all','today','week','month'] as DateFilter[]).map((v) => (
                    <Chip key={v} label={getPeriodLabel(v)} active={dateFilter===v} onClick={() => setDateFilter(v)} />
                  ))}
                </div>
              </div>
            )}

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 4px' }}>
                <p style={{ fontSize: 11.5, fontWeight: 500, color: '#6e6e73', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('history.trades')}</p>
                <p style={{ fontSize: 11.5, color: '#aeaeb2' }}>{filteredLogs.length} {t('common.data')}</p>
              </div>
              <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 0 rgba(0,0,0,0.04), 0 2px 12px rgba(0,0,0,0.04)' }}>
                {isLoading ? (
                  <div style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(0,122,255,0.15)', borderTopColor: '#007aff', animation: 'spin 0.8s linear infinite' }} />
                    <p style={{ fontSize: 13, color: '#6e6e73' }}>{t('history.loading')}</p>
                  </div>
                ) : filteredLogs.length === 0 ? (
                  <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                    <History size={36} style={{ color: '#c7c7cc', margin: '0 auto 12px', display: 'block' }} />
                    <p style={{ fontSize: 15, fontWeight: 500, color: '#3c3c43', marginBottom: 4 }}>{t('history.noTransactions')}</p>
                    <p style={{ fontSize: 13, color: '#aeaeb2' }}>{logs.length > 0 ? t('history.noTransactionsFilter') : t('history.startTrading')}</p>
                  </div>
                ) : (
                  <div>
                    {filteredLogs.map((log, idx) => (
                      <div key={log.id} className="hist-row">
                        <LogRow log={log} last={idx === filteredLogs.length - 1} />
                      </div>
                    ))}
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