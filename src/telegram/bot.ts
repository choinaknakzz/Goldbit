import { writeLog } from "../storage/logs.js";
import { config } from "../config.js";
import { sendSoxlStatus } from "../goldbit/status.js";
import { callTelegramApi } from "./message.js";
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
  const text = message?.text?.trim().toLowerCase();

  if (!text || !["/soxl", "/status"].includes(text)) {
    return;
  }

  if (!isAllowedChat(chatId)) {
    await writeLog("WARN", "Telegram status command rejected from unauthorized chat", { chatId });
    return;
  }

  await writeLog("INFO", "Telegram status command received", { chatId, text });
  await sendSoxlStatus(chatId);
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
