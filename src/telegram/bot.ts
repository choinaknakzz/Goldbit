import { writeLog } from "../storage/logs.js";
import { config } from "../config.js";
import { createAndSendGoldbitActionPlan } from "../goldbit/action-plan.js";
import { sendSoxlStatus } from "../goldbit/status.js";
import { callTelegramApi, sendTextMessage } from "./message.js";
import { handleApprovalCallback, type TelegramCallbackQuery } from "./approval.js";

interface TelegramUpdate {
  update_id: number;
  callback_query?: TelegramCallbackQuery;
  message?: {
    chat?: {
      id?: number | string;
    };
    text?: string;
  };
}

let lastUpdateId = 0;

const sleep = (milliseconds: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const isAllowedChat = (chatId?: string): boolean => {
  return (
    config.telegram.allowedChatIds.length === 0 ||
    Boolean(chatId && config.telegram.allowedChatIds.includes(chatId))
  );
};

const handleMessage = async (message: TelegramUpdate["message"]): Promise<void> => {
  const chatId = message?.chat?.id?.toString();
  const text = normalizeCommand(message?.text);

  if (!text || !["/soxl", "/status", "/plan", "/today", "/candidate", "/help", "/start"].includes(text)) {
    return;
  }

  if (!isAllowedChat(chatId)) {
    await writeLog("WARN", "Telegram status command rejected from unauthorized chat", { chatId });
    return;
  }

  await writeLog("INFO", "Telegram command received", { chatId, text });

  if (text === "/soxl" || text === "/status") {
    await sendSoxlStatus(chatId);
    return;
  }

  if (text === "/plan" || text === "/today" || text === "/candidate") {
    const { plan, candidates } = await createAndSendGoldbitActionPlan(chatId);
    await writeLog("INFO", "Telegram action plan command completed", {
      chatId,
      date: plan.date,
      candidateCount: candidates.length
    });
    return;
  }

  await sendHelpMessage(chatId);
};

const normalizeCommand = (text?: string): string | undefined => {
  const command = text?.trim().split(/\s+/)[0]?.toLowerCase();
  return command?.replace(/@.+$/, "");
};

const sendHelpMessage = async (chatId?: string): Promise<void> => {
  await sendTextMessage(
    [
      "[Goldbit Bot 명령어]",
      "",
      "/soxl 또는 /status - 현재 SOXL 정보와 최근 체결 확인",
      "/plan 또는 /today - Today Action Plan 후보 수동 전송",
      "/candidate - /plan과 동일",
      "",
      "Today Action Plan 메시지에서 전체 승인을 누르면 후보 전체를 순서대로 주문합니다."
    ].join("\n"),
    chatId
  );
};

const pollUpdates = async (): Promise<void> => {
  while (true) {
    try {
      const updates = await callTelegramApi<TelegramUpdate[]>("getUpdates", {
        offset: lastUpdateId + 1,
        timeout: 25,
        allowed_updates: ["callback_query", "message"]
      });

      for (const update of updates) {
        lastUpdateId = Math.max(lastUpdateId, update.update_id);
        if (update.callback_query) {
          await handleApprovalCallback(update.callback_query);
        }
        if (update.message) {
          await handleMessage(update.message);
        }
      }
    } catch (error) {
      await writeLog("ERROR", "Telegram polling error", {
        error: error instanceof Error ? error.message : String(error)
      });
      await sleep(5_000);
    }
  }
};

export const startBot = async (): Promise<void> => {
  if (!config.telegram.botToken) {
    await writeLog("WARN", "Telegram bot token missing; bot polling not started");
    return;
  }

  await writeLog("INFO", "Telegram bot started");
  void pollUpdates();
};
