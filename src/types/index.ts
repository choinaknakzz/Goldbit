export type OrderSide = "BUY" | "SELL";
export type OrderType = "LOC" | "LIMIT" | "MARKET";
export type CandidateStatus = "PENDING" | "APPROVED" | "CANCELED" | "EXPIRED" | "EXECUTED" | "FAILED";
export type ExecutionStatus = "SUCCESS" | "FAILED";

export interface AvailableCash {
  currency: string;
  amount: number;
}

export interface Position {
  symbol: string;
  quantity: number;
  averagePrice: number;
}

export interface CurrentPrice {
  symbol: string;
  price: number;
  currency: string;
  asOf: string;
}

export interface Execution {
  id: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price?: number;
  executedAt: string;
}

export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  limitPrice?: number;
  accountId: string;
  clientOrderId?: string;
}

export interface OrderResult {
  brokerOrderId?: string;
  status: string;
  raw: unknown;
}

export interface StrategyInput {
  symbol: string;
  currentPrice?: CurrentPrice;
  holdingQuantity?: number;
  averagePrice?: number;
  availableCash?: AvailableCash;
  recentExecutions?: Execution[];
}

export interface CandidateDraft {
  id: string;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  estimatedPrice?: number;
  estimatedAmount?: number;
  status: CandidateStatus;
  rawData?: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
}
