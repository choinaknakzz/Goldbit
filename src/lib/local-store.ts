"use client";

import { useEffect, useMemo, useState } from "react";
import {
  applyDailyTEventToStrategy,
  applyTradeToStrategy,
  generateNormalDailyPlan,
  generateReverseDailyPlan,
} from "@/lib/calculations";
import { emptyCloseRecords, emptyLastFiveCloses, emptyStrategy } from "@/lib/mock-data";
import type {
  CloseRecord,
  DailyPlan,
  DailyTEvent,
  DailyTEventInput,
  StrategyConfig,
  Trade,
  TradeInput,
} from "@/lib/types";

const STORAGE_KEY = "goldbit.local.v3";
const PREVIOUS_STORAGE_KEY = "goldbit.local.v2";
const LEGACY_STORAGE_KEY = "goldbit.local.v1";

export interface GoldbitLocalState {
  strategy: StrategyConfig;
  trades: Trade[];
  tEvents: DailyTEvent[];
  lastFiveCloses: number[];
  closeRecords: CloseRecord[];
  previousClose: number;
  feeRatePercent: number;
}

const initialState: GoldbitLocalState = {
  strategy: emptyStrategy,
  trades: [],
  tEvents: [],
  lastFiveCloses: emptyLastFiveCloses,
  closeRecords: emptyCloseRecords,
  previousClose: 0,
  feeRatePercent: 0,
};

function getLatestFiveCloses(records: CloseRecord[]) {
  return [...records]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-5)
    .map((record) => record.close);
}

function normalizeCloseRecords(
  parsed: Partial<GoldbitLocalState>,
): CloseRecord[] {
  if (Array.isArray(parsed.closeRecords)) {
    return parsed.closeRecords
      .filter(
        (record): record is CloseRecord =>
          typeof record?.date === "string" &&
          typeof record?.close === "number" &&
          Number.isFinite(record.close),
      )
      .sort((left, right) => left.date.localeCompare(right.date));
  }

  if (Array.isArray(parsed.lastFiveCloses)) {
    return parsed.lastFiveCloses
      .map(Number)
      .filter((close) => Number.isFinite(close) && close > 0)
      .map((close, index) => ({
        date: `legacy-${index + 1}`,
        close,
        source: "Legacy",
      }));
  }

  return initialState.closeRecords;
}

function readState(): GoldbitLocalState {
  if (typeof window === "undefined") return initialState;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return initialState;

  try {
    const parsed = JSON.parse(raw) as Partial<GoldbitLocalState>;
    const closeRecords = normalizeCloseRecords(parsed);
    const latestFiveCloses = getLatestFiveCloses(closeRecords);
    return {
      strategy: { ...initialState.strategy, ...parsed.strategy },
      trades: Array.isArray(parsed.trades) ? parsed.trades : initialState.trades,
      tEvents: Array.isArray(parsed.tEvents)
        ? parsed.tEvents
        : initialState.tEvents,
      lastFiveCloses:
        latestFiveCloses.length > 0
          ? latestFiveCloses
          : initialState.lastFiveCloses,
      closeRecords,
      previousClose:
        typeof parsed.previousClose === "number"
          ? parsed.previousClose
          : initialState.previousClose,
      feeRatePercent:
        typeof parsed.feeRatePercent === "number"
          ? parsed.feeRatePercent
          : initialState.feeRatePercent,
    };
  } catch {
    return initialState;
  }
}

