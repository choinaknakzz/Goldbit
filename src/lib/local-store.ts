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
  CycleArchive,
  CycleDailySnapshot,
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
  cycleArchives: CycleArchive[];
}

const initialState: GoldbitLocalState = {
  strategy: emptyStrategy,
  trades: [],
  tEvents: [],
  lastFiveCloses: emptyLastFiveCloses,
  closeRecords: emptyCloseRecords,
  previousClose: 0,
  feeRatePercent: 0,
  cycleArchives: [],
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

function normalizeState(parsed: Partial<GoldbitLocalState>): GoldbitLocalState {
  try {
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
      cycleArchives: Array.isArray(parsed.cycleArchives)
        ? parsed.cycleArchives
        : initialState.cycleArchives,
    };
  } catch {
    return initialState;
  }
}

function readLocalState(): GoldbitLocalState {
  if (typeof window === "undefined") return initialState;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return initialState;

  try {
    return normalizeState(JSON.parse(raw) as Partial<GoldbitLocalState>);
  } catch {
    return initialState;
  }
}

async function readServerState(): Promise<GoldbitLocalState | null> {
  const response = await fetch("/api/state", { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to read saved Goldbit state.");
  const payload = (await response.json()) as {
    state: Partial<GoldbitLocalState> | null;
  };

  return payload.state ? normalizeState(payload.state) : null;
}

async function writeState(state: GoldbitLocalState) {
  const response = await fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });

  if (!response.ok) {
    throw new Error("Failed to save Goldbit state.");
  }
}

function getRealizedPnl(trades: Trade[]) {
  return trades.reduce((sum, trade) => {
    if (trade.type !== "SELL") return sum;
    return sum + (trade.price - trade.averagePriceBefore) * trade.quantity - trade.fee;
  }, 0);
}

function getCycleDateRange(state: GoldbitLocalState) {
  const tradeDates = state.trades.map((trade) => trade.tradedAt).sort();
  const fallbackDates = [
    ...tradeDates,
    ...state.tEvents.map((event) => event.date),
    ...state.closeRecords.map((record) => record.date),
    state.strategy.createdAt.slice(0, 10),
  ].sort();

  return {
    tradeStartDate: tradeDates[0] ?? fallbackDates[0],
    tradeEndDate:
      tradeDates[tradeDates.length - 1] ??
      fallbackDates[fallbackDates.length - 1],
  };
}

function buildDailySnapshots(state: GoldbitLocalState): CycleDailySnapshot[] {
  const dates = new Set<string>();
  state.trades.forEach((trade) => dates.add(trade.tradedAt));
  state.tEvents.forEach((event) => dates.add(event.date));
  state.closeRecords.forEach((record) => dates.add(record.date));

  const sortedTrades = [...state.trades].sort((left, right) => {
    const dateOrder = left.tradedAt.localeCompare(right.tradedAt);
    return dateOrder === 0 ? left.id.localeCompare(right.id) : dateOrder;
  });
  const sortedTEvents = [...state.tEvents].sort((left, right) =>
    left.date.localeCompare(right.date),
  );

  let latestCashBalance =
    sortedTrades[0]?.cashBefore ?? state.strategy.cashBalance;
  let latestQuantity = sortedTrades[0]?.quantityBefore ?? state.strategy.quantity;
  let latestAveragePrice =
    sortedTrades[0]?.averagePriceBefore ?? state.strategy.averagePrice;
  let latestTValue = sortedTEvents[0]?.tBefore ?? state.strategy.tValue;

  return [...dates].sort().map((date) => {
    const trades = state.trades
      .filter((trade) => trade.tradedAt === date)
      .sort((left, right) => left.id.localeCompare(right.id));
    const tEvents = state.tEvents.filter((event) => event.date === date);
    const close = state.closeRecords.find((record) => record.date === date)?.close;

    if (trades.length > 0) {
      const finalTrade = trades[trades.length - 1];
      latestCashBalance = finalTrade.cashAfter;
      latestQuantity = finalTrade.quantityAfter;
      latestAveragePrice = finalTrade.averagePriceAfter;
    }

    if (tEvents.length > 0) {
      latestTValue = tEvents[tEvents.length - 1].tAfter;
    }

    const markPrice = close && close > 0 ? close : latestAveragePrice;

    return {
      date,
      tradeCount: trades.length,
      buyAmount: trades
        .filter((trade) => trade.type === "BUY")
        .reduce((sum, trade) => sum + trade.amount, 0),
      sellAmount: trades
        .filter((trade) => trade.type === "SELL")
        .reduce((sum, trade) => sum + trade.amount, 0),
      fee: trades.reduce((sum, trade) => sum + trade.fee, 0),
      tValue: latestTValue,
      cashBalance: latestCashBalance,
      quantity: latestQuantity,
      averagePrice: latestAveragePrice,
      totalAssets: latestCashBalance + latestQuantity * markPrice,
    };
  });
}

