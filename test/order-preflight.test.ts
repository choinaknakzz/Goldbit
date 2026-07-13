import assert from "node:assert/strict";
import test from "node:test";
import { calculatePlannedBuyAmount, evaluateBuyingPower } from "../src/goldbit/order-preflight.js";

test("planned buy amount uses order limit price and excludes sells", () => {
  const amount = calculatePlannedBuyAmount([
    { side: "BUY", quantity: 3, estimatedPrice: 101.25, estimatedAmount: 300 },
    { side: "BUY", quantity: 2, estimatedPrice: 99.5, estimatedAmount: 199 },
    { side: "SELL", quantity: 10, estimatedPrice: 120, estimatedAmount: 1200 }
  ]);

  assert.equal(amount, 502.75);
});

test("planned buy amount falls back to estimated amount when price is unavailable", () => {
  const amount = calculatePlannedBuyAmount([
    { side: "BUY", quantity: 2, estimatedPrice: null, estimatedAmount: 250.5 }
  ]);

  assert.equal(amount, 250.5);
});

test("buying power check reports shortage without mutating orders", () => {
  const check = evaluateBuyingPower(
    [{ side: "BUY", quantity: 4, estimatedPrice: 100, estimatedAmount: 400 }],
    150.69
  );

  assert.deepEqual(check, {
    sufficient: false,
    requiredAmount: 400,
    availableAmount: 150.69,
    shortfall: 249.31
  });
});

test("sell-only plans pass with zero buying power", () => {
  const check = evaluateBuyingPower(
    [{ side: "SELL", quantity: 4, estimatedPrice: 100, estimatedAmount: 400 }],
    0
  );

  assert.equal(check.sufficient, true);
  assert.equal(check.requiredAmount, 0);
});
