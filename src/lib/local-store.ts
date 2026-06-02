"use client";

import { useEffect, useMemo, useState } from "react";
import {
  generateNormalDailyPlan,
  generateReverseDailyPlan,
} from "@/lib/calculations";
import {
  applyDailyTEventInputToState,
  getLatestFiveCloses,
  initialGoldbitState,
  normalizeGoldbitState,
  type GoldbitLocalState,
} from "@/lib/goldbit-state";
import type {
  CloseRecord,
  CycleArchive,
  CycleDailySnapshot,
  DailyPlan,
  DailyPlanSnapshot,
  DailyTEventInput,
  StrategyConfig,
  Trade,
  TradeInput,
} from "@/lib/types";

const STORAGE_KEY = "goldbit.local.v3";
const PREVIOUS_STORAGE_KEY = "goldbit.local.v2";
const LEGACY_STORAGE_KEY = "goldbit.local.v1";

function readLocalState(): GoldbitLocalState {
  if (typeof window === "undefined") return initialGoldbitState;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return initialGoldbitState;

  try {
    return normalizeGoldbitState(JSON.parse(raw) as Partial<GoldbitLocalState>);
  } catch {
    return initialGoldbitState;
  }
}

async function readServerState(): Promise<GoldbitLocalState | null> {
  const response = await fetch("/api/state", { cache: "no-store" });
  if (!response.ok) throw new Error("Failed to read saved Goldbit state.");
  const payload = (await response.json()) as {
    state: Partial<GoldbitLocalState> | null;
  };

  return payload.state ? normalizeGoldbitState(payload.state) : null;
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

async function postTrade(input: TradeInput): Promise<GoldbitLocalState> {
  const response = await fetch("/api/trades", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trade: input }),
  });

  const payload = (await response.json()) as {
    state?: Partial<GoldbitLocalState>;
    error?: string;
  };

  if (!response.ok || !payload.state) {
    throw new Error(payload.error ?? "Failed to add trade.");
  }

  return normalizeGoldbitState(payload.state);
}

async function postPendingTrade(rawText: string): Promise<GoldbitLocalState> {
  const response = await fetch("/api/pending-trades", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawText, source: "SCREENSHOT" }),
  });

  const payload = (await response.json()) as {
    state?: Partial<GoldbitLocalState>;
    error?: string;
  };

  if (!response.ok || !payload.state) {
    throw new Error(payload.error ?? "Failed to parse OCR trade.");
  }

  return normalizeGoldbitState(payload.state);
}

async function resolvePendingTrade(
  pendingTradeId: string,
  action: "confirm" | "reject",
  trade?: TradeInput,
): Promise<GoldbitLocalState> {
  const response = await fetch(`/api/pending-trades/${pendingTradeId}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: trade ? JSON.stringify({ trade }) : undefined,
  });

  const payload = (await response.json()) as {
    state?: Partial<GoldbitLocalState>;
    error?: string;
  };

  if (!response.ok || !payload.state) {
    throw new Error(payload.error ?? `Failed to ${action} pending trade.`);
  }

  return normalizeGoldbitState(payload.state);
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

export function useGoldbitStore() {
  const [state, setState] = useState<GoldbitLocalState>(initialGoldbitState);
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

  const persistPlanSnapshot = (planSnapshot: DailyPlan) => {
    const hasTradeForDate = state.trades.some(
      (trade) => trade.tradedAt === planSnapshot.date,
    );
    const hasTEventForDate = state.tEvents.some(
      (event) => event.date === planSnapshot.date,
    );
    const existingSnapshot = state.dailyPlanSnapshots.find(
      (snapshot) => snapshot.date === planSnapshot.date,
    );

    if (hasTradeForDate || hasTEventForDate || existingSnapshot) return;

    const now = new Date().toISOString();
    const nextSnapshot: DailyPlanSnapshot = {
      date: planSnapshot.date,
      plan: planSnapshot,
      createdAt: now,
      updatedAt: now,
    };
    const nextState = {
      ...state,
      dailyPlanSnapshots: [nextSnapshot, ...state.dailyPlanSnapshots],
    };

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
    void postTrade(input)
      .then((nextState) => setState(nextState))
      .catch((error) => {
        console.error(error);
      });
  };

  const addPendingTrade = (rawText: string) => {
    void postPendingTrade(rawText)
      .then((nextState) => setState(nextState))
      .catch((error) => {
        console.error(error);
      });
  };

  const confirmPendingTrade = (pendingTradeId: string, trade?: TradeInput) => {
    void resolvePendingTrade(pendingTradeId, "confirm", trade)
      .then((nextState) => setState(nextState))
      .catch((error) => {
        console.error(error);
      });
  };

  const rejectPendingTrade = (pendingTradeId: string) => {
    void resolvePendingTrade(pendingTradeId, "reject")
      .then((nextState) => setState(nextState))
      .catch((error) => {
        console.error(error);
      });
  };

  const addDailyTEvent = (input: DailyTEventInput) => {
    persist(applyDailyTEventInputToState(state, input));
  };

  const resetState = () => {
    const archivedCycle = createCycleArchive(state);
    persist({
      ...initialGoldbitState,
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

  useEffect(() => {
    if (!isLoaded) return;
    persistPlanSnapshot(plan);
    // Snapshot only before the date has trades or T events; avoid replacing it later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, plan.date]);

  return {
    ...state,
    plan,
    isLoaded,
    updateStrategy,
    updateLatestClose,
    addTrade,
    addPendingTrade,
    confirmPendingTrade,
    rejectPendingTrade,
    addDailyTEvent,
    resetState,
    deleteCycleArchive,
  };
}
