import type { OrderCandidate } from "@prisma/client";
import { config } from "../config.js";
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

const money = (value: number | null): string => {
  if (value === null) return "TODO: Toss API required";
  return `$${value.toFixed(2)}`;
};

const numberText = (value: number | null): string => {
  if (value === null) return "TODO: Toss API required";
  return value.toFixed(2);
};

export const renderCandidateMessage = (candidate: OrderCandidate): string => {
  const rawData = candidate.rawData ? JSON.parse(candidate.rawData) : {};
  const holdingQuantity = typeof rawData.holdingQuantity === "number" ? rawData.holdingQuantity : null;
  const averagePrice = typeof rawData.averagePrice === "number" ? rawData.averagePrice : null;
  const availableCash =
    rawData.availableCash && typeof rawData.availableCash.amount === "number" ? rawData.availableCash.amount : null;

  return [
    "[Goldbit 매매 후보]",
    "",
    `종목: ${candidate.symbol}`,
    "전략: 무한매수법 V4 placeholder",
    `구분: ${candidate.orderType} 매수`,
    "",
    `현재가: ${money(candidate.estimatedPrice)}`,
    `보유수량: ${numberText(holdingQuantity)}주`,
    `평균단가: ${money(averagePrice)}`,
    `주문가능금액: ${money(availableCash)}`,
    "",
    "주문 후보:",
    `- 주문유형: ${candidate.orderType} 매수`,
    `- 수량: ${candidate.quantity.toFixed(2)}주`,
    `- 예상금액: 약 ${money(candidate.estimatedAmount)}`,
    "",
    `승인 가능 시간: ${config.approvalExpireMinutes}분`,
    "",
    "실행할까요?"
  ].join("\n");
};

export const sendCandidateMessage = async (candidate: OrderCandidate): Promise<void> => {
  if (!config.telegram.botToken || !config.telegram.chatId) {
    await writeLog("WARN", "Telegram configuration missing; candidate message not sent", {
      candidateId: candidate.id
    });
    return;
  }

  try {
    await callTelegramApi("sendMessage", {
      chat_id: config.telegram.chatId,
      text: renderCandidateMessage(candidate),
      reply_markup: {
        inline_keyboard: [
          [
            { text: "승인", callback_data: `approve:${candidate.id}` },
            { text: "취소", callback_data: `cancel:${candidate.id}` }
          ]
        ]
      }
    });
    await writeLog("INFO", "Telegram candidate message sent", { candidateId: candidate.id });
  } catch (error) {
    await writeLog("ERROR", "Telegram candidate message failed", {
      candidateId: candidate.id,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
};

export const sendTextMessage = async (message: string): Promise<void> => {
  if (!config.telegram.botToken || !config.telegram.chatId) {
    await writeLog("WARN", "Telegram configuration missing; text message not sent");
    return;
  }

  await callTelegramApi("sendMessage", {
    chat_id: config.telegram.chatId,
    text: message
  });
};
