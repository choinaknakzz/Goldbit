export type Division = 20 | 40;
export type SymbolCode = "SOXL";
export type StrategyMode = "NORMAL" | "REVERSE";
export type TradeType = "BUY" | "SELL";
export type OrderType = "LOC" | "MOC" | "LIMIT";
export type PendingTradeStatus = "NEEDS_REVIEW" | "CONFIRMED" | "REJECTED";
export type NormalTEvent =
  | "FULL_BUY"
  | "HALF_BUY"
  | "QUARTER_SELL"
  | "LIMIT_SELL_AND_FULL_LOC_BUY"
  | "LIMIT_SELL_AND_HALF_LOC_BUY";

export interface CloseRecord {
  date: string;
  close: number;
  source?: string;
}

export type DailyPhase =
  | "FIRST_BUY"
  | "FIRST_HALF"
  | "SECOND_HALF"
  | "REVERSE_FIRST_DAY"
  | "REVERSE_ACTIVE";

export interface StrategyConfig {
  id: string;
  name: string;
  symbol: SymbolCode;
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
  orderType: OrderType;
  price: number | null;
  quantity: number | null;
  amount: number | null;
  reason: string;
  priority: number;
}

export interface DailyPlan {
  date: string;
  symbol: SymbolCode;
  mode: StrategyMode;
  phase: DailyPhase;
  tValue: number;
  averagePrice: number;
  cashBalance: number;
  quantity: number;
  starRate?: number;
  starPrice?: number;
  previousClose?: number;
  buyPrice?: number;
  sellPrice?: number;
  limitSellPrice?: number;
  buyOrders: PlannedOrder[];
  sellOrders: PlannedOrder[];
  warnings: string[];
}

export interface Trade {
  id: string;
  strategyId: string;
  type: TradeType;
  orderType: OrderType;
  price: number;
  quantity: number;
  amount: number;
  fee: number;
  tBefore: number;
  tAfter: number;
  cashBefore: number;
  cashAfter: number;
  quantityBefore: number;
  quantityAfter: number;
  averagePriceBefore: number;
  averagePriceAfter: number;
  mode: StrategyMode;
  reason: string;
  tradedAt: string;
  memo?: string;
}

export interface TradeInput {
  type: TradeType;
  orderType: OrderType;
  price: number;
  quantity: number;
  fee: number;
  reason: string;
  tradedAt: string;
  memo?: string;
}

export interface PendingTrade {
  id: string;
  source: "SCREENSHOT" | "TELEGRAM";
  status: PendingTradeStatus;
  rawText: string;
  parsedTrade: TradeInput | null;
  confidence: number;
  notes: string[];
  createdAt: string;
  confirmedTradeId?: string;
  resolvedAt?: string;
}

export interface DailyTEventInput {
  date: string;
  mode: StrategyMode;
  normalTEvent?: NormalTEvent;
  reverseTEvent?: "SELL" | "BUY";
  memo?: string;
}

export interface DailyTEvent extends DailyTEventInput {
  id: string;
  tBefore: number;
  tAfter: number;
}

export interface CycleDailySnapshot {
  date: string;
  tradeCount: number;
  buyAmount: number;
  sellAmount: number;
  fee: number;
  tValue: number;
  cashBalance: number;
  quantity: number;
  averagePrice: number;
  totalAssets: number;
}

export interface CycleArchive {
  id: string;
  name: string;
  startedAt: string;
  endedAt: string;
  tradeStartDate: string;
  tradeEndDate: string;
  initialCapital: number;
  finalCashBalance: number;
  finalAveragePrice: number;
  finalQuantity: number;
  finalTValue: number;
  finalTotalAssets: number;
  realizedPnl: number;
  assetChange: number;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  trades: Trade[];
  tEvents: DailyTEvent[];
  closeRecords: CloseRecord[];
  dailySnapshots: CycleDailySnapshot[];
  archivedAt: string;
}
