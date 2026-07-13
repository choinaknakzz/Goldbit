import type { OrderCandidate } from "@prisma/client";
import { assertTargetSymbol, config } from "../config.js";
import { evaluateBuyingPower } from "../goldbit/order-preflight.js";
import {
  claimPendingCandidate,
  findCandidate,
  findCandidatesByIdPrefix,
  markCandidateStatus
} from "../storage/candidates.js";
import { saveExecution, updateExecution } from "../storage/executions.js";
import { writeLog } from "../storage/logs.js";
import { getAvailableCash } from "../toss/account.js";
import { parseTossError } from "../toss/client.js";
import {
  placeOrder,
  verifyOrderAcceptance,
  verifyOrderAcceptanceByClientOrderId,
  type OrderAcceptance
} from "../toss/order.js";
import type { ExecutionStatus, OrderRequest } from "../types/index.js";
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
  status: "ACCEPTED" | "SUBMITTED" | "FAILED";
  attemptedAt: Date;
  detail?: string;
  errorMessage?: string;
  orderStatus?: string;
}

const isExpired = (candidate: OrderCandidate): boolean => {
  return Boolean(candidate.expiresAt && candidate.expiresAt.getTime() < Date.now());
};

const getCandidateSequence = (candidate: OrderCandidate): number => {
  if (!candidate.rawData) return 999;
  const rawData = JSON.parse(candidate.rawData) as { sequence?: number };
  return rawData.sequence ?? 999;
};

