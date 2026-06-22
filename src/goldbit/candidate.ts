import { assertTargetSymbol, config } from "../config.js";
import { getAvailableCash, getRecentExecutions } from "../toss/account.js";
import { getPosition } from "../toss/portfolio.js";
import { getCurrentPrice } from "../toss/price.js";
import { parseTossError } from "../toss/client.js";
import type { AvailableCash, CurrentPrice, Execution, Position, StrategyInput } from "../types/index.js";
import { saveCandidate } from "../storage/candidates.js";
import { writeLog } from "../storage/logs.js";
import { sendCandidateMessage } from "../telegram/message.js";
import { createGoldbitCandidate } from "./strategy.js";

const optionalTossCall = async <T>(label: string, call: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await call();
  } catch (error) {
    await writeLog("WARN", `${label} unavailable; continuing with placeholder strategy input`, {
      error: parseTossError(error)
    });
    return undefined;
  }
};

export const buildStrategyInput = async (symbol = config.targetSymbol): Promise<StrategyInput> => {
  assertTargetSymbol(symbol);

  const availableCash = await optionalTossCall<AvailableCash>("getAvailableCash", () => getAvailableCash());
  const position = await optionalTossCall<Position>("getPosition", () => getPosition(symbol));
  const currentPrice = await optionalTossCall<CurrentPrice>("getCurrentPrice", () => getCurrentPrice(symbol));
  const recentExecutions = await optionalTossCall<Execution[]>("getRecentExecutions", () =>
    getRecentExecutions(symbol)
  );

  return {
    symbol,
    currentPrice,
    holdingQuantity: position?.quantity,
    averagePrice: position?.averagePrice,
    availableCash,
    recentExecutions
  };
};

export const createAndSendCandidate = async (symbol = config.targetSymbol): Promise<string> => {
  const input = await buildStrategyInput(symbol);
  const candidate = createGoldbitCandidate(input);
  const savedCandidate = await saveCandidate(candidate);

  await writeLog("INFO", "candidate created", {
    candidateId: savedCandidate.id,
    symbol: savedCandidate.symbol
  });

  await sendCandidateMessage(savedCandidate);

  return savedCandidate.id;
};
