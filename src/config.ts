import "dotenv/config";

const numberFromEnv = (name: string, fallback: number): number => {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number.`);
  }

  return parsed;
};

const listFromEnv = (name: string): string[] => {
  return (process.env[name] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const telegramAllowedChatIds = listFromEnv("TELEGRAM_ALLOWED_CHAT_IDS");
const telegramChatId = process.env.TELEGRAM_CHAT_ID ?? telegramAllowedChatIds[0] ?? "";

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  timezone: process.env.APP_TIMEZONE ?? "Asia/Seoul",
  targetSymbol: process.env.TARGET_SYMBOL ?? "SOXL",
  approvalExpireMinutes: numberFromEnv("ORDER_APPROVAL_EXPIRE_MINUTES", 60),
  toss: {
    apiBaseUrl: process.env.TOSS_API_BASE_URL ?? "",
    appKey: process.env.TOSS_APP_KEY ?? "",
    appSecret: process.env.TOSS_APP_SECRET ?? "",
    accessToken: process.env.TOSS_ACCESS_TOKEN ?? "",
    refreshToken: process.env.TOSS_REFRESH_TOKEN ?? "",
    accountId: process.env.TOSS_ACCOUNT_ID ?? ""
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
    chatId: telegramChatId,
    allowedChatIds: telegramAllowedChatIds
  }
} as const;

export const assertTargetSymbol = (symbol: string): void => {
  if (symbol !== config.targetSymbol || symbol !== "SOXL") {
    throw new Error(`Only SOXL is supported in v1. Received: ${symbol}`);
  }
};
