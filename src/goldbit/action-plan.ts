import type { OrderCandidate } from "@prisma/client";
import { config } from "../config.js";
import { expirePendingCandidatesByIdPrefix, saveCandidate } from "../storage/candidates.js";
import { writeLog } from "../storage/logs.js";
import { getCurrentPrice } from "../toss/price.js";
import type { CandidateDraft, OrderSide, OrderType } from "../types/index.js";
import { sendActionPlanMessage, sendTextMessage } from "../telegram/message.js";
import { generateNormalDailyPlan, generateReverseDailyPlan } from "./mechanism.js";
import type { DailyPlan, PlannedOrder, StrategyConfig } from "./mechanism-types.js";
import { readGoldbitState, saveGoldbitPlanSnapshot } from "./state.js";

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

const planBaseId = (plan: DailyPlan): string => `${planDateCompact(plan)}-${plan.symbol}-PLAN`;

const createPlanSessionId = (): string => Date.now().toString(36);

const toCandidate = (
  plan: DailyPlan,
  order: PlannedOrder,
  sequence: number,
  groupId: string,
  baseId: string
): CandidateDraft | null => {
  if (!isSupportedOrderType(order.orderType) || !order.quantity || order.quantity < 1) {
    return null;
  }

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + config.approvalExpireMinutes * 60_000);
  const side = order.side as OrderSide;
  const orderType = order.orderType as OrderType;

  return {
    id: `${groupId}-${String(sequence).padStart(2, "0")}-${side}-${orderType}-${order.priority}`,
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
      planBaseId: baseId,
      planGroupId: groupId,
      planSessionId: groupId.slice(baseId.length + 1),
      sequence,
      plan,
      order
    }
  };
};

const buildPlanFromGoldbitState = async (): Promise<DailyPlan> => {
  const state = readGoldbitState();
  if (state.pendingCycleCapitalInput) {
    throw new Error("NEW_CYCLE_CAPITAL_REQUIRED");
  }

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

const sendCapitalRequiredMessage = async (chatId?: string): Promise<void> => {
  await sendTextMessage(
    [
      "[Goldbit 새 사이클 대기]",
      "",
      "이전 사이클이 종료되어 새 사이클 총자산 입력이 필요합니다.",
      "20분할은 고정으로 유지됩니다.",
      "",
      "예시:",
      "/capital 20000"
    ].join("\n"),
    chatId
  );
};

export const createAndSendGoldbitActionPlan = async (chatId?: string): Promise<{
  plan: DailyPlan;
  candidates: OrderCandidate[];
}> => {
  let plan: DailyPlan;
  try {
    plan = await buildPlanFromGoldbitState();
  } catch (error) {
    if (error instanceof Error && error.message === "NEW_CYCLE_CAPITAL_REQUIRED") {
      await sendCapitalRequiredMessage(chatId);
    }
    throw error;
  }

  const snapshotSaved = saveGoldbitPlanSnapshot(plan);
  const baseId = planBaseId(plan);
  const groupId = `${baseId}-${createPlanSessionId()}`;
  const expiredCandidates = await expirePendingCandidatesByIdPrefix(`${baseId}-`);
  const drafts = [...plan.buyOrders, ...plan.sellOrders]
    .map((order, index) => toCandidate(plan, order, index + 1, groupId, baseId))
    .filter((candidate): candidate is CandidateDraft => Boolean(candidate));
  const candidates: OrderCandidate[] = [];

  for (const draft of drafts) {
    candidates.push(await saveCandidate(draft));
  }

  await sendActionPlanMessage(plan, candidates, chatId);
  await writeLog("INFO", "Goldbit action plan sent", {
    date: plan.date,
    mode: plan.mode,
    phase: plan.phase,
    candidateCount: candidates.length,
    planGroupId: groupId,
    expiredCandidates,
    snapshotSaved
  });

  return { plan, candidates };
};
