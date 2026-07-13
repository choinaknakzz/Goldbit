import type { GoldbitLocalState } from "./mechanism-types.js";
import { readGoldbitStateSnapshot, writeGoldbitState } from "./state.js";

const FIXED_DIVISION = 20;

const roundMoney = (value: number): number => Number(value.toFixed(2));

export const parseCapitalAmount = (text: string): number | null => {
  const normalized = text.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : null;
};

export const isWaitingForCycleCapital = (state: GoldbitLocalState): boolean => {
  return Boolean(state.pendingCycleCapitalInput);
};

export const applyNextCycleCapital = (amount: number): GoldbitLocalState => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Next cycle capital must be greater than 0.");
  }

  const snapshot = readGoldbitStateSnapshot();
  const state = snapshot.state;
  const now = new Date().toISOString();
  const capital = roundMoney(amount);
  const nextState: GoldbitLocalState = {
    ...state,
    strategy: {
      ...state.strategy,
      division: FIXED_DIVISION,
      initialCapital: capital,
      cashBalance: capital,
      averagePrice: 0,
      quantity: 0,
      tValue: 0,
      mode: "NORMAL",
      reverseStartedAt: undefined,
      updatedAt: now
    },
    pendingCycleCapitalInput: undefined
  };

  writeGoldbitState(nextState, snapshot.rawData);
  return nextState;
};
