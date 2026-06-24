import { config } from "../config.js";
import { createAndSendGoldbitActionPlan } from "../goldbit/action-plan.js";
import { applyNextCycleCapital, isWaitingForCycleCapital, parseCapitalAmount } from "../goldbit/capital.js";
import { readGoldbitState } from "../goldbit/state.js";
import { sendSoxlStatus } from "../goldbit/status.js";
import { writeLog } from "../storage/logs.js";
import { handleApprovalCallback, type TelegramCallbackQuery } from "./approval.js";
import { callTelegramApi, sendTextMessage } from "./message.js";

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

const botCommands = [
  { command: "soxl", description: "현재 SOXL 정보와 최근 체결 확인" },
  { command: "status", description: "현재 SOXL 정보 확인" },
  { command: "today", description: "Today Action Plan 후보 수동 전송" },
  { command: "plan", description: "Today Action Plan 후보 수동 전송" },
  { command: "candidate", description: "매매 후보 수동 전송" },
  { command: "capital", description: "새 사이클 총자산 입력" },
  { command: "help", description: "Goldbit Bot 명령어 안내" }
];

const supportedCommands = new Set(["/soxl", "/status", "/plan", "/today", "/candidate", "/capital", "/help", "/start"]);

const sleep = (milliseconds: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const isAllowedChat = (chatId?: string): boolean => {
  return config.telegram.allowedChatIds.length === 0 || Boolean(chatId && config.telegram.allowedChatIds.includes(chatId));
};

const normalizeCommand = (text?: string): string | undefined => {
  const command = text?.trim().split(/\s+/)[0]?.toLowerCase();
  return command?.replace(/@.+$/, "");
};

const sendCapitalHelpMessage = async (chatId?: string): Promise<void> => {
  const state = readGoldbitState();
  const pending = state.pendingCycleCapitalInput;
  await sendTextMessage(
    [
      "[Goldbit 새 사이클 총자산]",
      "",
      pending ? "현재 새 사이클 총자산 입력 대기 중입니다." : "현재 입력 대기 상태는 아니지만 총자산을 갱신할 수 있습니다.",
      "20분할은 고정으로 유지됩니다.",
      pending?.previousCashBalance !== undefined ? `이전 종료 현금: $${pending.previousCashBalance.toFixed(2)}` : undefined,
      "",
      "예시:",
      "/capital 20000"
    ]
      .filter(Boolean)
      .join("\n"),
    chatId
  );
};

const handleCapitalInput = async (rawText: string, chatId?: string): Promise<boolean> => {
  const command = normalizeCommand(rawText);
  const isCapitalCommand = command === "/capital";
  const state = readGoldbitState();
  const isPlainPendingAmount = !command?.startsWith("/") && isWaitingForCycleCapital(state);

  if (!isCapitalCommand && !isPlainPendingAmount) {
    return false;
  }

  const amountText = isCapitalCommand ? rawText.split(/\s+/).slice(1).join(" ") : rawText;
  const amount = parseCapitalAmount(amountText);

  if (amount === null) {
    await sendCapitalHelpMessage(chatId);
    return true;
  }

  const nextState = applyNextCycleCapital(amount);
  await writeLog("INFO", "Goldbit next cycle capital updated from Telegram", {
    chatId,
    amount,
    division: nextState.strategy.division
  });
  await sendTextMessage(
    [
      "[Goldbit 새 사이클 시작 준비 완료]",
      "",
      `총자산: $${amount.toFixed(2)}`,
      `분할: ${nextState.strategy.division}분할`,
      "T값: 0",
      "",
      "이제 /candidate 로 다음 매매 후보를 수동 확인할 수 있습니다."
    ].join("\n"),
    chatId
  );
  return true;
};

const sendHelpMessage = async (chatId?: string): Promise<void> => {
  await sendTextMessage(
    [
      "[Goldbit Bot 명령어]",
      "",
      "/soxl 또는 /status - 현재 SOXL 정보와 최근 체결 확인",
      "/plan 또는 /today - Today Action Plan 후보 수동 전송",
      "/candidate - /plan과 동일",
      "/capital 20000 - 새 사이클 총자산 입력",
      "",
      "Today Action Plan 메시지에서 전체 승인을 누르면 후보 전체를 순서대로 주문합니다.",
      "사이클 종료 후에는 새 총자산을 입력해야 다음 후보가 생성됩니다."
    ].join("\n"),
    chatId
  );
};

const handleMessage = async (message: TelegramUpdate["message"]): Promise<void> => {
  const chatId = message?.chat?.id?.toString();
  const rawText = message?.text?.trim();

  if (!rawText) {
    return;
  }

  if (!isAllowedChat(chatId)) {
    await writeLog("WARN", "Telegram command rejected from unauthorized chat", { chatId });
    return;
  }

  if (await handleCapitalInput(rawText, chatId)) {
    return;
  }

  const text = normalizeCommand(rawText);
  if (!text || !supportedCommands.has(text)) {
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

  if (text === "/capital") {
    await sendCapitalHelpMessage(chatId);
    return;
  }

  await sendHelpMessage(chatId);
};

const registerBotCommands = async (): Promise<void> => {
  try {
    await callTelegramApi("setMyCommands", {
      commands: botCommands,
      scope: { type: "default" }
    });
    await writeLog("INFO", "Telegram bot commands registered", { commandCount: botCommands.length });
  } catch (error) {
    await writeLog("ERROR", "Telegram bot command registration failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
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

  await registerBotCommands();
  await writeLog("INFO", "Telegram bot started");
  void pollUpdates();
};
