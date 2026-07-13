import { config } from "../config.js";
import { findSuccessfulExecutionsByBrokerOrderIds } from "../storage/executions.js";
import { writeLog } from "../storage/logs.js";
import { getRecentExecutions, getUsCommissionRatePercent } from "../toss/account.js";
import { getPosition } from "../toss/portfolio.js";
import type { Execution, OrderRequest, OrderType } from "../types/index.js";
import { closeCycleAndResetState } from "./cycle.js";
import {
  applyDailyTEventToStrategy,
  applyTradeToStrategy,
  suggestDailyTEvent,
  toGoldbitOrderType
} from "./mechanism.js";
import type {
  DailyTEvent,
  DailyTEventInput,
  GoldbitLocalState,
  StrategyConfig,
  Trade,
  TradeInput
} from "./mechanism-types.js";
import {
  GoldbitStateConflictError,
  readGoldbitStateSnapshot,
  writeGoldbitState
} from "./state.js";

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

export interface TradeSyncResult {
  tradingDate?: string;
  fetchedExecutions: number;
  createdTrades: number;
  skippedExecutions: number;
  trades: Array<{
    side: string;
    orderType: string;
    quantity: number;
    price: number;
    amount: number;
    fee: number;
  }>;
  tEventApplied: boolean;
  tEventType?: string;
  tBefore?: number;
  tAfter?: number;
  tEventReason?: string;
  cycleClosed: boolean;
  archivedCycleId?: string;
  requiresNextCycleCapital?: boolean;
  previousCashBalance?: number;
  tradingDates: string[];
  adjustedTradeFees: number;
  dailyResults: TradeSyncDayResult[];
  positionReconciliation?: {
    matched: boolean;
    goldbitQuantity: number;
    tossQuantity: number;
    goldbitAveragePrice: number;
    tossAveragePrice: number;
  };
}

export interface TradeSyncDayResult {
  tradingDate: string;
  createdTrades: number;
  tEventApplied: boolean;
  tEventType?: string;
  tBefore?: number;
  tAfter?: number;
  tEventReason?: string;
  cycleClosed: boolean;
}

const brokerMemo = (orderId: string): string => `Toss orderId: ${orderId}`;

const getSyncedExecutionTrades = (state: GoldbitLocalState, execution: Execution): Trade[] => {
  const archivedTrades = state.cycleArchives.flatMap((archive) => archive.trades);
  return [...state.trades, ...archivedTrades].filter((trade) => trade.memo?.includes(brokerMemo(execution.id)));
};

const updateExistingTradeFees = (
  state: GoldbitLocalState,
  executions: Execution[]
): { state: GoldbitLocalState; adjustedTradeFees: number } => {
  const feeByTradeId = new Map<string, number>();
  for (const execution of executions) {
    const matchedTrades = state.trades.filter((trade) => trade.memo?.includes(brokerMemo(execution.id)));
    const syncedQuantity = matchedTrades.reduce((sum, trade) => sum + (trade.quantity ?? 0), 0);
    if (
      matchedTrades.length === 1 &&
      Math.abs(syncedQuantity - execution.quantity) < 0.000001 &&
      execution.fee !== undefined &&
      matchedTrades[0]?.fee !== execution.fee
    ) {
      feeByTradeId.set(matchedTrades[0].id, execution.fee);
    }
  }
  if (feeByTradeId.size === 0) return { state, adjustedTradeFees: 0 };

  let cumulativeCashAdjustment = 0;
  const adjustedById = new Map<string, Trade>();
  const chronological = [...state.trades].sort((left, right) => {
    const dateCompare = left.tradedAt.localeCompare(right.tradedAt);
    return dateCompare !== 0 ? dateCompare : left.id.localeCompare(right.id);
  });

  for (const trade of chronological) {
    const nextFee = feeByTradeId.get(trade.id);
    const cashBefore =
      typeof trade.cashBefore === "number" ? round(trade.cashBefore + cumulativeCashAdjustment) : trade.cashBefore;
    if (nextFee !== undefined) cumulativeCashAdjustment += (trade.fee ?? 0) - nextFee;
    const cashAfter =
      typeof trade.cashAfter === "number" ? round(trade.cashAfter + cumulativeCashAdjustment) : trade.cashAfter;
    adjustedById.set(trade.id, {
      ...trade,
      fee: nextFee ?? trade.fee,
      cashBefore,
      cashAfter,
      memo: nextFee === undefined ? trade.memo : `${trade.memo ?? ""}; fee synced from Toss commission`.trim()
    });
  }

  return {
    state: {
      ...state,
      strategy: {
        ...state.strategy,
        cashBalance: round(state.strategy.cashBalance + cumulativeCashAdjustment)
      },
      trades: state.trades.map((trade) => adjustedById.get(trade.id) ?? trade)
    },
    adjustedTradeFees: feeByTradeId.size
  };
};