const getCandidatePlanGroupId = (candidate: OrderCandidate): string | undefined => {
  if (!candidate.rawData) return undefined;
  const rawData = JSON.parse(candidate.rawData) as { planGroupId?: string };
  return rawData.planGroupId;
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

  if (!(await claimPendingCandidate(candidate.id))) {
    throw new Error("Candidate was already claimed or is no longer pending.");
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

const assertSufficientBuyingPower = async (candidates: OrderCandidate[], chatId?: string): Promise<void> => {
  const availableCash = await getAvailableCash();
  const check = evaluateBuyingPower(candidates, availableCash.amount);
  if (check.sufficient) return;

  await writeLog("WARN", "plan approval blocked by insufficient Toss buying power", {
    requiredAmount: check.requiredAmount,
    availableAmount: check.availableAmount,
    shortfall: check.shortfall,
    currency: availableCash.currency,
    candidateCount: candidates.length
  });
  await sendTextMessage(
    [
      "[Goldbit 주문 전 잔액 경고]",
      "",
      "Toss 매수가능금액이 계획 매수액보다 부족합니다.",
      `계획 매수액: ${money(check.requiredAmount)}`,
      `매수가능금액: ${money(check.availableAmount)}`,
      `부족액: ${money(check.shortfall)}`,
      "",
      "주문은 시작하지 않았습니다. 잔액을 정리한 뒤 같은 승인 버튼을 다시 눌러주세요."
    ].join("\n"),
    chatId
  );
  throw new Error("Toss 매수가능금액이 부족합니다. Telegram 경고 메시지를 확인하세요.");
};

const isDefinitiveOrderFailure = (error: unknown): boolean => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return typeof status === "number" && status >= 400 && status < 500 && ![408, 409, 425, 429].includes(status);
};

const completeAcceptanceCheck = async (
  candidate: OrderCandidate,
  executionId: string,
  brokerOrderId: string,
  acceptance: OrderAcceptance,
  attemptedAt: Date
): Promise<ExecutionAttempt> => {
  if (acceptance.accepted) {
    await updateExecution(executionId, {
      status: "SUCCESS",
      brokerOrderId,
      responsePayload: { acceptance },
      errorMessage: null,
      verifiedAt: new Date()
    });
    await markCandidateStatus(candidate.id, "EXECUTED", "executedAt");
    await writeLog("INFO", "order acceptance verified", {
      candidateId: candidate.id,
      orderStatus: acceptance.orderStatus
    });
    return {
      candidate,
      status: "ACCEPTED",
      attemptedAt,
      detail: acceptance.detail,
      orderStatus: acceptance.orderStatus
    };
  }

  if (!acceptance.verified) {
    await updateExecution(executionId, {
      status: "SUBMITTED",
      brokerOrderId,
      responsePayload: { acceptance },
      errorMessage: acceptance.detail
    });
    await markCandidateStatus(candidate.id, "SUBMITTED");
    return {
      candidate,
      status: "SUBMITTED",
      attemptedAt,
      detail: acceptance.detail,
      orderStatus: acceptance.orderStatus
    };
  }

  await updateExecution(executionId, {
    status: "FAILED",
    brokerOrderId,
    responsePayload: { acceptance },
    errorMessage: acceptance.detail,
    verifiedAt: new Date()
  });
  await markCandidateStatus(candidate.id, "FAILED");
  await writeLog("ERROR", "order acceptance failed", {
    candidateId: candidate.id,
    orderStatus: acceptance.orderStatus,
    detail: acceptance.detail
  });
  return {
    candidate,
    status: "FAILED",
    attemptedAt,
    errorMessage: acceptance.detail,
    orderStatus: acceptance.orderStatus
  };
};

const executeCandidate = async (candidate: OrderCandidate): Promise<ExecutionAttempt> => {
  const attemptedAt = new Date();
  await assertExecutableCandidate(candidate);
  const orderRequest = createOrderRequest(candidate);
  const clientOrderId = orderRequest.clientOrderId as string;

  try {
    const orderResult = await placeOrder(orderRequest);
    const brokerOrderId = orderResult.brokerOrderId;

    if (!brokerOrderId) {
      throw new Error("Toss order request did not return an orderId.");
    }

    const execution = await saveExecution({
      candidateId: candidate.id,
      clientOrderId,
      symbol: candidate.symbol,
      side: candidate.side,
      orderType: candidate.orderType,
      quantity: candidate.quantity,
      status: "SUBMITTED",
      brokerOrderId,
      requestPayload: orderRequest,
      responsePayload: { order: orderResult.raw }
    });
    await markCandidateStatus(candidate.id, "SUBMITTED");

    try {
      const acceptance = await verifyOrderAcceptance(brokerOrderId, orderRequest, orderResult.accountId);
      return await completeAcceptanceCheck(candidate, execution.id, brokerOrderId, acceptance, attemptedAt);
    } catch (error) {
      const errorMessage = parseTossError(error);
      await updateExecution(execution.id, { status: "SUBMITTED", brokerOrderId, errorMessage });
      await writeLog("WARN", "order submitted but acceptance lookup failed", {
        candidateId: candidate.id,
        error: errorMessage
      });
      return { candidate, status: "SUBMITTED", attemptedAt, errorMessage };
    }
  } catch (error) {
    const errorMessage = parseTossError(error);
    const recovered = await verifyOrderAcceptanceByClientOrderId(clientOrderId, orderRequest).catch(() => null);
    const executionStatus: ExecutionStatus = recovered
      ? "SUBMITTED"
      : isDefinitiveOrderFailure(error)
        ? "FAILED"
        : "SUBMITTED";
    const execution = await saveExecution({
      candidateId: candidate.id,
      clientOrderId,
      symbol: candidate.symbol,
      side: candidate.side,
      orderType: candidate.orderType,
      quantity: candidate.quantity,
      status: executionStatus,
      brokerOrderId: recovered?.brokerOrderId,
      requestPayload: orderRequest,
      errorMessage
    });

    if (recovered) {
      return completeAcceptanceCheck(
        candidate,
        execution.id,
        recovered.brokerOrderId,
        recovered.acceptance,
        attemptedAt
      );
    }

    if (executionStatus === "FAILED") {
      await markCandidateStatus(candidate.id, "FAILED");
      await writeLog("ERROR", "order request definitively failed", { candidateId: candidate.id, error: errorMessage });
      return { candidate, status: "FAILED", attemptedAt, errorMessage };
    }

    await markCandidateStatus(candidate.id, "SUBMITTED");
    await writeLog("WARN", "order request outcome is unknown and will be reconciled", {
      candidateId: candidate.id,
      error: errorMessage
    });
    return { candidate, status: "SUBMITTED", attemptedAt, errorMessage };
  }
};

const renderExecutionSummary = (title: string, attempts: ExecutionAttempt[]): string => {
  const acceptedCount = attempts.filter((attempt) => attempt.status === "ACCEPTED").length;
  const submittedCount = attempts.filter((attempt) => attempt.status === "SUBMITTED").length;
  const failedCount = attempts.filter((attempt) => attempt.status === "FAILED").length;
  const lines = attempts.map((attempt, index) => {
    const result =
      attempt.status === "ACCEPTED" ? "접수 확인 완료" : attempt.status === "SUBMITTED" ? "접수 확인 필요" : "실패";
    const detail =
      attempt.status === "ACCEPTED"
        ? `결과: ${attempt.detail ?? "토스 주문 목록에서 접수 상태를 확인했습니다."}`
        : attempt.status === "SUBMITTED"
          ? `결과: ${attempt.detail ?? "주문 요청은 전송됐지만 접수 상태를 아직 확인하지 못했습니다."}`
          : `사유: ${attempt.errorMessage ?? "Unknown error"}`;

    return [
      `${index + 1}. ${result}`,
      `- 주문: ${orderLabel(attempt.candidate)}`,
      `- 요청시각: ${formatKstTime(attempt.attemptedAt)}`,
      attempt.orderStatus ? `- 주문상태: ${attempt.orderStatus}` : undefined,
      `- ${detail}`
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    title,
    "",
    `총 주문 시도: ${attempts.length}건`,
    `접수 확인: ${acceptedCount}건`,
    `확인 필요: ${submittedCount}건`,
    `실패: ${failedCount}건`,
    "",
    ...lines
  ].join("\n");
};

export const approveCandidate = async (candidateId: string, chatId?: string): Promise<void> => {
  await writeLog("INFO", "single approval received", { candidateId });
  const candidate = await findCandidate(candidateId);
  if (!candidate) {
    throw new Error(`Candidate not found: ${candidateId}`);
  }

  await assertSufficientBuyingPower([candidate], chatId);
  const attempt = await executeCandidate(candidate);
  await sendTextMessage(renderExecutionSummary("[Goldbit 주문 실행 결과]", [attempt]));
};

export const approvePlan = async (planGroupId: string, chatId?: string): Promise<void> => {
  await writeLog("INFO", "plan approval received", { planGroupId });
  const candidates = sortCandidatesByPlanOrder(await findCandidatesByIdPrefix(`${planGroupId}-`)).filter(
    (candidate) => candidate.status === "PENDING" && getCandidatePlanGroupId(candidate) === planGroupId
  );

  if (candidates.length === 0) {
    throw new Error(`No pending candidates found for plan: ${planGroupId}`);
  }

  await assertSufficientBuyingPower(candidates, chatId);
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
  await sendTextMessage(["[Goldbit 주문 후보 취소]", "", `종목: ${candidate.symbol}`, "상태: CANCELED"].join("\n"));
};

export const cancelPlan = async (planGroupId: string): Promise<void> => {
  await writeLog("INFO", "plan cancel received", { planGroupId });
  const candidates = sortCandidatesByPlanOrder(await findCandidatesByIdPrefix(`${planGroupId}-`)).filter(
    (candidate) => candidate.status === "PENDING" && getCandidatePlanGroupId(candidate) === planGroupId
  );

  if (candidates.length === 0) {
    throw new Error(`No pending candidates found for plan: ${planGroupId}`);
  }

  for (const candidate of candidates) {
    await markCandidateStatus(candidate.id, "CANCELED", "canceledAt");
  }

  await sendTextMessage(
    ["[Goldbit Plan 주문 후보 취소]", "", `Plan: ${planGroupId}`, `취소 후보 수: ${candidates.length}`, "상태: CANCELED"].join(
      "\n"
    )
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
    if (config.telegram.allowedChatIds.length > 0 && (!chatId || !config.telegram.allowedChatIds.includes(chatId))) {
      throw new Error("This Telegram chat is not allowed.");
    }

    if (action === "approve") {
      await approveCandidate(targetId, chatId);
    } else if (action === "cancel") {
      await cancelCandidate(targetId);
    } else if (action === "approve-plan") {
      await approvePlan(targetId, chatId);
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