function writeState(state: GoldbitLocalState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createTradeRecord(
  strategyBefore: StrategyConfig,
  strategyAfter: StrategyConfig,
  input: TradeInput,
): Trade {
  const amount = Number((input.price * input.quantity).toFixed(2));

  return {
    id: `trade-${Date.now()}`,
    strategyId: strategyBefore.id,
    type: input.type,
    orderType: input.orderType,
    price: input.price,
    quantity: input.quantity,
    amount,
    fee: input.fee,
    tBefore: strategyBefore.tValue,
    tAfter: strategyAfter.tValue,
    cashBefore: strategyBefore.cashBalance,
    cashAfter: strategyAfter.cashBalance,
    quantityBefore: strategyBefore.quantity,
    quantityAfter: strategyAfter.quantity,
    averagePriceBefore: strategyBefore.averagePrice,
    averagePriceAfter: strategyAfter.averagePrice,
    mode: strategyBefore.mode,
    reason: input.reason,
    tradedAt: input.tradedAt,
    memo: input.memo,
  };
}

export function useGoldbitStore() {
  const [state, setState] = useState<GoldbitLocalState>(initialState);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    window.localStorage.removeItem(PREVIOUS_STORAGE_KEY);
    setState(readState());
    setIsLoaded(true);
  }, []);

  const persist = (nextState: GoldbitLocalState) => {
    setState(nextState);
    writeState(nextState);
  };

  const updateStrategy = (
    strategy: StrategyConfig,
    closeRecords = state.closeRecords,
    feeRatePercent = state.feeRatePercent,
  ) => {
    const nextLastFiveCloses = getLatestFiveCloses(closeRecords);
    persist({
      ...state,
      strategy: {
        ...strategy,
        symbol: "SOXL",
        updatedAt: new Date().toISOString(),
      },
      closeRecords,
      lastFiveCloses:
        nextLastFiveCloses.length > 0
          ? nextLastFiveCloses
          : state.lastFiveCloses,
      feeRatePercent,
    });
  };

  const updateLatestClose = (record: CloseRecord) => {
    const nextRecords = [
      ...state.closeRecords.filter((item) => item.date !== record.date),
      record,
    ].sort((left, right) => left.date.localeCompare(right.date));
    const nextCloses = getLatestFiveCloses(nextRecords);
    persist({
      ...state,
      previousClose: record.close,
      closeRecords: nextRecords,
      lastFiveCloses: nextCloses,
    });
  };

  const addTrade = (input: TradeInput) => {
    const strategyAfter = applyTradeToStrategy(state.strategy, input);
    const trade = createTradeRecord(state.strategy, strategyAfter, input);
    persist({
      ...state,
      strategy: strategyAfter,
      trades: [trade, ...state.trades],
    });
  };

  const addDailyTEvent = (input: DailyTEventInput) => {
    const existingEvents = state.tEvents.filter((event) => event.date !== input.date);
    const baseT =
      state.tEvents.length > 0
        ? [...state.tEvents].sort((left, right) => left.date.localeCompare(right.date))[0]
            .tBefore
        : state.strategy.tValue;
    const eventInputs = [
      ...existingEvents,
      {
        ...input,
        id: `t-event-${Date.now()}`,
        tBefore: baseT,
        tAfter: baseT,
      },
    ].sort((left, right) => left.date.localeCompare(right.date));

    let replayStrategy = { ...state.strategy, tValue: baseT };
    const replayedEvents: DailyTEvent[] = eventInputs.map((event) => {
      const strategyAfter = applyDailyTEventToStrategy(replayStrategy, event);
      const replayedEvent = {
        ...event,
        tBefore: replayStrategy.tValue,
        tAfter: strategyAfter.tValue,
      };
      replayStrategy = strategyAfter;
      return replayedEvent;
    });

    persist({
      ...state,
      strategy: replayStrategy,
      tEvents: [...replayedEvents].sort((left, right) =>
        right.date.localeCompare(left.date),
      ),
    });
  };

  const resetState = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setState(initialState);
  };

  const plan: DailyPlan = useMemo(() => {
    if (state.strategy.mode === "REVERSE") {
      const isFirstReverseDay = Boolean(state.strategy.reverseStartedAt);
      return generateReverseDailyPlan(
        state.strategy,
        state.lastFiveCloses,
        isFirstReverseDay,
      );
    }

    return generateNormalDailyPlan(state.strategy, state.previousClose);
  }, [state]);

  return {
    ...state,
    plan,
    isLoaded,
    updateStrategy,
    updateLatestClose,
    addTrade,
    addDailyTEvent,
    resetState,
  };
}