const parseOrderRequest = (payload?: string | null): OrderRequest | null => {
  if (!payload) return null;
  try {
    return JSON.parse(payload) as OrderRequest;
  } catch {
    return null;
  }
};

const getLocalOrderRequestMap = async (executions: Execution[]): Promise<Map<string, OrderRequest>> => {
  const records = await findSuccessfulExecutionsByBrokerOrderIds(executions.map((execution) => execution.id));
  const map = new Map<string, OrderRequest>();

  for (const record of records) {
    if (!record.brokerOrderId) continue;
    const request = parseOrderRequest(record.requestPayload);
    if (request) {
      map.set(record.brokerOrderId, request);
    }
  }

  return map;
};

const resolveOrderType = (execution: Execution, request?: OrderRequest): Exclude<OrderType, "MARKET"> | null => {
  const orderType = request?.orderType ?? execution.orderType;
  if (orderType === "LOC" || orderType === "MOC" || orderType === "LIMIT") {
    return orderType;
  }

  return null;
};

const createTradeInput = (
  execution: Execution,
  state: GoldbitLocalState,
  localRequest?: OrderRequest,
  commissionRatePercent = state.feeRatePercent ?? 0
): TradeInput | null => {
  const orderType = toGoldbitOrderType(resolveOrderType(execution, localRequest) ?? undefined);
  const price = execution.price ?? 0;
  const quantity = Math.floor(execution.quantity);

  if (!orderType || price <= 0 || quantity < 1 || !execution.tradingDate) {
    return null;
  }

  const amount = price * quantity;
  const fee = execution.fee ?? round(amount * (commissionRatePercent / 100));

  return {
    type: execution.side,
    orderType,
    price,
    quantity,
    fee,
    reason: "Synced from Toss filled order.",
    tradedAt: execution.tradingDate,
    memo: `${brokerMemo(execution.id)}; filledAt: ${execution.executedAt}`
  };
};

export const createIncrementalTradeInput = (
  execution: Execution,
  state: GoldbitLocalState,
  localRequest?: OrderRequest,
  commissionRatePercent = state.feeRatePercent ?? 0
): { execution: Execution; input: TradeInput } | null => {
  const syncedTrades = getSyncedExecutionTrades(state, execution);
  const syncedQuantity = syncedTrades.reduce((sum, trade) => sum + (trade.quantity ?? 0), 0);
  const remainingQuantity = Math.floor(execution.quantity - syncedQuantity);
  if (remainingQuantity < 1) return null;

  const fullInput = createTradeInput(execution, state, localRequest, commissionRatePercent);
  if (!fullInput) return null;
  if (syncedQuantity === 0) return { execution, input: fullInput };

  const syncedAmount = syncedTrades.reduce(
    (sum, trade) => sum + (trade.price ?? 0) * (trade.quantity ?? 0),
    0
  );
  const remainingAmount = execution.price !== undefined ? execution.price * execution.quantity - syncedAmount : 0;
  const remainingPrice = remainingAmount > 0 ? remainingAmount / remainingQuantity : fullInput.price;
  const syncedFee = syncedTrades.reduce((sum, trade) => sum + (trade.fee ?? 0), 0);
  const remainingFee =
    execution.fee !== undefined
      ? Math.max(0, execution.fee - syncedFee)
      : round(remainingPrice * remainingQuantity * (commissionRatePercent / 100));

  return {
    execution: {
      ...execution,
      id: `${execution.id}-fill-${execution.quantity}`,
      quantity: remainingQuantity,
      price: remainingPrice,
      fee: remainingFee
    },
    input: {
      ...fullInput,
      price: remainingPrice,
      quantity: remainingQuantity,
      fee: remainingFee,
      memo: `${brokerMemo(execution.id)}; incremental fill; filledAt: ${execution.executedAt}`
    }
  };
};

const createTradeRecord = (
  strategyBefore: StrategyConfig,
  strategyAfter: StrategyConfig,
  input: TradeInput,
  execution: Execution
): Trade => {
  const amount = round(input.price * input.quantity);

  return {
    id: `toss-${execution.id}`,
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
    memo: input.memo
  };
};