function createCycleArchive(state: GoldbitLocalState): CycleArchive | null {
  const hasCycleData =
    state.trades.length > 0 ||
    state.tEvents.length > 0 ||
    state.closeRecords.length > 0 ||
    state.strategy.quantity > 0 ||
    state.strategy.tValue > 0;

  if (!hasCycleData) return null;

  const { tradeStartDate, tradeEndDate } = getCycleDateRange(state);
  const markPrice =
    state.previousClose > 0 ? state.previousClose : state.strategy.averagePrice;
  const finalTotalAssets =
    state.strategy.cashBalance + state.strategy.quantity * markPrice;
  const archivedAt = new Date().toISOString();

  return {
    id: `cycle-${Date.now()}`,
    name: `${tradeStartDate} to ${tradeEndDate}`,
    startedAt: state.strategy.createdAt,
    endedAt: archivedAt,
    tradeStartDate,
    tradeEndDate,
    initialCapital: state.strategy.initialCapital,
    finalCashBalance: state.strategy.cashBalance,
    finalAveragePrice: state.strategy.averagePrice,
    finalQuantity: state.strategy.quantity,
    finalTValue: state.strategy.tValue,
    finalTotalAssets,
    realizedPnl: getRealizedPnl(state.trades),
    assetChange: finalTotalAssets - state.strategy.initialCapital,
    tradeCount: state.trades.length,
    buyCount: state.trades.filter((trade) => trade.type === "BUY").length,
    sellCount: state.trades.filter((trade) => trade.type === "SELL").length,
    trades: [...state.trades],
    tEvents: [...state.tEvents],
    closeRecords: [...state.closeRecords],
    dailySnapshots: buildDailySnapshots(state),
    archivedAt,
  };
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
    const loadState = async () => {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      window.localStorage.removeItem(PREVIOUS_STORAGE_KEY);

      try {
        const serverState = await readServerState();
        if (serverState) {
          setState(serverState);
          setIsLoaded(true);
          return;
        }

        const hasLocalState = Boolean(window.localStorage.getItem(STORAGE_KEY));
        const localState = readLocalState();
        setState(localState);
        setIsLoaded(true);

        if (hasLocalState) {
          await writeState(localState);
        }
      } catch (error) {
        console.error(error);
        setState(readLocalState());
        setIsLoaded(true);
      }
    };

    void loadState();
  }, []);

  const persist = (nextState: GoldbitLocalState) => {
    setState(nextState);
    void writeState(nextState).catch((error) => {
      console.error(error);
    });
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
    const archivedCycle = createCycleArchive(state);
    persist({
      ...initialState,
      cycleArchives: archivedCycle
        ? [archivedCycle, ...state.cycleArchives]
        : state.cycleArchives,
    });
  };

  const deleteCycleArchive = (cycleId: string) => {
    persist({
      ...state,
      cycleArchives: state.cycleArchives.filter((cycle) => cycle.id !== cycleId),
    });
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
    deleteCycleArchive,
  };
}
