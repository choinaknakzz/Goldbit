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
  shouldEnterReverseMode,
  shouldExitReverseMode,
} from "./calculations";

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
