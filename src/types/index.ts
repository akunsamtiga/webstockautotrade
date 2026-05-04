export type BotState    = 'RUNNING' | 'PAUSED' | 'STOPPED' | 'IDLE';
export type Trend       = 'UP' | 'DOWN';
export type OrderResult = 'WIN' | 'LOSS' | 'PENDING';

export interface Order {
  id:           string;
  time:         string;
  trend:        Trend;
  isExecuted:   boolean;
  isSkipped:    boolean;
  timeInMillis: number;
  martingaleState?: {
    isActive:       boolean;
    currentStep:    number;
    maxSteps:       number;
    isCompleted:    boolean;
    totalLoss:      number;
    totalRecovered: number;
  };
}

export interface ScheduleStatus {
  botState?:       BotState;
  activeOrders?:   number;
  executedOrders?: number;
  skippedOrders?:  number;
  totalOrders?:    number;
  startedAt?:      string;
  updatedAt?:      string;
  [key: string]:   unknown;
}

export interface ExecutionLog {
  id:          string;
  orderId?:    string;
  time?:       string;
  trend?:      Trend;
  amount?:     number;
  result?:     OrderResult;
  profit?:     number;
  executedAt?: number;
  message?:    string;
}

export interface StockityAsset {
  ric:        string;
  name:       string;
  type:       number;
  typeName:   string;
  profitRate: number;
  iconUrl:    string | null;
}

export type ScheduleConfig = Record<string, unknown>;
export type ProfileBalance = Record<string, unknown> & {
  balance?:      number;
  real_balance?: number;
  demo_balance?: number;
  currency?:     string;
};