const applyTradeInputs = (
  state: GoldbitLocalState,
  items: Array<{ execution: Execution; input: TradeInput }>
): GoldbitLocalState => {
  let strategy = state.strategy;
  const newTrades: Trade[] = [];

  for (const item of items) {
    if (item.input.type === "SELL" && item.input.quantity > strategy.quantity) {
      continue;
    }

    const strategyBefore = strategy;
    const strategyAfter = applyTradeToStrategy(strategyBefore, item.input);
    newTrades.push(createTradeRecord(strategyBefore, strategyAfter, item.input, item.execution));
    strategy = strategyAfter;
  }

  return {
    ...state,
    strategy,
    trades: [...newTrades.reverse(), ...state.trades]
  };
};

const applyDailyTEventInputToState = (state: GoldbitLocalState, input: DailyTEventInput): GoldbitLocalState => {
  const existingEvents = state.tEvents.filter((event) => event.date !== input.date);
  const baseT =
    state.tEvents.length > 0
      ? [...state.tEvents].sort((left, right) => left.date.localeCompare(right.date))[0].tBefore
      : state.strategy.tValue;
  const eventInputs = [
    ...existingEvents,
    {
      ...input,
      id: `t-event-${Date.now()}`,
      tBefore: baseT,
      tAfter: baseT
    }
  ].sort((left, right) => left.date.localeCompare(right.date));

  const initialMode = eventInputs[0]?.mode ?? state.strategy.mode;
  let replayStrategy: StrategyConfig = {
    ...state.strategy,
    tValue: baseT,
    mode: initialMode,
    reverseStartedAt: initialMode === "REVERSE" ? state.strategy.reverseStartedAt : undefined
  };
  const replayedEvents: DailyTEvent[] = eventInputs.map((event) => {
    const strategyAfter = applyDailyTEventToStrategy(replayStrategy, event);
    const replayedEvent = {
      ...event,
      tBefore: replayStrategy.tValue,
      tAfter: strategyAfter.tValue
    };
    replayStrategy = strategyAfter;
    return replayedEvent;
  });

  return {
    ...state,
    strategy: replayStrategy,
    tEvents: [...replayedEvents].sort((left, right) => right.date.localeCompare(left.date))
  };
};

