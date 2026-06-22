import { config } from "../config.js";
import type { CandidateDraft, StrategyInput } from "../types/index.js";

const formatKstDate = (date: Date): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}${month}${day}`;
};

const addMinutes = (date: Date, minutes: number): Date => {
  return new Date(date.getTime() + minutes * 60_000);
};

export const createGoldbitCandidate = (input: StrategyInput, now = new Date()): CandidateDraft => {
  const symbol = input.symbol;
  const currentPrice = input.currentPrice?.price;
  const quantity = 1.2;
  const estimatedAmount = currentPrice ? Number((quantity * currentPrice).toFixed(2)) : undefined;

  return {
    id: `${formatKstDate(now)}-${symbol}-BUY`,
    symbol,
    side: "BUY",
    orderType: "LOC",
    quantity,
    estimatedPrice: currentPrice,
    estimatedAmount,
    status: "PENDING",
    createdAt: now,
    expiresAt: addMinutes(now, config.approvalExpireMinutes),
    rawData: {
      strategy: "Goldbit V4 placeholder",
      symbol,
      currentPrice: input.currentPrice ?? null,
      holdingQuantity: input.holdingQuantity ?? null,
      averagePrice: input.averagePrice ?? null,
      availableCash: input.availableCash ?? null,
      recentExecutions: input.recentExecutions ?? [],
      todo: "Replace placeholder calculation with the existing Goldbit V4 formula."
    }
  };
};
