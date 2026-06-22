import type { OrderCandidate } from "@prisma/client";
import { assertTargetSymbol, config } from "../config.js";
import {
  findCandidate,
  findCandidatesByIdPrefix,
  markCandidateStatus
} from "../storage/candidates.js";
import { saveExecution } from "../storage/executions.js";
import { writeLog } from "../storage/logs.js";
import { parseTossError } from "../toss/client.js";
import { placeOrder } from "../toss/order.js";
import type { OrderRequest } from "../types/index.js";
import { callTelegramApi, sendTextMessage } from "./message.js";

export interface TelegramCallbackQuery {
  id: string;
  data?: string;
  message?: {
    chat?: {
      id?: number | string;
    };
  };
}

interface ExecutionAttempt {
  candidate: OrderCandidate;
  ok: boolean;
  attemptedAt: Date;
  brokerOrderId?: string;
  errorMessage?: string;
}

const isExpired = (candidate: OrderCandidate): boolean => {
  return Boolean(candidate.expiresAt && candidate.expiresAt.getTime() < Date.now());
};

const getCandidateSequence = (candidate: OrderCandidate): number => {
  if (!candidate.rawData) return 999;
  const rawData = JSON.parse(candidate.rawData) as { sequence?: number };
  return rawData.sequence ?? 999;
};

const sortCandidatesByPlanOrder = (candidates: OrderCandidate[]): OrderCandidate[] => {
  return [...candidates].sort((left, right) => getCandidateSequence(left) - getCandidateSequence(right));
};

const assertExecutableCandidate = async (candidate: OrderCandidate): Promise<void> => {
  assertTargetSymbol(candidate.symbol);

  if (candidate.status !== "PENDING") {
    throw new Error(`Candidate is not executable. Current status: ${candidate.status}`);
  }

  if (isExpired(candidate)) {
    await markCandidateStatus(candidate.id, "EXPIRED");
    throw new Error("Candidate is expired.");
  }
};

const createOrderRequest = (candidate: OrderCandidate): OrderRequest => {
  return {
    symbol: candidate.symbol,
    side: candidate.side as OrderRequest["side"],
    orderType: candidate.orderType as OrderRequest["orderType"],
    quantity: candidate.quantity,
    limitPrice: candidate.estimatedPrice ?? undefined,
    accountId: config.toss.accountId,
    clientOrderId: candidate.id.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 36)
  };
};

const money = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "N/A";
  return `$${value.toFixed(2)}`;
};

const orderLabel = (candidate: OrderCandidate): string => {
  return [
    candidate.side,
    candidate.orderType,
    `${candidate.quantity.toFixed(0)}주`,
    `@ ${money(candidate.estimatedPrice)}`,
    candidate.estimatedAmount ? `약 ${money(candidate.estimatedAmount)}` : undefined
  ]
    .filter(Boolean)
    .join(" ");
};

const formatKstTime = (date: Date): string => {
  return date.toLocaleString("ko-KR", { timeZone: config.timezone });
};

const executeCandidate = async (candidate: OrderCandidate): Promise<ExecutionAttempt> => {
  const attemptedAt = new Date();
  await assertExecutableCandidate(candidate);
  await markCandidateStatus(candidate.id, "APPROVED", "approvedAt");
  const orderRequest = createOrderRequest(candidate);

  try {
    const orderResult = await placeOrder(orderRequest);
    await saveExecution({
      candidateId: candidate.id,
      symbol: candidate.symbol,
      side: candidate.side,
      orderType: candidate.orderType,
      quantity: candidate.quantity,
      status: "SUCCESS",
      brokerOrderId: orderResult.brokerOrderId,
      requestPayload: orderRequest,
      responsePayload: orderResult.raw
    });
    await markCandidateStatus(candidate.id, "EXECUTED", "executedAt");
    await writeLog("INFO", "order execution succeeded", { candidateId: candidate.id });
    return { candidate, ok: true, attemptedAt, brokerOrderId: orderResult.brokerOrderId };
  } catch (error) {
    const errorMessage = parseTossError(error);
    await saveExecution({
      candidateId: candidate.id,
      symbol: candidate.symbol,
      side: candidate.side,
      orderType: candidate.orderType,
      quantity: candidate.quantity,
      status: "FAILED",
      requestPayload: orderRequest,
      errorMessage
    });
    await markCandidateStatus(candidate.id, "FAILED");
    await writeLog("ERROR", "order execution failed", { candidateId: candidate.id, error: errorMessage });
    return { candidate, ok: false, attemptedAt, errorMessage };
  }
};

