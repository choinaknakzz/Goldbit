import type { OrderCandidate } from "@prisma/client";
import { config } from "../config.js";
import { saveCandidate } from "../storage/candidates.js";
import { writeLog } from "../storage/logs.js";
import { getCurrentPrice } from "../toss/price.js";
import type { CandidateDraft, OrderSide, OrderType } from "../types/index.js";
import { sendActionPlanMessage } from "../telegram/message.js";
import { generateNormalDailyPlan, generateReverseDailyPlan } from "./mechanism.js";
import type { DailyPlan, PlannedOrder, StrategyConfig } from "./mechanism-types.js";
import { readGoldbitState } from "./state.js";

type PlannedOrderType = Extract<OrderType, PlannedOrder["orderType"]>;

const isSupportedOrderType = (orderType: PlannedOrder["orderType"]): orderType is PlannedOrderType => {
  return ["LOC", "MOC", "LIMIT"].includes(orderType);
};

const orderAmount = (order: PlannedOrder): number | undefined => {
  if (order.amount !== null) return order.amount;
  if (order.price !== null && order.quantity !== null) return Number((order.price * order.quantity).toFixed(2));
  return undefined;
};

const planDateCompact = (plan: DailyPlan): string => plan.date.replace(/-/g, "");

const planGroupId = (plan: DailyPlan): string => `${planDateCompact(plan)}-${plan.symbol}-PLAN`;

const toCandidate = (plan: DailyPlan, order: PlannedOrder, sequence: number): CandidateDraft | null => {
  if (!isSupportedOrderType(order.orderType) || !order.quantity || order.quantity < 1) {
    return null;
  }

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + config.approvalExpireMinutes * 60_000);
  const side = order.side as OrderSide;
  const orderType = order.orderType as OrderType;

  return {
    id: `${planGroupId(plan)}-${String(sequence).padStart(2, "0")}-${side}-${orderType}-${order.priority}`,
    symbol: plan.symbol,
    side,
    orderType,
    quantity: order.quantity,
    estimatedPrice: order.price ?? undefined,
    estimatedAmount: orderAmount(order),
    status: "PENDING",
    createdAt,
    expiresAt,
    rawData: {
      source: "Goldbit Today Action Plan",
      planGroupId: planGroupId(plan),
      sequence,
      plan,
      order
    }
  };
};

const buildPlanFromGoldbitState = async (): Promise<DailyPlan> => {
  const state = readGoldbitState();
  const liveStrategy: StrategyConfig = {
    ...state.strategy,
    symbol: "SOXL",
    updatedAt: new Date().toISOString()
  };
  const currentPrice = state.previousClose > 0 ? undefined : await getCurrentPrice(config.targetSymbol);
  const previousClose = state.previousClose > 0 ? state.previousClose : currentPrice?.price;
  const isFirstReverseDay =
    liveStrategy.mode === "REVERSE" &&
    Boolean(liveStrategy.reverseStartedAt) &&
    !state.trades.some((trade) => trade.tradedAt === liveStrategy.reverseStartedAt);

  return liveStrategy.mode === "REVERSE"
    ? generateReverseDailyPlan(liveStrategy, state.lastFiveCloses, isFirstReverseDay)
    : generateNormalDailyPlan(liveStrategy, previousClose);
};

export const createAndSendGoldbitActionPlan = async (): Promise<{
  plan: DailyPlan;
  candidates: OrderCandidate[];
}> => {
  const plan = await buildPlanFromGoldbitState();
  const drafts = [...plan.buyOrders, ...plan.sellOrders]
    .map((order, index) => toCandidate(plan, order, index + 1))
    .filter((candidate): candidate is CandidateDraft => Boolean(candidate));
  const candidates: OrderCandidate[] = [];

  for (const draft of drafts) {
    candidates.push(await saveCandidate(draft));
  }

  await sendActionPlanMessage(plan, candidates);
  await writeLog("INFO", "Goldbit action plan sent", {
    date: plan.date,
    mode: plan.mode,
    phase: plan.phase,
    candidateCount: candidates.length
  });

  return { plan, candidates };
};
