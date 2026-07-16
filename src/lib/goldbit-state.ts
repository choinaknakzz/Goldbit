import { emptyCloseRecords, emptyLastFiveCloses, emptyStrategy } from "@/lib/mock-data";
import { applyDailyTEventToStrategy } from "@/lib/calculations";
import type {
  CloseRecord,
  CycleArchive,
  DailyTEvent,
  DailyTEventInput,
  DailyPlanSnapshot,
  PendingTrade,
  StrategyConfig,
  Trade,
  TradeInput,
} from "@/lib/types";

export interface GoldbitLocalState {
  strategy: StrategyConfig;
  trades: Trade[];
  tEvents: DailyTEvent[];
  dailyPlanSnapshots: DailyPlanSnapshot[];
  lastFiveCloses: number[];
  closeRecords: CloseRecord[];
  previousClose: number;
  feeRatePercent: number;
  pendingTrades: PendingTrade[];
  cycleArchives: CycleArchive[];
}

export const initialGoldbitState: GoldbitLocalState = {
  strategy: emptyStrategy,
  trades: [],
  tEvents: [],
  dailyPlanSnapshots: [],
  lastFiveCloses: emptyLastFiveCloses,
  closeRecords: emptyCloseRecords,
  previousClose: 0,
  feeRatePercent: 0,
  pendingTrades: [],
  cycleArchives: [],
};

export function getLatestFiveCloses(records: CloseRecord[]) {
  return [...records]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-5)
    .map((record) => record.close);
}

function normalizeCloseRecords(parsed: Partial<GoldbitLocalState>): CloseRecord[] {
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

  return initialGoldbitState.closeRecords;
}

export function normalizeGoldbitState(
  parsed: Partial<GoldbitLocalState>,
): GoldbitLocalState {
  try {
    const closeRecords = normalizeCloseRecords(parsed);
    const latestFiveCloses = getLatestFiveCloses(closeRecords);
    return {
      strategy: { ...initialGoldbitState.strategy, ...parsed.strategy },
      trades: Array.isArray(parsed.trades)
        ? parsed.trades
        : initialGoldbitState.trades,
      tEvents: Array.isArray(parsed.tEvents)
        ? parsed.tEvents
        : initialGoldbitState.tEvents,
      dailyPlanSnapshots: Array.isArray(parsed.dailyPlanSnapshots)
        ? parsed.dailyPlanSnapshots
        : initialGoldbitState.dailyPlanSnapshots,
      lastFiveCloses:
        latestFiveCloses.length > 0
          ? latestFiveCloses
          : initialGoldbitState.lastFiveCloses,
      closeRecords,
      previousClose:
        typeof parsed.previousClose === "number"
          ? parsed.previousClose
          : initialGoldbitState.previousClose,
      feeRatePercent:
        typeof parsed.feeRatePercent === "number"
          ? parsed.feeRatePercent
          : initialGoldbitState.feeRatePercent,
      pendingTrades: Array.isArray(parsed.pendingTrades)
        ? parsed.pendingTrades
        : initialGoldbitState.pendingTrades,
      cycleArchives: Array.isArray(parsed.cycleArchives)
        ? parsed.cycleArchives
        : initialGoldbitState.cycleArchives,
    };
  } catch {
    return initialGoldbitState;
  }
}

export function createTradeRecord(
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

export function applyDailyTEventInputToState(
  state: GoldbitLocalState,
  input: DailyTEventInput,
): GoldbitLocalState {
  const existingEvents = state.tEvents.filter((event) => event.date !== input.date);
  const baseT =
    state.tEvents.length > 0
      ? [...state.tEvents].sort((left, right) =>
          left.date.localeCompare(right.date),
        )[0].tBefore
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

  return {
    ...state,
    strategy: replayStrategy,
    tEvents: [...replayedEvents].sort((left, right) =>
      right.date.localeCompare(left.date),
    ),
  };
}
