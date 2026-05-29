import type {
  DailyPlan,
  DailyTEventInput,
  Division,
  NormalTEvent,
  PlannedOrder,
  StrategyConfig,
  Trade,
  TradeInput,
} from "./types";

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const today = () => new Date().toISOString().slice(0, 10);
const FIRST_BUY_LOC_BUFFER = 0.12;

function getBuyQuantity(amount: number, price: number | null | undefined) {
  if (!price || price <= 0) return null;
  return Math.floor(amount / price);
}

export function getSoxlStarRate(tValue: number, division: Division): number {
  return division === 20 ? (20 - 2 * tValue) / 100 : (20 - tValue) / 100;
}

export function getStarPrice(
  averagePrice: number,
  tValue: number,
  division: Division,
): number {
  return round(averagePrice * (1 + getSoxlStarRate(tValue, division)));
}

export function getBuyPrice(starPrice: number): number {
  return round(starPrice - 0.01);
}

export function getFirstBuyLocPrice(previousClose: number): number {
  return round(previousClose * (1 + FIRST_BUY_LOC_BUFFER));
}

export function getSoxlLimitSellPrice(averagePrice: number): number {
  return round(averagePrice * 1.2);
}

export function getDailyBuyAmount(
  cashBalance: number,
  tValue: number,
  division: Division,
): number {
  const remainingTurns = division - tValue;
  if (remainingTurns <= 0) return 0;
  return round(cashBalance / remainingTurns);
}

export function getNormalPhase(
  tValue: number,
  quantity: number,
  division: Division,
): "FIRST_BUY" | "FIRST_HALF" | "SECOND_HALF" {
  if (tValue === 0 && quantity === 0) return "FIRST_BUY";
  return tValue < division / 2 ? "FIRST_HALF" : "SECOND_HALF";
}

export function shouldEnterReverseMode(
  tValue: number,
  division: Division,
): boolean {
  return division === 20 ? tValue > 19 : tValue > 39;
}

export function getQuarterSellQuantity(quantity: number): number {
  return Math.floor(quantity / 4);
}

export function applyNormalTChange(
  currentT: number,
  eventType: NormalTEvent,
): number {
  switch (eventType) {
    case "FULL_BUY":
      return currentT + 1;
    case "HALF_BUY":
      return currentT + 0.5;
    case "QUARTER_SELL":
      return currentT * 0.75;
    case "LIMIT_SELL_AND_FULL_LOC_BUY":
      return currentT * 0.25 + 1;
    case "LIMIT_SELL_AND_HALF_LOC_BUY":
      return currentT * 0.25 + 0.5;
  }
}

export function getReverseFirstSellQuantity(
  quantity: number,
  division: Division,
): number {
  return Math.floor(quantity / (division === 20 ? 10 : 20));
}

export function getReverseStarPrice(lastFiveCloses: number[]): number {
  const validCloses = lastFiveCloses.filter(
    (close) => Number.isFinite(close) && close > 0,
  );

  if (validCloses.length !== 5) {
    throw new Error("Reverse star price requires exactly five positive closes.");
  }

  return round(
    validCloses.reduce((sum, close) => sum + close, 0) / validCloses.length,
  );
}

function hasValidReverseCloses(lastFiveCloses: number[]) {
  return (
    lastFiveCloses.length === 5 &&
    lastFiveCloses.every((close) => Number.isFinite(close) && close > 0)
  );
}

export function getReverseBuyAmount(cashBalance: number): number {
  return round(cashBalance / 4);
}

export function applyReverseSellT(currentT: number, division: Division): number {
  return currentT * (division === 20 ? 0.9 : 0.95);
}

export function applyReverseBuyT(currentT: number, division: Division): number {
  return currentT + (division - currentT) * 0.25;
}

export function shouldExitReverseMode(
  closePrice: number,
  averagePrice: number,
): boolean {
  return closePrice > averagePrice * 0.8;
}

function warningForReverse(tValue: number, division: Division): string[] {
  const threshold = division - 1;
  if (shouldEnterReverseMode(tValue, division)) {
    return ["Reverse Mode Alert: remaining buy turns are below one full turn."];
  }
  if (tValue >= threshold - 1) {
    return ["Reverse Mode Alert: T value is near exhaustion."];
  }
  return [];
}

