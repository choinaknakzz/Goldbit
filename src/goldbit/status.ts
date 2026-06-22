import { config } from "../config.js";
import { getAvailableCash, getRecentExecutions } from "../toss/account.js";
import { getPosition } from "../toss/portfolio.js";
import { getCurrentPrice } from "../toss/price.js";
import type { AvailableCash, CurrentPrice, Execution, Position } from "../types/index.js";
import { sendTextMessage } from "../telegram/message.js";
import { writeLog } from "../storage/logs.js";

export interface SoxlStatus {
  symbol: string;
  currentPrice: CurrentPrice;
  position: Position;
  availableCash: AvailableCash;
  recentExecutions: Execution[];
  createdAt: Date;
}

const money = (value: number, currency = "USD"): string => {
  const prefix = currency === "USD" ? "$" : `${currency} `;
  return `${prefix}${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const quantity = (value: number): string => {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  });
};

const formatExecutionLine = (execution: Execution): string => {
  const price = execution.price ? money(execution.price) : "N/A";
  return `- ${execution.side} ${quantity(execution.quantity)}주 @ ${price} (${execution.executedAt})`;
};

export const getSoxlStatus = async (symbol = config.targetSymbol): Promise<SoxlStatus> => {
  const availableCash = await getAvailableCash();
  const position = await getPosition(symbol);
  const currentPrice = await getCurrentPrice(symbol);
  const recentExecutions = await getRecentExecutions(symbol);

  return {
    symbol,
    currentPrice,
    position,
    availableCash,
    recentExecutions,
    createdAt: new Date()
  };
};

export const renderSoxlStatusMessage = (status: SoxlStatus): string => {
  const evaluatedAmount = status.position.quantity * status.currentPrice.price;
  const profitLoss = evaluatedAmount - status.position.quantity * status.position.averagePrice;
  const profitLossRate =
    status.position.averagePrice > 0
      ? ((status.currentPrice.price - status.position.averagePrice) / status.position.averagePrice) * 100
      : 0;
  const latestTradingDate = status.recentExecutions[0]?.tradingDate;
  const executionHeading = latestTradingDate
    ? `최근 미국 거래일 주문/체결 (${latestTradingDate}):`
    : "최근 미국 거래일 주문/체결:";
  const executionLines =
    status.recentExecutions.length > 0
      ? status.recentExecutions.map(formatExecutionLine)
      : ["- 최근 10일 내 주문/체결 내역 없음"];

  return [
    "[Goldbit SOXL 현재 정보]",
    "",
    `종목: ${status.symbol}`,
    `조회시각: ${status.createdAt.toLocaleString("ko-KR", { timeZone: config.timezone })}`,
    "",
    `현재가: ${money(status.currentPrice.price, status.currentPrice.currency)}`,
    `가격시각: ${status.currentPrice.asOf}`,
    "",
    `보유수량: ${quantity(status.position.quantity)}주`,
    `평균단가: ${money(status.position.averagePrice)}`,
    `평가금액: ${money(evaluatedAmount)}`,
    `평가손익: ${money(profitLoss)} (${profitLossRate.toFixed(2)}%)`,
    "",
    `USD 매수가능금액: ${money(status.availableCash.amount, status.availableCash.currency)}`,
    "",
    executionHeading,
    ...executionLines
  ].join("\n");
};

export const sendSoxlStatus = async (chatId?: string): Promise<void> => {
  const status = await getSoxlStatus(config.targetSymbol);
  await sendTextMessage(renderSoxlStatusMessage(status), chatId);
  await writeLog("INFO", "SOXL status message sent", {
    symbol: status.symbol,
    chatId: chatId ?? config.telegram.chatId,
    executionCount: status.recentExecutions.length,
    tradingDate: status.recentExecutions[0]?.tradingDate
  });
};
