import assert from "node:assert/strict";
import test from "node:test";
import { createIncrementalTradeInput } from "../src/goldbit/trade-sync.js";
import type { GoldbitLocalState } from "../src/goldbit/mechanism-types.js";
import type { Execution } from "../src/types/index.js";

const state = (): GoldbitLocalState => ({
  strategy: {
    id: "test",
    name: "test",
    symbol: "SOXL",
    division: 20,
    initialCapital: 20_000,
    cashBalance: 19_800,
    averagePrice: 100,
    quantity: 2,
    tValue: 1,
    mode: "NORMAL",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  trades: [
    {
      id: "toss-order-1",
      type: "BUY",
      orderType: "LOC",
      price: 100,
      quantity: 2,
      fee: 0.2,
      tradedAt: "2026-07-13",
      memo: "Toss orderId: order-1; filledAt: 2026-07-13T20:00:00.000Z"
    }
  ],
  tEvents: [],
  dailyPlanSnapshots: [],
  lastFiveCloses: [],
  closeRecords: [],
  previousClose: 0,
  feeRatePercent: 0.1,
  cycleArchives: []
});

test("partial fill growth creates only the unrecorded execution delta", () => {
  const execution: Execution = {
    id: "order-1",
    symbol: "SOXL",
    side: "BUY",
    orderType: "LOC",
    quantity: 5,
    price: 102,
    fee: 0.5,
    executedAt: "2026-07-13T20:30:00.000Z",
    tradingDate: "2026-07-13"
  };
  const incremental = createIncrementalTradeInput(execution, state());

  assert.equal(incremental?.input.quantity, 3);
  assert.equal(incremental?.input.price, 103.33333333333333);
  assert.equal(incremental?.input.fee, 0.3);
  assert.match(incremental?.input.memo ?? "", /incremental fill/);
});

test("fully recorded execution creates no additional trade", () => {
  const execution: Execution = {
    id: "order-1",
    symbol: "SOXL",
    side: "BUY",
    orderType: "LOC",
    quantity: 2,
    price: 100,
    fee: 0.2,
    executedAt: "2026-07-13T20:30:00.000Z",
    tradingDate: "2026-07-13"
  };

  assert.equal(createIncrementalTradeInput(execution, state()), null);
});
