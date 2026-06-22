import type { OrderCandidate } from "@prisma/client";
import { assertTargetSymbol, config } from "../config.js";
import { findCandidate, markCandidateStatus } from "../storage/candidates.js";
import { saveExecution } from "../storage/executions.js";
import { writeLog } from "../storage/logs.js";
import { buildLocOrderRequest, placeOrder } from "../toss/order.js";
import { parseTossError } from "../toss/client.js";
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

const isExpired = (candidate: OrderCandidate): boolean => {
  return Boolean(candidate.expiresAt && candidate.expiresAt.getTime() < Date.now());
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
  return buildLocOrderRequest({
    symbol: candidate.symbol,
    side: "BUY",
    orderType: "LOC",
    quantity: candidate.quantity,
    limitPrice: candidate.estimatedPrice ?? undefined,
    accountId: config.toss.accountId,
    clientOrderId: candidate.id.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 36)
  });
};

export const approveCandidate = async (candidateId: string): Promise<void> => {
  await writeLog("INFO", "approval received", { candidateId });

  const candidate = await findCandidate(candidateId);
  if (!candidate) {
    throw new Error(`Candidate not found: ${candidateId}`);
  }

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
    await sendTextMessage(
      [
        "[Goldbit 주문 실행 완료]",
        "",
        `종목: ${candidate.symbol}`,
        `구분: ${candidate.orderType} 매수`,
        `수량: ${candidate.quantity.toFixed(2)}주`,
        "상태: 주문 요청 성공",
        `주문 ID: ${orderResult.brokerOrderId ?? "N/A"}`
      ].join("\n")
    );
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
    await sendTextMessage(
      [
        "[Goldbit 주문 실행 실패]",
        "",
        `종목: ${candidate.symbol}`,
        `구분: ${candidate.orderType} 매수`,
        `수량: ${candidate.quantity.toFixed(2)}주`,
        `사유: ${errorMessage}`
      ].join("\n")
    );
  }
};

export const cancelCandidate = async (candidateId: string): Promise<void> => {
  await writeLog("INFO", "cancel received", { candidateId });

  const candidate = await findCandidate(candidateId);
  if (!candidate) {
    throw new Error(`Candidate not found: ${candidateId}`);
  }

  if (candidate.status !== "PENDING") {
    throw new Error(`Only PENDING candidate can be canceled. Current status: ${candidate.status}`);
  }

  await markCandidateStatus(candidate.id, "CANCELED", "canceledAt");
  await sendTextMessage(
    [
      "[Goldbit 주문 후보 취소]",
      "",
      `종목: ${candidate.symbol}`,
      `후보 ID: ${candidate.id}`,
      "상태: CANCELED"
    ].join("\n")
  );
};

export const handleApprovalCallback = async (query: TelegramCallbackQuery): Promise<void> => {
  const data = query.data ?? "";
  const [action, candidateId] = data.split(":");
  const chatId = query.message?.chat?.id?.toString();

  if (!candidateId || (action !== "approve" && action !== "cancel")) {
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
      await approveCandidate(candidateId);
      await callTelegramApi("answerCallbackQuery", {
        callback_query_id: query.id,
        text: "승인 처리 완료"
      });
    } else {
      await cancelCandidate(candidateId);
      await callTelegramApi("answerCallbackQuery", {
        callback_query_id: query.id,
        text: "취소 처리 완료"
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeLog("ERROR", "approval callback failed", { candidateId, action, error: message });
    await callTelegramApi("answerCallbackQuery", {
      callback_query_id: query.id,
      text: message,
      show_alert: true
    });
  }
};
