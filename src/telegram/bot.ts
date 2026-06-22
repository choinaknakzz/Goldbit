import { writeLog } from "../storage/logs.js";
import { config } from "../config.js";
import { callTelegramApi } from "./message.js";
import { handleApprovalCallback, type TelegramCallbackQuery } from "./approval.js";

interface TelegramUpdate {
  update_id: number;
  callback_query?: TelegramCallbackQuery;
}

let lastUpdateId = 0;

const sleep = (milliseconds: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const pollUpdates = async (): Promise<void> => {
  while (true) {
    try {
      const updates = await callTelegramApi<TelegramUpdate[]>("getUpdates", {
        offset: lastUpdateId + 1,
        timeout: 25,
        allowed_updates: ["callback_query"]
      });

      for (const update of updates) {
        lastUpdateId = Math.max(lastUpdateId, update.update_id);
        if (update.callback_query) {
          await handleApprovalCallback(update.callback_query);
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
