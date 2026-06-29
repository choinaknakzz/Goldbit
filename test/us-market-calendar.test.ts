import assert from "node:assert/strict";
import test from "node:test";
import { getNewYorkDateKey, isNyseTradingDate } from "../src/market/us-market-calendar.js";

test("NYSE calendar excludes weekends and regular exchange holidays", () => {
  assert.equal(isNyseTradingDate("2026-06-27"), false);
  assert.equal(isNyseTradingDate("2026-01-19"), false);
  assert.equal(isNyseTradingDate("2026-04-03"), false);
  assert.equal(isNyseTradingDate("2026-06-19"), false);
  assert.equal(isNyseTradingDate("2026-11-26"), false);
});

test("NYSE calendar keeps normal and early-close sessions as trading dates", () => {
  assert.equal(isNyseTradingDate("2026-06-29"), true);
  assert.equal(isNyseTradingDate("2026-11-27"), true);
});

test("New York date follows the market date at both KST schedule times", () => {
  assert.equal(getNewYorkDateKey(new Date("2026-06-29T08:00:00.000Z")), "2026-06-29"); // 17:00 KST
  assert.equal(getNewYorkDateKey(new Date("2026-06-29T20:30:00.000Z")), "2026-06-29"); // 05:30 KST next day
});

test("Saturday New Year's observance is applied to the prior year", () => {
  assert.equal(isNyseTradingDate("2021-12-31"), false);
});
