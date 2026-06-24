import type { OrderCandidate } from "@prisma/client";
import { config } from "../config.js";
import type { TradeSyncResult } from "../goldbit/trade-sync.js";
import type { DailyPlan } from "../goldbit/mechanism-types.js";
import { writeLog } from "../storage/logs.js";

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export const callTelegramApi = async <T>(
  method: string,
  payload: Record<string, unknown>
): Promise<T> => {
  if (!config.telegram.botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  }

  const response = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const body = (await response.json()) as TelegramApiResponse<T>;
  if (!response.ok || !body.ok) {
    throw new Error(body.description ?? `Telegram API failed: ${method}`);
  }

  return body.result as T;
};

const formatMoney = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "N/A";
  return `$${value.toFixed(2)}`;
};

export const sendTextMessage = async (message: string, chatId = config.telegram.chatId): Promise<void> => {
  if (!config.telegram.botToken || !chatId) {
    await writeLog("WARN", "Telegram configuration missing; text message not sent");
    return;
  }

  await callTelegramApi("sendMessage", {
    chat_id: chatId,
    text: message
  });
};

export const sendCandidateMessage = async (candidate: OrderCandidate): Promise<void> => {
  await sendTextMessage(
    [
      "[Goldbit 주문 후보]",
      "",
      `종목: ${candidate.symbol}`,
      `구분: ${candidate.orderType} ${candidate.side}`,
      `수량: ${candidate.quantity.toFixed(0)}주`,
      `가격: ${formatMoney(candidate.estimatedPrice)}`,
      `예상금액: ${formatMoney(candidate.estimatedAmount)}`
    ].join("\n")
  );
};

const formatOrderLine = (candidate: OrderCandidate, index: number): string => {
  return [
    `${index + 1}. ${candidate.side} ${candidate.orderType}`,
    `${candidate.quantity.toFixed(0)}주`,
    `@ ${formatMoney(candidate.estimatedPrice)}`,
    candidate.estimatedAmount ? `약 ${formatMoney(candidate.estimatedAmount)}` : undefined
  ]
    .filter(Boolean)
    .join(" ");
};

const getPlanGroupId = (candidates: OrderCandidate[]): string | undefined => {
  if (!candidates[0]?.rawData) return undefined;
  const rawData = JSON.parse(candidates[0].rawData) as { planGroupId?: string };
  return rawData.planGroupId;
};

export const renderActionPlanMessage = (plan: DailyPlan, candidates: OrderCandidate[]): string => {
  const buyLines = candidates.filter((candidate) => candidate.side === "BUY").map(formatOrderLine);
  const sellLines = candidates.filter((candidate) => candidate.side === "SELL").map(formatOrderLine);

  return [
    "[Goldbit Today Action Plan]",
    "",
    `날짜: ${plan.date}`,
    `종목: ${plan.symbol}`,
    `모드: ${plan.mode} / ${plan.phase}`,
    `T값: ${plan.tValue.toFixed(4)}`,
    `보유수량: ${plan.quantity}주`,
    `평균단가: ${formatMoney(plan.averagePrice)}`,
    `현금: ${formatMoney(plan.cashBalance)}`,
    "",
    `별지점: ${formatMoney(plan.starPrice)}`,
    `매수점: ${formatMoney(plan.buyPrice)}`,
    `지정가 매도: ${formatMoney(plan.limitSellPrice)}`,
    "",
    "매수 후보:",
    ...(buyLines.length > 0 ? buyLines : ["- 없음"]),
    "",
    "매도 후보:",
    ...(sellLines.length > 0 ? sellLines : ["- 없음"]),
    ...(plan.warnings.length > 0 ? ["", "주의:", ...plan.warnings.map((warning) => `- ${warning}`)] : []),
    "",
    `승인 가능 시간: ${config.approvalExpireMinutes}분`,
    "승인하면 위 후보 전체를 순서대로 주문합니다."
  ].join("\n");
};

export const sendActionPlanMessage = async (
  plan: DailyPlan,
  candidates: OrderCandidate[],
  chatId = config.telegram.chatId
): Promise<void> => {
  if (!config.telegram.botToken || !chatId) {
    await writeLog("WARN", "Telegram configuration missing; action plan message not sent");
    return;
  }

  const groupId = getPlanGroupId(candidates);
  const keyboard = groupId
    ? [
        [
          { text: "전체 승인", callback_data: `approve-plan:${groupId}` },
          { text: "전체 취소", callback_data: `cancel-plan:${groupId}` }
        ]
      ]
    : [];

  await callTelegramApi("sendMessage", {
    chat_id: chatId,
    text: renderActionPlanMessage(plan, candidates),
    ...(keyboard.length > 0
      ? {
          reply_markup: {
            inline_keyboard: keyboard
          }
        }
      : {})
  });
};

const formatSyncTradeLine = (trade: TradeSyncResult["trades"][number], index: number): string => {
  return `${index + 1}. ${trade.side} ${trade.orderType} ${trade.quantity}주 @ ${formatMoney(trade.price)} 약 ${formatMoney(trade.amount)}`;
};

export const renderTradeSyncMessage = (result: TradeSyncResult): string => {
  const tradeLines = result.trades.length > 0
    ? result.trades.map(formatSyncTradeLine)
    : ["- 신규 반영 거래 없음"];
  const tLine =
    result.tBefore !== undefined && result.tAfter !== undefined
      ? `${result.tBefore.toFixed(4)} -> ${result.tAfter.toFixed(4)}${result.tEventType ? ` (${result.tEventType})` : ""}`
      : result.tEventApplied
        ? "적용됨"
        : "변화 없음";

  return [
    "[Goldbit 05:30 체결 동기화]",
    "",
    `거래일: ${result.tradingDate ?? "N/A"}`,
    `조회 체결: ${result.fetchedExecutions}건`,
    `신규 반영: ${result.createdTrades}건`,
    `스킵/기반영: ${result.skippedExecutions}건`,
    "",
    "거래 요약:",
    ...tradeLines,
    "",
    `T값 변화: ${tLine}`,
    `Cycle 종료: ${result.cycleClosed ? `예 (${result.archivedCycleId ?? "archived"})` : "아니오"}`,
    ...(result.tEventReason ? ["", `판단 근거: ${result.tEventReason}`] : [])
  ].join("\n");
};

export const sendTradeSyncMessage = async (result: TradeSyncResult): Promise<void> => {
  await sendTextMessage(renderTradeSyncMessage(result));
};