const renderExecutionSummary = (title: string, attempts: ExecutionAttempt[]): string => {
  const successCount = attempts.filter((attempt) => attempt.ok).length;
  const failedCount = attempts.length - successCount;
  const lines = attempts.map((attempt, index) => {
    const result = attempt.ok ? "성공" : "실패";
    const detail = attempt.ok
      ? `주문 ID: ${attempt.brokerOrderId ?? "N/A"}`
      : `사유: ${attempt.errorMessage ?? "Unknown error"}`;

    return [
      `${index + 1}. ${result}`,
      `- 주문: ${orderLabel(attempt.candidate)}`,
      `- 후보 ID: ${attempt.candidate.id}`,
      `- 요청시각: ${formatKstTime(attempt.attemptedAt)}`,
      `- ${detail}`
    ].join("\n");
  });

  return [
    title,
    "",
    `총 주문 시도: ${attempts.length}건`,
    `성공: ${successCount}건`,
    `실패: ${failedCount}건`,
    "",
    ...lines
  ].join("\n");
};

export const approveCandidate = async (candidateId: string): Promise<void> => {
  await writeLog("INFO", "single approval received", { candidateId });
  const candidate = await findCandidate(candidateId);
  if (!candidate) {
    throw new Error(`Candidate not found: ${candidateId}`);
  }

  const attempt = await executeCandidate(candidate);
  await sendTextMessage(renderExecutionSummary("[Goldbit 주문 실행 결과]", [attempt]));
};

export const approvePlan = async (planGroupId: string): Promise<void> => {
  await writeLog("INFO", "plan approval received", { planGroupId });
  const candidates = sortCandidatesByPlanOrder(await findCandidatesByIdPrefix(`${planGroupId}-`)).filter(
    (candidate) => candidate.status === "PENDING"
  );

  if (candidates.length === 0) {
    throw new Error(`No pending candidates found for plan: ${planGroupId}`);
  }

  const attempts: ExecutionAttempt[] = [];
  for (const candidate of candidates) {
    attempts.push(await executeCandidate(candidate));
  }

  await sendTextMessage(renderExecutionSummary("[Goldbit Plan 주문 실행 결과]", attempts));
};

export const cancelCandidate = async (candidateId: string): Promise<void> => {
  await writeLog("INFO", "single cancel received", { candidateId });

  const candidate = await findCandidate(candidateId);
  if (!candidate) {
    throw new Error(`Candidate not found: ${candidateId}`);
  }

  if (candidate.status !== "PENDING") {
    throw new Error(`Only PENDING candidate can be canceled. Current status: ${candidate.status}`);
  }

  await markCandidateStatus(candidate.id, "CANCELED", "canceledAt");
  await sendTextMessage(
    ["[Goldbit 주문 후보 취소]", "", `종목: ${candidate.symbol}`, `후보 ID: ${candidate.id}`, "상태: CANCELED"].join(
      "\n"
    )
  );
};

export const cancelPlan = async (planGroupId: string): Promise<void> => {
  await writeLog("INFO", "plan cancel received", { planGroupId });
  const candidates = sortCandidatesByPlanOrder(await findCandidatesByIdPrefix(`${planGroupId}-`)).filter(
    (candidate) => candidate.status === "PENDING"
  );

  if (candidates.length === 0) {
    throw new Error(`No pending candidates found for plan: ${planGroupId}`);
  }

  for (const candidate of candidates) {
    await markCandidateStatus(candidate.id, "CANCELED", "canceledAt");
  }

  await sendTextMessage(
    [
      "[Goldbit Plan 주문 후보 취소]",
      "",
      `Plan: ${planGroupId}`,
      `취소 후보 수: ${candidates.length}`,
      "상태: CANCELED"
    ].join("\n")
  );
};

export const handleApprovalCallback = async (query: TelegramCallbackQuery): Promise<void> => {
  const data = query.data ?? "";
  const [action, targetId] = data.split(":");
  const chatId = query.message?.chat?.id?.toString();

  if (!targetId || !["approve", "cancel", "approve-plan", "cancel-plan"].includes(action)) {
    return;
  }

  try {
    if (
      config.telegram.allowedChatIds.length > 0 &&
      (!chatId || !config.telegram.allowedChatIds.includes(chatId))
    ) {
      throw new Error("This Telegram chat is not allowed.");
    }

    if (action === "approve") {
      await approveCandidate(targetId);
    } else if (action === "cancel") {
      await cancelCandidate(targetId);
    } else if (action === "approve-plan") {
      await approvePlan(targetId);
    } else {
      await cancelPlan(targetId);
    }

    await callTelegramApi("answerCallbackQuery", {
      callback_query_id: query.id,
      text: "처리 완료"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeLog("ERROR", "approval callback failed", { targetId, action, error: message });
    await callTelegramApi("answerCallbackQuery", {
      callback_query_id: query.id,
      text: message,
      show_alert: true
    });
  }
};
