import fs from "node:fs/promises";
import path from "node:path";
import Tesseract from "tesseract.js";

process.title = "goldbit-telegram-bot";

const ROOT = process.cwd();
const OFFSET_FILE = path.join(ROOT, ".telegram-offset");
const SESSION_FILE = path.join(ROOT, ".telegram-sessions.json");
const DEFAULT_APP_URL = "http://localhost:7777";

const KO_ADD = "\uCD94\uAC00";
const KO_CANCEL = "\uCDE8\uC18C";
const KO_T_ADD = "T\uCD94\uAC00";
const KO_T_RECOMMEND = "T\uCD94\uCC9C";
const KO_TODAY = "\uC624\uB298";
const KO_PLAN = "\uACC4\uD68D";

function loadEnvFile(fileName) {
  return fs
    .readFile(path.join(ROOT, fileName), "utf8")
    .then((content) => {
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const separator = trimmed.indexOf("=");
        if (separator === -1) continue;

        const key = trimmed.slice(0, separator).trim();
        let value = trimmed.slice(separator + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        if (!process.env[key]) process.env[key] = value;
      }
    })
    .catch(() => {});
}

async function loadEnv() {
  await loadEnvFile(".env");
  await loadEnvFile(".env.local");
}

function getConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required in .env or .env.local.");
  }

  return {
    token,
    appUrl: process.env.GOLDBIT_APP_URL || DEFAULT_APP_URL,
    pollTimeout: Number(process.env.TELEGRAM_POLL_TIMEOUT_SECONDS || 25),
    allowedChatIds: new Set(
      (process.env.TELEGRAM_ALLOWED_CHAT_IDS || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  };
}

async function readOffset() {
  try {
    return Number((await fs.readFile(OFFSET_FILE, "utf8")).trim());
  } catch {
    return 0;
  }
}

async function writeOffset(offset) {
  await fs.writeFile(OFFSET_FILE, String(offset), "utf8");
}

async function readSessions() {
  try {
    return JSON.parse(await fs.readFile(SESSION_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function writeSessions(sessions) {
  await fs.writeFile(SESSION_FILE, JSON.stringify(sessions, null, 2), "utf8");
}

async function updateSession(chatId, patch) {
  const sessions = await readSessions();
  sessions[chatId] = {
    ...(sessions[chatId] || {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await writeSessions(sessions);
}

async function clearSessionKeys(chatId, keys) {
  const sessions = await readSessions();
  const current = sessions[chatId] || {};
  for (const key of keys) delete current[key];

  if (Object.keys(current).length === 0) {
    delete sessions[chatId];
  } else {
    sessions[chatId] = {
      ...current,
      updatedAt: new Date().toISOString(),
    };
  }

  await writeSessions(sessions);
}

async function getSession(chatId) {
  const sessions = await readSessions();
  return sessions[chatId] || {};
}

async function telegram(config, method, payload = {}) {
  const response = await fetch(
    `https://api.telegram.org/bot${config.token}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const body = await response.json();
  if (!body.ok) {
    throw new Error(body.description || `Telegram ${method} failed.`);
  }
  return body.result;
}

async function sendMessage(config, chatId, text) {
  await telegram(config, "sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
}

function getChatId(update) {
  const message = update.message || update.edited_message;
  return message?.chat?.id ? String(message.chat.id) : null;
}

function isAllowed(config, chatId) {
  return config.allowedChatIds.size === 0 || config.allowedChatIds.has(chatId);
}

function getMessageText(update) {
  const message = update.message || update.edited_message;
  return message?.text || message?.caption || "";
}

function getBestPhoto(update) {
  const message = update.message || update.edited_message;
  const photos = message?.photo;
  if (!Array.isArray(photos) || photos.length === 0) return null;
  return [...photos].sort((left, right) => right.file_size - left.file_size)[0];
}

async function downloadTelegramFile(config, fileId) {
  const file = await telegram(config, "getFile", { file_id: fileId });
  const url = `https://api.telegram.org/file/bot${config.token}/${file.file_path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Telegram file download failed with HTTP ${response.status}.`);
  }

  const extension = path.extname(file.file_path || "") || ".jpg";
  const directory = path.join(ROOT, ".telegram-downloads");
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, `telegram-${Date.now()}${extension}`);
  await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
  return filePath;
}

async function recognizeImageText(filePath) {
  const result = await Tesseract.recognize(filePath, "kor+eng", {
    logger: (event) => {
      if (event.status === "recognizing text" && event.progress >= 0.99) {
        console.log("OCR recognition almost complete.");
      }
    },
  });
  return result.data.text.trim();
}

async function getJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || `Goldbit API failed with HTTP ${response.status}.`);
  }
  return body;
}

async function createPendingTrade(config, rawText) {
  const body = await getJson(`${config.appUrl}/api/pending-trades`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawText, source: "TELEGRAM" }),
  });
  return body.pendingTrade;
}

async function getPendingTradePreview(config, pendingTradeId) {
  return getJson(`${config.appUrl}/api/pending-trades/${pendingTradeId}/preview`);
}

async function confirmPendingTrade(config, pendingTradeId) {
  const body = await getJson(
    `${config.appUrl}/api/pending-trades/${pendingTradeId}/confirm`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  return body.trade;
}

async function rejectPendingTrade(config, pendingTradeId) {
  await getJson(`${config.appUrl}/api/pending-trades/${pendingTradeId}/reject`, {
    method: "POST",
  });
}

async function fetchTodayPlan(config) {
  const body = await getJson(`${config.appUrl}/api/today-plan`);
  return body.plan;
}

async function fetchTEventSuggestion(config, date) {
  const url = new URL(`${config.appUrl}/api/t-events`);
  if (date) url.searchParams.set("date", date);
  return getJson(url.toString());
}

async function applyTEvent(config, event) {
  const body = await getJson(`${config.appUrl}/api/t-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
  });
  return body.event;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value, digits = 2) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
  }).format(value);
}

function formatOrder(order) {
  const price = order.price == null ? "MKT" : formatCurrency(order.price);
  const quantity = order.quantity == null ? "-" : formatNumber(order.quantity, 0);
  const amount = order.amount == null ? "-" : formatCurrency(order.amount);
  return `${order.side} ${order.orderType} ${quantity} @ ${price} / ${amount}`;
}

function describeTodayPlan(plan) {
  return [
    `Today Action Plan (${plan.date})`,
    `Mode: ${plan.mode} / Phase: ${plan.phase}`,
    `T: ${formatNumber(plan.tValue, 2)}`,
    `Cash: ${formatCurrency(plan.cashBalance)}`,
    `Avg: ${formatCurrency(plan.averagePrice)}`,
    `Qty: ${formatNumber(plan.quantity, 0)}`,
    plan.starPrice ? `Star: ${formatCurrency(plan.starPrice)}` : null,
    plan.buyPrice ? `Buy Point: ${formatCurrency(plan.buyPrice)}` : null,
    plan.sellPrice ? `Sell Point: ${formatCurrency(plan.sellPrice)}` : null,
    plan.limitSellPrice ? `Limit Sell: ${formatCurrency(plan.limitSellPrice)}` : null,
    "",
    "Buy Plan",
    ...(plan.buyOrders.length > 0 ? plan.buyOrders.map(formatOrder) : ["No buy orders."]),
    "",
    "Sell Plan",
    ...(plan.sellOrders.length > 0 ? plan.sellOrders.map(formatOrder) : ["No sell orders."]),
    plan.warnings.length > 0 ? "" : null,
    ...plan.warnings.map((warning) => `Warning: ${warning}`),
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function describePendingTrade(pendingTrade) {
  const trade = pendingTrade.parsedTrade;
  if (!trade) {
    return [
      "Goldbit received the Telegram OCR text, but it needs manual review.",
      `Confidence: ${Math.round(pendingTrade.confidence * 100)}%`,
      "Open Trades -> Pending OCR Review.",
    ].join("\n");
  }

  return [
    "Goldbit pending trade created.",
    `Type: ${trade.type} ${trade.quantity} @ ${trade.price}`,
    `Order: ${trade.orderType}`,
    `Fee: ${trade.fee}`,
    `Date: ${trade.tradedAt}`,
    `Confidence: ${Math.round(pendingTrade.confidence * 100)}%`,
    ...(pendingTrade.notes?.length ? [`Notes: ${pendingTrade.notes.join(" / ")}`] : []),
    "Open Trades -> Pending OCR Review to confirm.",
  ].join("\n");
}

function describePreview(previewBody) {
  const { pendingTrade, preview, error } = previewBody;
  if (!preview) {
    return [
      describePendingTrade(pendingTrade),
      error ? `Preview error: ${error}` : "Preview is not available.",
      `Reply ${KO_CANCEL} to reject this pending trade.`,
    ].join("\n\n");
  }

  const trade = pendingTrade.parsedTrade;
  const before = preview.strategyBefore;
  const after = preview.strategyAfter;
  return [
    "Goldbit pending trade created.",
    `${trade.type} ${trade.quantity} @ ${formatCurrency(trade.price)} (${trade.orderType})`,
    `Fee: ${formatCurrency(trade.fee)} / Date: ${trade.tradedAt}`,
    pendingTrade.notes?.length ? `Notes: ${pendingTrade.notes.join(" / ")}` : null,
    "",
    "Post-fill preview",
    `Cash: ${formatCurrency(before.cashBalance)} -> ${formatCurrency(after.cashBalance)}`,
    `Qty: ${formatNumber(before.quantity, 0)} -> ${formatNumber(after.quantity, 0)}`,
    `Avg: ${formatCurrency(before.averagePrice)} -> ${formatCurrency(after.averagePrice)}`,
    `T: ${formatNumber(before.tValue, 2)} -> ${formatNumber(after.tValue, 2)}`,
    "",
    `Reply ${KO_ADD} to add this trade.`,
    `Reply ${KO_CANCEL} to reject it.`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function describeConfirmedTrade(trade) {
  return [
    "Trade added to Goldbit.",
    `${trade.type} ${trade.quantity} @ ${formatCurrency(trade.price)} (${trade.orderType})`,
    `Cash: ${formatCurrency(trade.cashBefore)} -> ${formatCurrency(trade.cashAfter)}`,
    `Qty: ${formatNumber(trade.quantityBefore, 0)} -> ${formatNumber(trade.quantityAfter, 0)}`,
    `Avg: ${formatCurrency(trade.averagePriceBefore)} -> ${formatCurrency(trade.averagePriceAfter)}`,
    `T: ${formatNumber(trade.tBefore, 2)} -> ${formatNumber(trade.tAfter, 2)}`,
  ].join("\n");
}

function getTEventLabel(input) {
  if (!input) return "No suggestion";
  return input.normalTEvent || input.reverseTEvent || "No suggestion";
}

function describeTEventSuggestion(body) {
  const suggestion = body.suggestion;
  if (!suggestion.input) {
    return [
      `T Update Suggestion (${body.date})`,
      "No supported T update suggestion.",
      `Reason: ${suggestion.reason}`,
      ...suggestion.detectedSummary.map((item) => `Detected: ${item}`),
    ].join("\n");
  }

  return [
    `T Update Suggestion (${body.date})`,
    `Event: ${getTEventLabel(suggestion.input)}`,
    `Mode: ${suggestion.input.mode}`,
    `Confidence: ${Math.round(suggestion.confidence * 100)}%`,
    `Reason: ${suggestion.reason}`,
    ...suggestion.detectedSummary.map((item) => `Detected: ${item}`),
    "",
    `Reply ${KO_T_ADD} to apply this T update.`,
  ].join("\n");
}

function describeAppliedTEvent(event) {
  return [
    "T update applied to Goldbit.",
    `Date: ${event.date}`,
    `Mode: ${event.mode}`,
    `Event: ${event.normalTEvent || event.reverseTEvent}`,
    `T: ${formatNumber(event.tBefore, 2)} -> ${formatNumber(event.tAfter, 2)}`,
  ].join("\n");
}

function normalizeCommand(text) {
  return text.trim().toLowerCase();
}

async function sendHelp(config, chatId) {
  await sendMessage(
    config,
    chatId,
    [
      "Goldbit Telegram bridge is connected.",
      `Chat ID: ${chatId}`,
      "",
      "Commands",
      "/today - show Today Action Plan",
      "/t - recommend Daily T update",
      `${KO_ADD} - add the latest pending trade`,
      `${KO_CANCEL} - reject the latest pending trade`,
      `${KO_T_ADD} - apply the latest recommended T update`,
      "",
      "Send a broker fill screenshot or OCR text to create a Pending Trade.",
    ].join("\n"),
  );
}

async function handleUpdate(config, update) {
  const chatId = getChatId(update);
  if (!chatId) return;

  const text = getMessageText(update).trim();
  const command = normalizeCommand(text);

  if (command.startsWith("/start") || command.startsWith("/help")) {
    await sendHelp(config, chatId);
    return;
  }

  if (command.startsWith("/ping")) {
    await sendMessage(config, chatId, "Goldbit Telegram bridge is alive.");
    return;
  }

  if (!isAllowed(config, chatId)) {
    await sendMessage(config, chatId, "This chat is not allowed for Goldbit.");
    return;
  }

  if (command.startsWith("/today") || text === KO_TODAY || text === KO_PLAN) {
    const plan = await fetchTodayPlan(config);
    await sendMessage(config, chatId, describeTodayPlan(plan));
    return;
  }

  if (command.startsWith("/t") || text === KO_T_RECOMMEND) {
    const suggestionBody = await fetchTEventSuggestion(config);
    if (suggestionBody.suggestion.input) {
      await updateSession(chatId, { tEventInput: suggestionBody.suggestion.input });
    }
    await sendMessage(config, chatId, describeTEventSuggestion(suggestionBody));
    return;
  }

  if (text.startsWith("/")) {
    await sendMessage(
      config,
      chatId,
      [
        "Unknown Goldbit command.",
        "Use /today for the action plan, /t for T recommendation, or /help.",
      ].join("\n"),
    );
    return;
  }

  if (text === KO_T_ADD || command === "t add" || command === "t confirm") {
    const session = await getSession(chatId);
    if (!session.tEventInput) {
      await sendMessage(config, chatId, "No T update suggestion is waiting.");
      return;
    }

    const event = await applyTEvent(config, session.tEventInput);
    await clearSessionKeys(chatId, ["tEventInput"]);
    await sendMessage(config, chatId, describeAppliedTEvent(event));
    return;
  }

  if ([KO_ADD, "add", "confirm"].includes(text) || ["add", "confirm"].includes(command)) {
    const session = await getSession(chatId);
    if (!session.pendingTradeId) {
      await sendMessage(config, chatId, "No pending Telegram trade is waiting.");
      return;
    }

    const trade = await confirmPendingTrade(config, session.pendingTradeId);
    await clearSessionKeys(chatId, ["pendingTradeId"]);
    await sendMessage(config, chatId, describeConfirmedTrade(trade));

    const suggestionBody = await fetchTEventSuggestion(config, trade.tradedAt);
    if (suggestionBody.suggestion.input) {
      await updateSession(chatId, { tEventInput: suggestionBody.suggestion.input });
    }
    await sendMessage(config, chatId, describeTEventSuggestion(suggestionBody));
    return;
  }

  if ([KO_CANCEL, "cancel", "reject"].includes(text) || ["cancel", "reject"].includes(command)) {
    const session = await getSession(chatId);
    if (!session.pendingTradeId) {
      await sendMessage(config, chatId, "No pending Telegram trade is waiting.");
      return;
    }

    await rejectPendingTrade(config, session.pendingTradeId);
    await clearSessionKeys(chatId, ["pendingTradeId"]);
    await sendMessage(config, chatId, "Pending trade rejected.");
    return;
  }

  const photo = getBestPhoto(update);
  let rawText = text;
  let filePath = null;

  if (photo) {
    await sendMessage(config, chatId, "Screenshot received. Running OCR...");
    filePath = await downloadTelegramFile(config, photo.file_id);
    rawText = await recognizeImageText(filePath);
  }

  if (!rawText) {
    await sendMessage(config, chatId, "No readable text was found.");
    return;
  }

  const pendingTrade = await createPendingTrade(config, rawText);
  await updateSession(chatId, { pendingTradeId: pendingTrade.id });
  const preview = await getPendingTradePreview(config, pendingTrade.id);
  await sendMessage(config, chatId, describePreview(preview));

  if (filePath) {
    await fs.unlink(filePath).catch(() => {});
  }
}

async function pollOnce(config, offset) {
  const updates = await telegram(config, "getUpdates", {
    offset,
    timeout: config.pollTimeout,
    allowed_updates: ["message", "edited_message"],
  });

  let nextOffset = offset;
  for (const update of updates) {
    nextOffset = update.update_id + 1;
    try {
      await handleUpdate(config, update);
    } catch (error) {
      const chatId = getChatId(update);
      console.error(error instanceof Error ? error.message : error);
      if (chatId) {
        await sendMessage(
          config,
          chatId,
          `Goldbit could not process this message: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        ).catch(() => {});
      }
    }
  }

  if (nextOffset !== offset) await writeOffset(nextOffset);
  return nextOffset;
}

async function main() {
  await loadEnv();
  const config = getConfig();

  if (process.argv.includes("--check")) {
    const me = await telegram(config, "getMe");
    console.log(`Connected to Telegram bot @${me.username || me.first_name}.`);
    return;
  }

  let offset = await readOffset();
  console.log("Goldbit Telegram bridge started.");
  console.log(`Goldbit API: ${config.appUrl}`);
  console.log(
    config.allowedChatIds.size > 0
      ? "Allowed chat filter is enabled."
      : "Allowed chat filter is empty. Use /start, then set TELEGRAM_ALLOWED_CHAT_IDS.",
  );

  while (true) {
    offset = await pollOnce(config, offset);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