export function generateNormalDailyPlan(
  strategyConfig: StrategyConfig,
  previousClose?: number,
): DailyPlan {
  const phase = getNormalPhase(
    strategyConfig.tValue,
    strategyConfig.quantity,
    strategyConfig.division,
  );
  const starPrice =
    strategyConfig.averagePrice > 0
      ? getStarPrice(
          strategyConfig.averagePrice,
          strategyConfig.tValue,
          strategyConfig.division,
        )
      : undefined;
  const dailyBuyAmount = getDailyBuyAmount(
    strategyConfig.cashBalance,
    strategyConfig.tValue,
    strategyConfig.division,
  );
  const buyOrders: PlannedOrder[] = [];
  const sellOrders: PlannedOrder[] = [];

  if (phase === "FIRST_BUY") {
    const firstBuyPrice = previousClose
      ? getFirstBuyLocPrice(previousClose)
      : null;
    buyOrders.push({
      side: "BUY",
      orderType: "LOC",
      price: firstBuyPrice,
      quantity: getBuyQuantity(dailyBuyAmount, firstBuyPrice),
      amount: dailyBuyAmount,
      reason: previousClose
        ? "First buy LOC plan at 12% above previous close."
        : "First buy: enter previous close to calculate LOC price.",
      priority: 1,
    });
  } else if (phase === "FIRST_HALF" && starPrice) {
    buyOrders.push(
      {
        side: "BUY",
        orderType: "LOC",
        price: getBuyPrice(starPrice),
        quantity: getBuyQuantity(round(dailyBuyAmount / 2), getBuyPrice(starPrice)),
        amount: round(dailyBuyAmount / 2),
        reason: "Half of one-turn budget at the star buy point.",
        priority: 1,
      },
      {
        side: "BUY",
        orderType: "LOC",
        price: strategyConfig.averagePrice,
        quantity: getBuyQuantity(round(dailyBuyAmount / 2), strategyConfig.averagePrice),
        amount: round(dailyBuyAmount / 2),
        reason: "Half of one-turn budget at average price.",
        priority: 2,
      },
    );
  } else if (starPrice) {
    buyOrders.push({
      side: "BUY",
      orderType: "LOC",
      price: getBuyPrice(starPrice),
      quantity: getBuyQuantity(dailyBuyAmount, getBuyPrice(starPrice)),
      amount: dailyBuyAmount,
      reason: "Full one-turn budget at the star buy point.",
      priority: 1,
    });
  }

  if (strategyConfig.quantity > 0 && starPrice) {
    sellOrders.push(
      {
        side: "SELL",
        orderType: "LOC",
        price: starPrice,
        quantity: getQuarterSellQuantity(strategyConfig.quantity),
        amount: null,
        reason: "Quarter sell at star price.",
        priority: 1,
      },
      {
        side: "SELL",
        orderType: "LIMIT",
        price: getSoxlLimitSellPrice(strategyConfig.averagePrice),
        quantity:
          strategyConfig.quantity -
          getQuarterSellQuantity(strategyConfig.quantity),
        amount: null,
        reason: "SOXL 20% target limit sell.",
        priority: 2,
      },
    );
  }

  return {
    date: today(),
    symbol: "SOXL",
    mode: "NORMAL",
    phase,
    tValue: strategyConfig.tValue,
    averagePrice: strategyConfig.averagePrice,
    cashBalance: strategyConfig.cashBalance,
    quantity: strategyConfig.quantity,
    starRate: getSoxlStarRate(strategyConfig.tValue, strategyConfig.division),
    previousClose,
    starPrice,
    buyPrice: starPrice ? getBuyPrice(starPrice) : undefined,
    sellPrice: starPrice,
    limitSellPrice:
      strategyConfig.averagePrice > 0
        ? getSoxlLimitSellPrice(strategyConfig.averagePrice)
        : undefined,
    buyOrders,
    sellOrders,
    warnings: warningForReverse(strategyConfig.tValue, strategyConfig.division),
  };
}