export const syncFilledOrdersToGoldbitState = async (): Promise<TradeSyncResult> => {
  const executions = await getRecentExecutions(config.targetSymbol);
  const requestMap = await getLocalOrderRequestMap(executions);
  const commissionRatePercent = await getUsCommissionRatePercent().catch(async (error) => {
    await writeLog("WARN", "Toss commission rate lookup failed; using saved Goldbit fee rate", {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  });
  const tossPosition = await getPosition(config.targetSymbol).catch(async (error) => {
    await writeLog("WARN", "Toss position reconciliation lookup failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  });
  const tradingDates = [
    ...new Set(
      executions
        .map((execution) => execution.tradingDate)
        .filter((date): date is string => Boolean(date))
    )
  ].sort();

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const snapshot = readGoldbitStateSnapshot();
    const state = snapshot.state;
    const feeRatePercent = commissionRatePercent ?? state.feeRatePercent ?? 0;
    const feeUpdate = updateExistingTradeFees(state, executions);
    let nextState =
      commissionRatePercent === null
        ? feeUpdate.state
        : { ...feeUpdate.state, feeRatePercent };
    let skippedForInsufficientQuantity = 0;
    const candidateTradeInputs = executions
      .sort((left, right) => left.executedAt.localeCompare(right.executedAt))
      .map((execution) =>
        createIncrementalTradeInput(execution, nextState, requestMap.get(execution.id), feeRatePercent)
      )
      .filter((item): item is { execution: Execution; input: TradeInput } => Boolean(item));
    const tradeInputs: Array<{ execution: Execution; input: TradeInput }> = [];
    let replayQuantity = nextState.strategy.quantity;

    for (const item of candidateTradeInputs) {
      if (item.input.type === "SELL" && item.input.quantity > replayQuantity) {
        skippedForInsufficientQuantity += 1;
        continue;
      }
      replayQuantity += item.input.type === "BUY" ? item.input.quantity : -item.input.quantity;
      tradeInputs.push(item);
    }

    const dailyResults: TradeSyncDayResult[] = [];
    const syncedTradeSummaries: TradeSyncResult["trades"] = [];
    let processedTradeCount = 0;
    let archivedCycleId: string | undefined;
    let requiresNextCycleCapital = false;
    let previousCashBalance: number | undefined;

    for (const tradingDate of tradingDates) {
      const dayInputs = tradeInputs.filter((item) => item.input.tradedAt === tradingDate);
      if (dayInputs.length === 0) continue;

      nextState = applyTradeInputs(nextState, dayInputs);
      processedTradeCount += dayInputs.length;
      syncedTradeSummaries.push(
        ...dayInputs.map(({ input }) => ({
          side: input.type,
          orderType: input.orderType,
          quantity: input.quantity,
          price: input.price,
          amount: round(input.price * input.quantity),
          fee: input.fee
        }))
      );
      const planSnapshot = nextState.dailyPlanSnapshots.find((item) => item.date === tradingDate);
      const suggestion = suggestDailyTEvent(nextState.strategy, planSnapshot, nextState.trades, tradingDate);
      let appliedTEvent: DailyTEvent | undefined;
      let cycleClosed = false;

      if (suggestion.input) {
        nextState = applyDailyTEventInputToState(nextState, suggestion.input);
        appliedTEvent = nextState.tEvents.find((event) => event.date === tradingDate);

        if (suggestion.input.normalTEvent === "FULL_SELL_CYCLE_CLOSE") {
          const closedState = closeCycleAndResetState(nextState);
          archivedCycleId = closedState.cycleArchives[0]?.id;
          cycleClosed = Boolean(archivedCycleId);
          requiresNextCycleCapital = Boolean(closedState.pendingCycleCapitalInput);
          previousCashBalance = closedState.pendingCycleCapitalInput?.previousCashBalance;
          nextState = closedState;
        }
      }

      dailyResults.push({
        tradingDate,
        createdTrades: dayInputs.length,
        tEventApplied: Boolean(appliedTEvent),
        tEventType: appliedTEvent?.normalTEvent ?? appliedTEvent?.reverseTEvent,
        tBefore: appliedTEvent?.tBefore,
        tAfter: appliedTEvent?.tAfter,
        tEventReason:
          skippedForInsufficientQuantity > 0
            ? `${suggestion.reason} Skipped ${skippedForInsufficientQuantity} sell execution(s) because Goldbit state quantity was insufficient.`
            : suggestion.reason,
        cycleClosed
      });

      if (cycleClosed) break;
    }

    const latestTradingDate = tradingDates.at(-1);
    const latestDayResult = [...dailyResults].sort((left, right) => left.tradingDate.localeCompare(right.tradingDate)).at(-1);
    const latestExistingEvent = latestTradingDate
      ? nextState.tEvents.find((event) => event.date === latestTradingDate)
      : undefined;
    const positionReconciliation = tossPosition
      ? {
          matched:
            Math.abs(nextState.strategy.quantity - tossPosition.quantity) < 0.000001 &&
            Math.abs(nextState.strategy.averagePrice - tossPosition.averagePrice) < 0.01,
          goldbitQuantity: nextState.strategy.quantity,
          tossQuantity: tossPosition.quantity,
          goldbitAveragePrice: nextState.strategy.averagePrice,
          tossAveragePrice: tossPosition.averagePrice
        }
      : undefined;
    const shouldWrite =
      tradeInputs.length > 0 ||
      feeUpdate.adjustedTradeFees > 0 ||
      (commissionRatePercent !== null && state.feeRatePercent !== feeRatePercent);

    try {
      if (shouldWrite) writeGoldbitState(nextState, snapshot.rawData);
    } catch (error) {
      if (error instanceof GoldbitStateConflictError && attempt < 3) continue;
      throw error;
    }

    const result: TradeSyncResult = {
      tradingDate: latestTradingDate,
      tradingDates,
      fetchedExecutions: executions.length,
      createdTrades: processedTradeCount,
      skippedExecutions: executions.length - processedTradeCount,
      trades: syncedTradeSummaries,
      tEventApplied: dailyResults.some((item) => item.tEventApplied),
      tEventType:
        latestDayResult?.tEventType ?? latestExistingEvent?.normalTEvent ?? latestExistingEvent?.reverseTEvent,
      tBefore: latestDayResult?.tBefore ?? latestExistingEvent?.tBefore,
      tAfter: latestDayResult?.tAfter ?? latestExistingEvent?.tAfter,
      tEventReason: latestDayResult?.tEventReason,
      cycleClosed: dailyResults.some((item) => item.cycleClosed),
      archivedCycleId,
      requiresNextCycleCapital,
      previousCashBalance,
      adjustedTradeFees: feeUpdate.adjustedTradeFees,
      dailyResults,
      positionReconciliation
    };

    if (positionReconciliation && !positionReconciliation.matched) {
      await writeLog("WARN", "Goldbit and Toss SOXL position mismatch detected", positionReconciliation);
    }
    await writeLog("INFO", "Goldbit filled order sync completed", { ...result });
    return result;
  }

  throw new GoldbitStateConflictError();
};
