import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDailyTEventToStrategy,
  generateReverseDailyPlan
} from "../src/goldbit/mechanism.js";
import type { StrategyConfig } from "../src/goldbit/mechanism-types.js";

const strategy = (overrides: Partial<StrategyConfig> = {}): StrategyConfig => ({
  id: "test",
  name: "test",
  symbol: "SOXL",
  division: 20,
  initialCapital: 20_000,
  cashBalance: 5_000,
  averagePrice: 100,
  quantity: 100,
  tValue: 19,
  mode: "NORMAL",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides
});

test("normal T crossing 20 records reverse entry date", () => {
  const next = applyDailyTEventToStrategy(strategy(), {
    date: "2026-07-13",
    mode: "NORMAL",
    normalTEvent: "FULL_BUY"
  });

  assert.equal(next.tValue, 20);
  assert.equal(next.mode, "REVERSE");
  assert.equal(next.reverseStartedAt, "2026-07-13");
});

test("reverse active plan creates no candidates without five closes", () => {
  const plan = generateReverseDailyPlan(strategy({ mode: "REVERSE", tValue: 20 }), [100, 101, 102, 103], false);

  assert.equal(plan.buyOrders.length, 0);
  assert.equal(plan.sellOrders.length, 0);
  assert.match(plan.warnings.join(" "), /five valid recent closes/i);
});

test("reverse first day exposes manual MOC action", () => {
  const plan = generateReverseDailyPlan(strategy({ mode: "REVERSE", tValue: 20 }), [100, 101, 102, 103, 104], true);

  assert.equal(plan.sellOrders.length, 1);
  assert.equal(plan.sellOrders[0]?.orderType, "MOC");
  assert.match(plan.warnings.join(" "), /manual action required/i);
});
