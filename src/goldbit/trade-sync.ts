import { config } from "../config.js";
import { findSuccessfulExecutionsByBrokerOrderIds } from "../storage/executions.js";
import { writeLog } from "../storage/logs.js";
import { getRecentExecutions } from "../toss/account.js";
import type { Execution, OrderRequest, OrderType } from "../types/index.js";
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
import { readGoldbitState, writeGoldbitState } from "./state.js";

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
  }>;
  tEventApplied: boolean;
  tEventType?: string;
  tBefore?: number;
  tAfter?: number;
  tEventReason?: string;
}

const brokerMemo = (orderId: string): string => `Toss orderId: ${orderId}`;

const hasSyncedExecution = (state: GoldbitLocalState, execution: Execution): boolean => {
  return state.trades.some((trade) => trade.memo?.includes(brokerMemo(execution.id)));
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
  localRequest?: OrderRequest
): TradeInput | null => {
  const orderType = toGoldbitOrderType(resolveOrderType(execution, localRequest) ?? undefined);
  const price = execution.price ?? 0;
  const quantity = Math.floor(execution.quantity);

  if (!orderType || price <= 0 || quantity < 1 || !execution.tradingDate) {
    return null;
  }

  const amount = price * quantity;
  const fee = round(amount * ((state.feeRatePercent ?? 0) / 100));

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

  let replayStrategy = { ...state.strategy, tValue: baseT };
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
  const state = readGoldbitState();
  const executions = await getRecentExecutions(config.targetSymbol);
  const tradingDate = executions[0]?.tradingDate;
  const requestMap = await getLocalOrderRequestMap(executions);
  let skippedForInsufficientQuantity = 0;
  const candidateTradeInputs = executions
    .filter((execution) => !hasSyncedExecution(state, execution))
    .sort((left, right) => left.executedAt.localeCompare(right.executedAt))
    .map((execution) => ({
      execution,
      input: createTradeInput(execution, state, requestMap.get(execution.id))
    }))
    .filter((item): item is { execution: Execution; input: TradeInput } => Boolean(item.input));
  const tradeInputs: Array<{ execution: Execution; input: TradeInput }> = [];
  let replayQuantity = state.strategy.quantity;

  for (const item of candidateTradeInputs) {
    if (item.input.type === "SELL" && item.input.quantity > replayQuantity) {
      skippedForInsufficientQuantity += 1;
      continue;
    }

    replayQuantity += item.input.type === "BUY" ? item.input.quantity : -item.input.quantity;
    tradeInputs.push(item);
  }

  let nextState = applyTradeInputs(state, tradeInputs);
  const planSnapshot = tradingDate
    ? nextState.dailyPlanSnapshots.find((snapshot) => snapshot.date === tradingDate)
    : undefined;
  const suggestion = tradingDate
    ? suggestDailyTEvent(nextState.strategy, planSnapshot, nextState.trades, tradingDate)
    : undefined;
  const existingTEvent = tradingDate ? nextState.tEvents.find((event) => event.date === tradingDate) : undefined;
  const hasExistingTEvent = Boolean(existingTEvent);
  let tEventApplied = false;
  let appliedTEvent: DailyTEvent | undefined;

  if (suggestion?.input && !hasExistingTEvent) {
    nextState = applyDailyTEventInputToState(nextState, suggestion.input);
    appliedTEvent = tradingDate ? nextState.tEvents.find((event) => event.date === tradingDate) : undefined;
    tEventApplied = true;
  }

  if (tradeInputs.length > 0 || tEventApplied) {
    writeGoldbitState(nextState);
  }

  const skippedExecutions = executions.length - tradeInputs.length;
  const result: TradeSyncResult = {
    tradingDate,
    fetchedExecutions: executions.length,
    createdTrades: tradeInputs.length,
    skippedExecutions,
    trades: nextState.trades.filter((trade) => trade.tradedAt === tradingDate).map((trade) => ({
      side: trade.type ?? "N/A",
      orderType: trade.orderType ?? "N/A",
      quantity: trade.quantity ?? 0,
      price: trade.price ?? 0,
      amount: trade.amount ?? round((trade.price ?? 0) * (trade.quantity ?? 0))
    })),
    tEventApplied,
    tEventType: (appliedTEvent ?? existingTEvent)?.normalTEvent ?? (appliedTEvent ?? existingTEvent)?.reverseTEvent,
    tBefore: (appliedTEvent ?? existingTEvent)?.tBefore,
    tAfter: (appliedTEvent ?? existingTEvent)?.tAfter,
    tEventReason: skippedForInsufficientQuantity > 0
      ? `${suggestion?.reason ?? "No T event suggestion."} Skipped ${skippedForInsufficientQuantity} sell execution(s) because Goldbit state quantity was insufficient.`
      : suggestion?.reason
  };

  await writeLog("INFO", "Goldbit filled order sync completed", { ...result });
  return result;
};
