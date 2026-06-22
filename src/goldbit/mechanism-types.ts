export type Division = 20 | 40;
export type StrategyMode = "NORMAL" | "REVERSE";
export type TradeType = "BUY" | "SELL";
export type GoldbitOrderType = "LOC" | "MOC" | "LIMIT";

export interface StrategyConfig {
  id: string;
  name: string;
  symbol: "SOXL";
  division: Division;
  initialCapital: number;
  cashBalance: number;
  averagePrice: number;
  quantity: number;
  tValue: number;
  mode: StrategyMode;
  reverseStartedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlannedOrder {
  side: TradeType;
  orderType: GoldbitOrderType;
  price: number | null;
  quantity: number | null;
  amount: number | null;
  reason: string;
  priority: number;
}

export interface DailyPlan {
  date: string;
  symbol: "SOXL";
  mode: StrategyMode;
  phase: "FIRST_BUY" | "FIRST_HALF" | "SECOND_HALF" | "REVERSE_FIRST_DAY" | "REVERSE_ACTIVE";
  tValue: number;
  averagePrice: number;
  cashBalance: number;
  quantity: number;
  starRate?: number;
  previousClose?: number;
  starPrice?: number;
  buyPrice?: number;
  sellPrice?: number;
  limitSellPrice?: number;
  buyOrders: PlannedOrder[];
  sellOrders: PlannedOrder[];
  warnings: string[];
}

export interface DailyPlanSnapshot {
  date: string;
  plan: DailyPlan;
  createdAt: string;
  updatedAt: string;
}

export interface Trade {
  id: string;
  tradedAt: string;
}

export interface GoldbitLocalState {
  strategy: StrategyConfig;
  trades: Trade[];
  dailyPlanSnapshots: DailyPlanSnapshot[];
  lastFiveCloses: number[];
  closeRecords: Array<{ date: string; close: number; source?: string }>;
  previousClose: number;
}