export function generateReverseDailyPlan(
  strategyConfig: StrategyConfig,
  lastFiveCloses: number[],
  isFirstReverseDay: boolean,
): DailyPlan {
  const hasReverseStarPrice = hasValidReverseCloses(lastFiveCloses);
  const reverseStarPrice = hasReverseStarPrice
    ? getReverseStarPrice(lastFiveCloses)
    : undefined;
  const sellQuantity = getReverseFirstSellQuantity(
    strategyConfig.quantity,
    strategyConfig.division,
  );
  const sellOrders: PlannedOrder[] = [
    {
      side: "SELL",
      orderType: isFirstReverseDay ? "MOC" : "LOC",
      price: isFirstReverseDay ? null : reverseStarPrice ?? null,
      quantity: sellQuantity,
      amount: null,
      reason: isFirstReverseDay
        ? "Reverse first day MOC sell only."
        : hasReverseStarPrice
          ? "Reverse LOC sell above the five-close star price."
          : "Enter five valid closes to calculate reverse LOC sell price.",
      priority: 1,
    },
  ];
  const buyOrders: PlannedOrder[] = isFirstReverseDay || !reverseStarPrice
    ? []
    : [
        {
          side: "BUY",
          orderType: "LOC",
          price: round(reverseStarPrice - 0.01),
          quantity: getBuyQuantity(
            getReverseBuyAmount(strategyConfig.cashBalance),
            round(reverseStarPrice - 0.01),
          ),
          amount: getReverseBuyAmount(strategyConfig.cashBalance),
          reason: "Quarter buy below reverse star price.",
          priority: 1,
        },
      ];
  const starPrice = isFirstReverseDay
    ? undefined
    : reverseStarPrice;

  return {
    date: today(),
    symbol: "SOXL",
    mode: "REVERSE",
    phase: isFirstReverseDay ? "REVERSE_FIRST_DAY" : "REVERSE_ACTIVE",
    tValue: strategyConfig.tValue,
    averagePrice: strategyConfig.averagePrice,
    cashBalance: strategyConfig.cashBalance,
    quantity: strategyConfig.quantity,
    starPrice,
    buyPrice: starPrice ? getBuyPrice(starPrice) : undefined,
    sellPrice: starPrice,
    buyOrders,
    sellOrders,
    warnings: [
      "Reverse Mode Alert: no automated order will be placed.",
      ...(isFirstReverseDay || hasReverseStarPrice
        ? []
        : ["Enter five valid recent closes before using reverse active orders."]),
    ],
  };
}

export function applyTradeToStrategy(
  strategyConfig: StrategyConfig,
  trade: TradeInput | Trade,
): StrategyConfig {
  const amount = round(trade.price * trade.quantity);
  const isBuy = trade.type === "BUY";
  const cashAfter = isBuy
    ? strategyConfig.cashBalance - amount - trade.fee
    : strategyConfig.cashBalance + amount - trade.fee;
  const quantityAfter = isBuy
    ? strategyConfig.quantity + trade.quantity
    : strategyConfig.quantity - trade.quantity;
  const costBefore = strategyConfig.averagePrice * strategyConfig.quantity;
  const averagePriceAfter = isBuy
    ? round((costBefore + amount + trade.fee) / quantityAfter)
    : quantityAfter > 0
      ? strategyConfig.averagePrice
      : 0;
  return {
    ...strategyConfig,
    cashBalance: round(cashAfter),
    quantity: quantityAfter,
    averagePrice: averagePriceAfter,
    updatedAt: new Date().toISOString(),
  };
}

export function applyDailyTEventToStrategy(
  strategyConfig: StrategyConfig,
  event: DailyTEventInput,
): StrategyConfig {
  let tValue = strategyConfig.tValue;

  if (event.mode === "NORMAL" && event.normalTEvent) {
    tValue = applyNormalTChange(strategyConfig.tValue, event.normalTEvent);
  }

  if (event.mode === "REVERSE" && event.reverseTEvent) {
    tValue =
      event.reverseTEvent === "SELL"
        ? applyReverseSellT(strategyConfig.tValue, strategyConfig.division)
        : applyReverseBuyT(strategyConfig.tValue, strategyConfig.division);
  }

  return {
    ...strategyConfig,
    tValue,
    mode: shouldEnterReverseMode(tValue, strategyConfig.division)
      ? "REVERSE"
      : strategyConfig.mode,
    updatedAt: new Date().toISOString(),
  };
}
