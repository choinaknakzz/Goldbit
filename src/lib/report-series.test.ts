import { describe, expect, it } from "vitest";
import { buildReportSeries } from "./report-series";
import type { DailyTEvent, StrategyConfig, Trade } from "./types";

const strategy: StrategyConfig = {
  id: "strategy-test",
  name: "Test",
  symbol: "SOXL",
  division: 20,
  initialCapital: 10000,
  cashBalance: 9548.06,
  averagePrice: 225.97,
  quantity: 2,
  tValue: 1.5,
  mode: "NORMAL",
  createdAt: "2026-05-29T00:00:00.000Z",
  updatedAt: "2026-06-02T00:00:00.000Z",
};

const trades: Trade[] = [
  {
    id: "trade-1",
    strategyId: strategy.id,
    type: "BUY",
    orderType: "LOC",
    price: 224.34,
    quantity: 1,
    amount: 224.34,
    fee: 0.34,
    tBefore: 0,
    tAfter: 0,
    cashBefore: 10000,
    cashAfter: 9775.32,
    quantityBefore: 0,
    quantityAfter: 1,
    averagePriceBefore: 0,
    averagePriceAfter: 224.68,
    mode: "NORMAL",
    reason: "First buy",
    tradedAt: "2026-05-29",
  },
  {
    id: "trade-2",
    strategyId: strategy.id,
    type: "BUY",
    orderType: "LOC",
    price: 227.03,
    quantity: 1,
    amount: 227.03,
    fee: 0.23,
    tBefore: 1,
    tAfter: 1,
    cashBefore: 9775.32,
    cashAfter: 9548.06,
    quantityBefore: 1,
    quantityAfter: 2,
    averagePriceBefore: 224.68,
    averagePriceAfter: 225.97,
    mode: "NORMAL",
    reason: "Second buy",
    tradedAt: "2026-06-01",
  },
];

const tEvents: DailyTEvent[] = [
  {
    id: "t-event-1",
    date: "2026-05-29",
    mode: "NORMAL",
    normalTEvent: "FULL_BUY",
    tBefore: 0,
    tAfter: 1,
  },
  {
    id: "t-event-2",
    date: "2026-06-02",
    mode: "NORMAL",
    normalTEvent: "HALF_BUY",
    tBefore: 1,
    tAfter: 1.5,
  },
];

describe("buildReportSeries", () => {
  it("rolls trade and T events into one point per report day", () => {
    const series = buildReportSeries({
      strategy,
      trades,
      tEvents,
      closeRecords: [
        { date: "2026-05-29", close: 224.34 },
        { date: "2026-06-01", close: 227.03 },
      ],
      markPrice: 227.03,
    });

    expect(series.map((point) => point.date)).toEqual([
      "05-28",
      "05-29",
      "06-01",
      "06-02",
    ]);
    expect(series.map((point) => point.tValue)).toEqual([0, 1, 1, 1.5]);
    expect(series[0].cashBalance).toBe(10000);
    expect(series[0].quantity).toBe(0);
    expect(series.at(-1)?.quantity).toBe(2);
  });
});
