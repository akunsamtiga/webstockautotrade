// lib/api.ts  — maps to actual NestJS backend routes
import { getAuthToken, sessionLogout, storage } from './storage';

const getBase = () => process.env.NEXT_PUBLIC_API_URL ?? '';

// ✅ FIXED: Gunakan getAuthToken yang sudah validasi session
async function getToken(): Promise<string | null> {
  return getAuthToken();
}

// emit custom event untuk logout — tidak pakai window.location.href
function emitUnauthorized() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('stc:unauthorized'));
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${getBase()}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  if (res.status === 401) {
    try {
      // ✅ FIXED: Gunakan sessionLogout untuk clear semua session data
      await sessionLogout();
    } catch { /* ignore */ }
    emitUnauthorized();
    throw new Error('Sesi habis, silakan login kembali.');
  }

  let data: unknown;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new Error((data as any)?.message ?? res.statusText);
  return data as T;
}

// ─────────────────────────────────────────────
// TYPES — Schedule / Fastrade (existing)
// ─────────────────────────────────────────────
export interface StockityAsset {
  ric: string;
  name: string;
  type: number;
  typeName: string;
  profitRate: number;
  iconUrl: string | null;
}

export interface ProfileBalance {
  balance?: number;
  real_balance?: number;
  demo_balance?: number;
  currency?: string;
  [key: string]: unknown;
}

export interface AlwaysSignalLossState {
  hasOutstandingLoss: boolean;
  currentMartingaleStep: number;
  originalOrderId: string;
  totalLoss: number;
  currentTrend: 'call' | 'put';
}

