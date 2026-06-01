import { describe, expect, it } from "vitest";
import {
  applyNormalTChange,
  applyReverseBuyT,
  applyReverseSellT,
  getBuyPrice,
  getDailyBuyAmount,
  getFirstBuyLocPrice,
  getQuarterSellQuantity,
  getReverseFirstSellQuantity,
  getReverseStarPrice,
  getSoxlLimitSellPrice,
  getSoxlStarRate,
  getStarPrice,
  generateNormalDailyPlan,
  shouldEnterReverseMode,
  shouldExitReverseMode,
} from "./calculations";
import type { StrategyConfig } from "./types";

describe("SOXL infinite buying calculations", () => {
  it("calculates SOXL 20-division star rate", () => {
    expect(getSoxlStarRate(8.6, 20)).toBeCloseTo(0.028);
  });

  it("calculates SOXL 40-division star rate", () => {
    expect(getSoxlStarRate(12, 40)).toBeCloseTo(0.08);
  });

  it("calculates star price", () => {
    expect(getStarPrice(38.3, 8.6, 20)).toBe(39.37);
  });

  it("calculates buy point one cent below star price", () => {
    expect(getBuyPrice(39.37)).toBe(39.36);
  });

  it("calculates daily one-turn buy amount", () => {
    expect(getDailyBuyAmount(19522, 1, 40)).toBe(500.56);
  });

  it("calculates first buy LOC price from previous close", () => {
    expect(getFirstBuyLocPrice(40)).toBe(44.8);
  });

  it("sizes first buy quantity from previous close, not the buffered LOC price", () => {
    const strategy: StrategyConfig = {
      id: "strategy-test",
      name: "Test",
      symbol: "SOXL",
      division: 20,
      initialCapital: 10000,
      cashBalance: 10000,
      averagePrice: 0,
      quantity: 0,
      tValue: 0,
      mode: "NORMAL",
      createdAt: "2026-05-29T00:00:00.000Z",
      updatedAt: "2026-05-29T00:00:00.000Z",
    };

    const plan = generateNormalDailyPlan(strategy, 224.63);

    expect(plan.buyOrders[0]).toMatchObject({
      price: 251.59,
      quantity: 2,
      amount: 449.26,
    });
  });

  it("splits first-half buy orders around one daily budget", () => {
    const strategy: StrategyConfig = {
      id: "strategy-test",
      name: "Test",
      symbol: "SOXL",
      division: 20,
      initialCapital: 10000,
      cashBalance: 9500,
      averagePrice: 224.34,
      quantity: 1,
      tValue: 1,
      mode: "NORMAL",
      createdAt: "2026-05-29T00:00:00.000Z",
      updatedAt: "2026-05-29T00:00:00.000Z",
    };

    const plan = generateNormalDailyPlan(strategy, 224.63);
    const totalBuyAmount = plan.buyOrders.reduce(
      (sum, order) => sum + (order.amount ?? 0),
      0,
    );

    expect(getDailyBuyAmount(9500, 1, 20)).toBe(500);
    expect(plan.buyOrders).toHaveLength(2);
    expect(plan.buyOrders[0].quantity).toBe(1);
    expect(plan.buyOrders[1].quantity).toBe(1);
    expect(totalBuyAmount).toBeCloseTo(489.05);
  });

  it("omits zero-quantity quarter sell orders", () => {
    const strategy: StrategyConfig = {
      id: "strategy-test",
      name: "Test",
      symbol: "SOXL",
      division: 20,
      initialCapital: 10000,
      cashBalance: 9500,
      averagePrice: 224.34,
      quantity: 1,
      tValue: 1,
      mode: "NORMAL",
      createdAt: "2026-05-29T00:00:00.000Z",
      updatedAt: "2026-05-29T00:00:00.000Z",
    };

    const plan = generateNormalDailyPlan(strategy, 224.63);

    expect(plan.sellOrders).toHaveLength(1);
    expect(plan.sellOrders[0]).toMatchObject({
      orderType: "LIMIT",
      quantity: 1,
    });
  });

  it("applies normal-mode T changes", () => {
    expect(applyNormalTChange(7, "FULL_BUY")).toBe(8);
    expect(applyNormalTChange(7, "HALF_BUY")).toBe(7.5);
    expect(applyNormalTChange(7, "QUARTER_SELL")).toBe(5.25);
    expect(applyNormalTChange(7, "LIMIT_SELL_AND_FULL_LOC_BUY")).toBe(2.75);
    expect(applyNormalTChange(7, "LIMIT_SELL_AND_HALF_LOC_BUY")).toBe(2.25);
  });

  it("calculates quarter sell quantity", () => {
    expect(getQuarterSellQuantity(141)).toBe(35);
  });

  it("calculates SOXL 20% limit sell price", () => {
    expect(getSoxlLimitSellPrice(40)).toBe(48);
  });

  it("checks reverse mode entry condition", () => {
    expect(shouldEnterReverseMode(19.01, 20)).toBe(true);
    expect(shouldEnterReverseMode(39.01, 40)).toBe(true);
    expect(shouldEnterReverseMode(19, 20)).toBe(false);
  });

  it("calculates reverse first-day sell quantity", () => {
    expect(getReverseFirstSellQuantity(198, 20)).toBe(19);
    expect(getReverseFirstSellQuantity(198, 40)).toBe(9);
  });

  it("calculates reverse star price from five closes", () => {
    expect(getReverseStarPrice([45, 46, 47, 48, 49])).toBe(47);
  });

  it("rejects invalid reverse star closes", () => {
    expect(() => getReverseStarPrice([0, 46, 47, 48, 49])).toThrow(
      "five positive closes",
    );
  });

  it("applies reverse-mode T changes", () => {
    expect(applyReverseSellT(39.5, 40)).toBeCloseTo(37.525);
    expect(applyReverseBuyT(37.525, 40)).toBeCloseTo(38.14375);
    expect(applyReverseSellT(19.5, 20)).toBeCloseTo(17.55);
  });

  it("checks reverse mode exit condition for SOXL", () => {
    expect(shouldExitReverseMode(32.01, 40)).toBe(true);
    expect(shouldExitReverseMode(32, 40)).toBe(false);
  });
});
