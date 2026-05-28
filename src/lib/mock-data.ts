import type { CloseRecord, StrategyConfig, Trade } from "./types";

export const mockStrategy: StrategyConfig = {
  id: "strategy-soxl-v1",
  name: "GoldOrbit SOXL Loop",
  symbol: "SOXL",
  division: 40,
  initialCapital: 20000,
  cashBalance: 14320.52,
  averagePrice: 38.3,
  quantity: 142,
  tValue: 8.6,
  mode: "NORMAL",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-28T00:00:00.000Z",
};

export const emptyStrategy: StrategyConfig = {
  id: "strategy-soxl-v1",
  name: "GoldOrbit SOXL Loop",
  symbol: "SOXL",
  division: 40,
  initialCapital: 20000,
  cashBalance: 20000,
  averagePrice: 0,
  quantity: 0,
  tValue: 0,
  mode: "NORMAL",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const emptyLastFiveCloses = [0, 0, 0, 0, 0];
export const emptyCloseRecords: CloseRecord[] = [];

export const mockLastFiveCloses = [39.2, 38.7, 40.1, 39.6, 40.4];

export const mockTrades: Trade[] = [
  {
    id: "trade-1",
    strategyId: mockStrategy.id,
    type: "BUY",
    orderType: "LOC",
    price: 37.9,
    quantity: 14,
    amount: 530.6,
    fee: 0.5,
    tBefore: 7.6,
    tAfter: 8.6,
    cashBefore: 14851.62,
    cashAfter: 14320.52,
    quantityBefore: 128,
    quantityAfter: 142,
    averagePriceBefore: 38.34,
    averagePriceAfter: 38.3,
    mode: "NORMAL",
    reason: "Star point LOC buy",
    tradedAt: "2026-05-27",
    memo: "Filled near close",
  },
  {
    id: "trade-2",
    strategyId: mockStrategy.id,
    type: "SELL",
    orderType: "LOC",
    price: 39.45,
    quantity: 32,
    amount: 1262.4,
    fee: 0.5,
    tBefore: 10.13,
    tAfter: 7.6,
    cashBefore: 13589.72,
    cashAfter: 14851.62,
    quantityBefore: 160,
    quantityAfter: 128,
    averagePriceBefore: 38.34,
    averagePriceAfter: 38.34,
    mode: "NORMAL",
    reason: "Quarter sell",
    tradedAt: "2026-05-24",
  },
];

export const historySeries = [
  { date: "05-20", tValue: 5.8, averagePrice: 38.9, cashBalance: 16210, quantity: 112 },
  { date: "05-21", tValue: 6.8, averagePrice: 38.7, cashBalance: 15690, quantity: 126 },
  { date: "05-22", tValue: 7.8, averagePrice: 38.5, cashBalance: 15155, quantity: 140 },
  { date: "05-24", tValue: 7.6, averagePrice: 38.34, cashBalance: 14851.62, quantity: 128 },
  { date: "05-27", tValue: 8.6, averagePrice: 38.3, cashBalance: 14320.52, quantity: 142 },
];