export interface ScheduleStatus {
  botState?: 'RUNNING' | 'PAUSED' | 'STOPPED' | 'IDLE';
  totalOrders?: number;
  pendingOrders?: number;
  awaitingOrders?: number;
  executedOrders?: number;
  skippedOrders?: number;
  activeOrders?: number;
  sessionPnL?: number;
  // Always Signal
  alwaysSignalActive?: boolean;
  alwaysSignalStep?: number;
  alwaysSignalLossState?: AlwaysSignalLossState;
  // Risk management
  stopLoss?: number;
  stopProfit?: number;
  // Next order
  nextOrderTime?: string | null;
  nextOrderInSeconds?: number | null;
  // Legacy
  activeMartingaleOrderId?: string | null;
  wsConnected?: boolean;
  nextExecutionTime?: string;
  startedAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface ScheduleConfig {
  asset?: { ric: string; name: string; profitRate?: number; iconUrl?: string | null };
  martingale?: {
    isEnabled: boolean;
    maxSteps: number;
    baseAmount: number;
    multiplierValue: number;
    multiplierType: 'FIXED' | 'PERCENTAGE';
    isAlwaysSignal: boolean;
  };
  isDemoAccount?: boolean;
  currency?: string;
  currencyIso?: string;
  duration?: number;
  stopLoss?: number;
  stopProfit?: number;
  [key: string]: unknown;
}

export interface ScheduleOrder {
  id: string;
  time: string;
  ric?: string;
  trend: 'call' | 'put';
  timeInMillis: number;
  isExecuted: boolean;
  isSkipped: boolean;
  skipReason?: string;
  result?: string;
  martingaleState?: {
    isActive: boolean;
    currentStep: number;
    maxSteps: number;
    isCompleted: boolean;
    totalLoss: number;
    totalRecovered: number;
  };
}

export interface ExecutionLog {
  id: string;
  orderId?: string;
  ric?: string;
  time?: string;
  trend?: string;
  amount?: number;
  result?: string;
  profit?: number;
  sessionPnL?: number;
  executedAt?: number;
  note?: string;
  martingaleStep?: number;
  isDemoAccount?: boolean;
}

export interface FastradeStatus {
  mode?: 'FTT' | 'CTC' | null;
  isRunning?: boolean;
  cycleNumber?: number;
  currentTrend?: string | null;
  martingaleStep?: number;
  isMartingaleActive?: boolean;
  sessionPnL?: number;
  totalTrades?: number;
  totalWins?: number;
  totalLosses?: number;
  activeOrderId?: string | null;
  wsConnected?: boolean;
  phase?: string;
  activeTrend?: string | null;
}

export interface FastradeLog {
  id: string;
  orderId: string;
  ric?: string;
  trend: string;
  amount: number;
  martingaleStep: number;
  dealId?: string;
  result?: string;
  profit?: number;
  sessionPnL?: number;
  executedAt: number;
  note?: string;
  cycleNumber: number;
  mode?: 'FTT' | 'CTC';
  isDemoAccount?: boolean;
}

export interface StartFastradePayload {
  mode: 'FTT' | 'CTC';
  asset: { ric: string; name: string; profitRate?: number; iconUrl?: string | null };
  martingale: {
    isEnabled: boolean;
    maxSteps: number;
    baseAmount: number;
    multiplierValue: number;
    multiplierType: 'FIXED' | 'PERCENTAGE';
  };
  isDemoAccount: boolean;
  currency: string;
  currencyIso: string;
  stopLoss?: number;
  stopProfit?: number;
}

export interface UpdateConfigPayload {
  asset: { ric: string; name: string; profitRate?: number; iconUrl?: string | null };
  martingale: {
    isEnabled: boolean;
    maxSteps: number;
    baseAmount: number;
    multiplierValue: number;
    multiplierType: 'FIXED' | 'PERCENTAGE';
    isAlwaysSignal: boolean;
  };
  isDemoAccount: boolean;
  currency: string;
  currencyIso: string;
  duration?: number;
  stopLoss?: number;
  stopProfit?: number;
}

// ─────────────────────────────────────────────
// TYPES — AI Signal (FIXED)
// ─────────────────────────────────────────────
export interface AISignalConfig {
  asset: { ric: string; name: string } | null;
  baseAmount: number;
  martingale: {
    isEnabled: boolean;
    maxSteps: number;
    multiplierValue: number;
    multiplierType: 'FIXED' | 'PERCENTAGE';
    isAlwaysSignal: boolean;
  };
  isDemoAccount: boolean;
  currency: string;
}

export interface AlwaysSignalStatus {
  isActive: boolean;
  currentStep?: number;
  maxSteps?: number;
  totalLoss?: number;
  status?: string;
}

export interface AISignalStats {
  totalTrades: number;
  wins: number;
  losses: number;
  sessionPnL: number;
}

export interface AISignalStatus {
  isActive: boolean;
  botState: string;
  totalOrders?: number;
  pendingOrders?: number;
  executedOrders?: number;
  activeMartingaleSequences?: number;
  wsConnected?: boolean;
  alwaysSignalStatus?: AlwaysSignalStatus;
  monitoringStatus?: {
    is_active: boolean;
    active_monitoring_count: number;
  };
  stats?: AISignalStats;
  sessionPnL?: number;
  totalWins?: number;
  totalLosses?: number;
  totalTrades?: number;
  config?: AISignalConfig;
}

export interface AISignalOrder {
  id: string;
  assetRic: string;
  assetName: string;
  trend: string;
  amount: number;
  executionTime: number;
  receivedAt: number;
  originalMessage: string;
  isExecuted: boolean;
  result?: string;
  status: string;
  martingaleStep: number;
  maxMartingaleSteps: number;
}

export interface UpdateAISignalConfigPayload {
  baseAmount?: number;
  isDemoAccount?: boolean;
  martingaleEnabled?: boolean;
  maxSteps?: number;
  multiplierValue?: number;
  isAlwaysSignal?: boolean;
}

// ─────────────────────────────────────────────
// TYPES — Indicator
// ─────────────────────────────────────────────
export type IndicatorType = 'SMA' | 'EMA' | 'RSI';

export interface IndicatorConfig {
  asset: { ric: string; name: string } | null;
  isDemoAccount: boolean;
  settings: {
    type: IndicatorType;
    period: number;
    rsiOverbought: number;
    rsiOversold: number;
    isEnabled: boolean;
    sensitivity: number;
    amount: number;
  };
  martingale: {
    isEnabled: boolean;
    maxSteps: number;
    baseAmount: number;
    multiplierValue: number;
    multiplierType: 'FIXED' | 'PERCENTAGE';
    isAlwaysSignal: boolean;
  };
  [key: string]: unknown;
}

export interface IndicatorStatus {
  isRunning: boolean;
  currentIndicatorValue?: number;
  lastTrend?: string | null;
  lastSignalTime?: number | null;
  sessionPnL?: number;
  totalWins?: number;
  totalLosses?: number;
  totalTrades?: number;
  lastStatus?: string;
  indicatorType?: IndicatorType;
  [key: string]: unknown;
}

export interface UpdateIndicatorConfigPayload {
  type?: IndicatorType;
  period?: number;
  rsiOverbought?: number;
  rsiOversold?: number;
  isEnabled?: boolean;
  sensitivity?: number;
  amount?: number;
}

// ─────────────────────────────────────────────
// TYPES — Momentum
// ─────────────────────────────────────────────
export interface MomentumConfig {
  asset: { ric: string; name: string } | null;
  isDemoAccount: boolean;
  enabledMomentums: {
    candleSabit: boolean;
    dojiTerjepit: boolean;
    dojiPembatalan: boolean;
    bbSarBreak: boolean;
  };
  martingale: {
    isEnabled: boolean;
    maxSteps: number;
    baseAmount: number;
    multiplierValue: number;
    multiplierType: 'FIXED' | 'PERCENTAGE';
    isAlwaysSignal: boolean;
  };
  [key: string]: unknown;
}

export interface MomentumStatus {
  isRunning: boolean;
  lastDetectedPattern?: string | null;
  lastSignalTime?: number | null;
  sessionPnL?: number;
  totalWins?: number;
  totalLosses?: number;
  totalTrades?: number;
  lastStatus?: string;
  [key: string]: unknown;
}

export interface UpdateMomentumConfigPayload {
  candleSabitEnabled?: boolean;
  dojiTerjepitEnabled?: boolean;
  dojiPembatalanEnabled?: boolean;
  bbSarBreakEnabled?: boolean;
  maxSteps?: number;
  multiplierValue?: number;
  baseAmount?: number;
}

export interface MomentumLog {
  id: string;
  orderId: string;
  momentumType: string;
  trend: string;
  amount: number;
  martingaleStep: number;
  dealId?: string;
  result?: string;
  profit?: number;
  sessionPnL?: number;
  executedAt: number;
  note?: string;
  isDemoAccount?: boolean;
}

export interface IndicatorLog {
  id: string;
  orderId: string;
  indicatorType?: string;
  trend: string;
  amount: number;
  martingaleStep: number;
  dealId?: string;
  result?: string;
  profit?: number;
  sessionPnL?: number;
  executedAt: number;
  note?: string;
  cycleNumber?: number;
  isDemoAccount?: boolean;
}

// ─────────────────────────────────────────────
// TYPES — Today Profit
// ─────────────────────────────────────────────
export interface ModeProfitSummary {
  mode: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
}

export interface AssetProfitSummary {
  ric: string;
  name: string;
  pnl: number;
  trades: number;
}

export interface TodayProfitSummary {
  date: string;          // YYYY-MM-DD
  totalPnL: number;
  totalTrades: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
  byMode: Record<string, ModeProfitSummary>;
  byAsset: Record<string, AssetProfitSummary>;
}

// ─────────────────────────────────────────────
// TYPES — Combined Bot Status
// ─────────────────────────────────────────────
export interface CombinedBotStatus {
  isRunning: boolean;
  isLocked: boolean;
  blockedModes: string[];
  schedule?: {
    orders: ScheduleOrder[];
    logs: ExecutionLog[];
  };
  fastrade?: FastradeStatus & { logs?: FastradeLog[] };
  aisignal?: AISignalStatus & { pendingOrders?: AISignalOrder[] };
  indicator?: IndicatorStatus;
  momentum?: MomentumStatus;
}

export interface StartBotPayload {
  mode: string;
  assetRic: string;
  amount: number;
  duration?: number;
  accountType?: 'demo' | 'real';
  martingale?: {
    enabled: boolean;
    maxStep: number;
    multiplier: number;
    alwaysSignal?: boolean;
  };
  timeframe?: string;
}

// ─────────────────────────────────────────────
// API OBJECT
// ─────────────────────────────────────────────
export const api = {
  // ── Auth ──────────────────────────────────
  login: (email: string, password: string) =>
    req<{ accessToken: string; userId: string; email: string; deviceId: string }>(
      'POST', '/auth/login', { email, password }
    ),
  logout: () => req<void>('POST', '/auth/logout'),
  me: () => req<{ userId: string; email: string }>('GET', '/auth/me'),

  // ── Profile ───────────────────────────────
  balance: () => req<ProfileBalance>('GET', '/profile/balance'),
  getProfile: () => req<{
    id: number;
    email: string;
    firstName?: string;
    lastName?: string;
    nickname?: string;
    phone?: string;
    emailVerified?: boolean;
    phoneVerified?: boolean;
    gender?: string;
    country?: string;
    birthday?: string;
    registeredAt?: string;
    registrationCountryIso?: string;
    avatar?: string;
    personalDataLocked?: boolean;
    docsVerified?: boolean;
  }>('GET', '/profile'),

  // ── Assets ───────────────────────────────
  getAssets: () => req<StockityAsset[]>('GET', '/schedule/assets'),

  // ── Schedule Config ───────────────────────
  getConfig:    () => req<ScheduleConfig>('GET', '/schedule/config'),
  updateConfig: (data: UpdateConfigPayload) =>
    req<ScheduleConfig>('PUT', '/schedule/config', data),

  // ── Schedule Orders ───────────────────────
  getOrders:   () => req<ScheduleOrder[]>('GET', '/schedule/orders'),
  addOrders:   (input: string) =>
    req<{ added: number; errors: string[] }>('POST', '/schedule/orders', { input }),
  deleteOrder: (id: string) => req<void>('DELETE', `/schedule/orders/${id}`),
  clearOrders: () => req<void>('DELETE', '/schedule/orders'),
  parseOrders: (input: string) =>
    req<{ orders: ScheduleOrder[]; errors: string[] }>('POST', '/schedule/parse', { input }),

  // ── Schedule Control ──────────────────────
  scheduleStatus: () => req<ScheduleStatus>('GET', '/schedule/status'),
  scheduleStart:  () => req<{ message: string }>('POST', '/schedule/start'),
  scheduleStop:   () => req<{ message: string }>('POST', '/schedule/stop'),
  schedulePause:  () => req<{ message: string }>('POST', '/schedule/pause'),
  scheduleResume: () => req<{ message: string }>('POST', '/schedule/resume'),
  scheduleLogs:   (limit = 100) =>
    req<ExecutionLog[]>('GET', `/schedule/logs?limit=${limit}`),

  /**
   * GET /schedule/tracking
   * Source of truth untuk history order — menyimpan SEMUA order beserta
   * trackingStatus (WIN/LOSE/SKIPPED/MONITORING/PENDING/FAILED) meski order
   * sudah dihapus dari active list oleh backend.
   */
  scheduleTracking: () =>
    req<{
      botState: string;
      orders: Array<{
        id: string;
        time: string;
        trend: 'call' | 'put';
        timeInMillis: number;
        isExecuted: boolean;
        isSkipped: boolean;
        skipReason?: string;
        result?: string;
        trackingStatus: string;  // 'PENDING'|'MONITORING'|'WIN'|'LOSE'|'DRAW'|'FAILED'|'SKIPPED'|'MARTINGALE_STEP_N'
        profit?: number;
        amount?: number;
        executedAt?: number;
        completedAt?: number;
        currentMartingaleStep: number;
        martingaleState?: {
          isActive: boolean;
          currentStep: number;
          maxSteps: number;
          isCompleted: boolean;
          totalLoss: number;
          totalRecovered: number;
        };
      }>;
      sessionPnL: number;
      timestamp: number;
    }>('GET', '/schedule/tracking'),

  // ── Fastrade (FTT + CTC) ──────────────────
  fastradeStart:  (data: StartFastradePayload) =>
    req<{ message: string; mode: string; status: FastradeStatus }>('POST', '/fastrade/start', data),
  fastradeStop:   () => req<{ message: string }>('POST', '/fastrade/stop'),
  fastradeStatus: () => req<FastradeStatus>('GET', '/fastrade/status'),
  fastradeLogs:   (limit = 100) =>
    req<FastradeLog[]>('GET', `/fastrade/logs?limit=${limit}`),

  // ── AI Signal ────────────────────────────
  aiSignalGetConfig:    () => req<AISignalConfig>('GET', '/aisignal/config'),
  aiSignalUpdateConfig: (data: UpdateAISignalConfigPayload) =>
    req<AISignalConfig>('PUT', '/aisignal/config', data),
  aiSignalSetAsset:     (ric: string, name: string) =>
    req<AISignalConfig>('PUT', '/aisignal/config/asset', { ric, name }),
  aiSignalStart:        () => req<{ message: string }>('POST', '/aisignal/start'),
  aiSignalStop:         () => req<{ message: string }>('POST', '/aisignal/stop'),
  aiSignalStatus:       () => req<AISignalStatus>('GET', '/aisignal/status'),
  aiSignalPendingOrders: () => req<AISignalOrder[]>('GET', '/aisignal/orders/pending'),
  aiSignalExecutedOrders: () => req<AISignalOrder[]>('GET', '/aisignal/orders/executed'),
  aiSignalReceive:      (trend: string, executionTime: number, originalMessage?: string) =>
    req<{ message: string }>('POST', '/aisignal/signal', { trend, executionTime, originalMessage: originalMessage ?? '' }),

  // ── Indicator ────────────────────────────
  indicatorGetConfig:    () => req<IndicatorConfig>('GET', '/indicator/config'),
  indicatorUpdateConfig: (data: UpdateIndicatorConfigPayload) =>
    req<IndicatorConfig>('PUT', '/indicator/config', data),
  indicatorSetAsset:     (ric: string, name: string) =>
    req<IndicatorConfig>('PUT', '/indicator/config/asset', { ric, name }),
  indicatorSetMartingale: (data: Partial<IndicatorConfig['martingale']>) =>
    req<IndicatorConfig>('PUT', '/indicator/config/martingale', data),
  indicatorSetAccount:   (isDemoAccount: boolean) =>
    req<IndicatorConfig>('PUT', '/indicator/config/account', { isDemoAccount }),
  indicatorStart:        () => req<{ message: string }>('POST', '/indicator/start'),
  indicatorStop:         () => req<{ message: string }>('POST', '/indicator/stop'),
  indicatorStatus:       () => req<IndicatorStatus>('GET', '/indicator/status'),
  indicatorLogs:         (limit = 100) => req<IndicatorLog[]>('GET', `/indicator/logs?limit=${limit}`),

  // ── Momentum ─────────────────────────────
  momentumGetConfig:    () => req<MomentumConfig>('GET', '/momentum/config'),
  momentumUpdateConfig: (data: UpdateMomentumConfigPayload) =>
    req<MomentumConfig>('PUT', '/momentum/config', data),
  momentumSetAsset:     (ric: string, name: string) =>
    req<MomentumConfig>('PUT', '/momentum/config/asset', { ric, name }),
  momentumSetAccount:   (isDemoAccount: boolean) =>
    req<MomentumConfig>('PUT', '/momentum/config/account', { isDemoAccount }),
  momentumStart:        () => req<{ message: string }>('POST', '/momentum/start'),
  momentumStop:         () => req<{ message: string }>('POST', '/momentum/stop'),
  momentumStatus:       () => req<MomentumStatus>('GET', '/momentum/status'),
  momentumLogs:         (limit = 100) => req<MomentumLog[]>('GET', `/momentum/logs?limit=${limit}`),

  // ── Combined Bot Control ──────────────────
  getStatus: () => req<CombinedBotStatus>('GET', '/bot/status'),
  startBot:  (payload: StartBotPayload) => req<{ message: string }>('POST', '/bot/start', payload),
  stopBot:   (mode: string) => req<{ message: string }>('POST', '/bot/stop', { mode }),

  // ── Today Profit ─────────────────────────
  /** GET /today-profit?date=YYYY-MM-DD — aggregates all modes for a day */
  todayProfit: (date?: string) =>
    req<{ success: boolean; data: TodayProfitSummary }>(
      'GET', `/today-profit${date ? `?date=${date}` : ''}`
    ).then(r => r.data),

  /** GET /today-profit/realtime — includes active session data */
  realtimeProfit: () =>
    req<{ success: boolean; data: TodayProfitSummary }>(
      'GET', '/today-profit/realtime'
    ).then(r => r.data),

  /** GET /today-profit/history?startDate=...&endDate=... */
  profitHistory: (startDate: string, endDate: string) =>
    req<{ success: boolean; data: TodayProfitSummary[] }>(
      'GET', `/today-profit/history?startDate=${startDate}&endDate=${endDate}`
    ).then(r => r.data),
};