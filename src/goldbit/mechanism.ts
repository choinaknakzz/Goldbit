import type { DailyPlan, Division, PlannedOrder, StrategyConfig } from "./mechanism-types.js";

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));
const FIRST_BUY_LOC_BUFFER = 0.12;

const getKstDate = (date = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
};

const getBuyQuantity = (amount: number, price: number | null | undefined): number | null => {
  if (!price || price <= 0) return null;
  return Math.floor(amount / price);
};

const getPlannedAmount = (price: number | null | undefined, quantity: number | null): number | null => {
  if (!price || !quantity) return null;
  return round(price * quantity);
};

const getFirstHalfBuyQuantities = (dailyBuyAmount: number, starBuyPrice: number, averagePrice: number) => {
  let starQuantity = getBuyQuantity(round(dailyBuyAmount / 2), starBuyPrice) ?? 0;
  let averageQuantity = getBuyQuantity(round(dailyBuyAmount / 2), averagePrice) ?? 0;

  if ((starQuantity === 0 || averageQuantity === 0) && starBuyPrice + averagePrice <= dailyBuyAmount) {
    starQuantity = Math.max(starQuantity, 1);
    averageQuantity = Math.max(averageQuantity, 1);
  }

  return { starQuantity, averageQuantity };
};

export const getSoxlStarRate = (tValue: number, division: Division): number => {
  return division === 20 ? (20 - 2 * tValue) / 100 : (20 - tValue) / 100;
};

export const getStarPrice = (averagePrice: number, tValue: number, division: Division): number => {
  return round(averagePrice * (1 + getSoxlStarRate(tValue, division)));
};

export const getBuyPrice = (starPrice: number): number => round(starPrice - 0.01);
export const getFirstBuyLocPrice = (previousClose: number): number => round(previousClose * (1 + FIRST_BUY_LOC_BUFFER));
export const getSoxlLimitSellPrice = (averagePrice: number): number => round(averagePrice * 1.2);

export const getDailyBuyAmount = (cashBalance: number, tValue: number, division: Division): number => {
  const remainingTurns = division - tValue;
  if (remainingTurns <= 0) return 0;
  return round(cashBalance / remainingTurns);
};

const getNormalPhase = (
  tValue: number,
  quantity: number,
  division: Division
): "FIRST_BUY" | "FIRST_HALF" | "SECOND_HALF" => {
  if (tValue === 0 && quantity === 0) return "FIRST_BUY";
  return tValue < division / 2 ? "FIRST_HALF" : "SECOND_HALF";
};

const shouldEnterReverseMode = (tValue: number, division: Division): boolean => {
  return division === 20 ? tValue > 19 : tValue > 39;
};

const warningForReverse = (tValue: number, division: Division): string[] => {
  const threshold = division - 1;
  if (shouldEnterReverseMode(tValue, division)) {
    return ["Reverse Mode Alert: remaining buy turns are below one full turn."];
  }
  if (tValue >= threshold - 1) {
    return ["Reverse Mode Alert: T value is near exhaustion."];
  }
  return [];
};

const getQuarterSellQuantity = (quantity: number): number => Math.floor(quantity / 4);

export const generateNormalDailyPlan = (strategyConfig: StrategyConfig, previousClose?: number): DailyPlan => {
  const phase = getNormalPhase(strategyConfig.tValue, strategyConfig.quantity, strategyConfig.division);
  const starPrice =
    strategyConfig.averagePrice > 0
      ? getStarPrice(strategyConfig.averagePrice, strategyConfig.tValue, strategyConfig.division)
      : undefined;
  const dailyBuyAmount = getDailyBuyAmount(strategyConfig.cashBalance, strategyConfig.tValue, strategyConfig.division);
  const buyOrders: PlannedOrder[] = [];
  const sellOrders: PlannedOrder[] = [];

  if (phase === "FIRST_BUY") {
    const firstBuyPrice = previousClose ? getFirstBuyLocPrice(previousClose) : null;
    const firstBuyQuantity = previousClose ? getBuyQuantity(dailyBuyAmount, previousClose) : null;
    buyOrders.push({
      side: "BUY",
      orderType: "LOC",
      price: firstBuyPrice,
      quantity: firstBuyQuantity,
      amount: getPlannedAmount(previousClose, firstBuyQuantity),
      reason: previousClose
        ? "First buy LOC limit is 12% above previous close; quantity uses previous close budget sizing."
        : "First buy: enter previous close to calculate LOC price.",
      priority: 1
    });
  } else if (phase === "FIRST_HALF" && starPrice) {
    const starBuyPrice = getBuyPrice(starPrice);
    const { starQuantity, averageQuantity } = getFirstHalfBuyQuantities(
      dailyBuyAmount,
      starBuyPrice,
      strategyConfig.averagePrice
    );
    buyOrders.push(
      {
        side: "BUY",
        orderType: "LOC",
        price: starBuyPrice,
        quantity: starQuantity,
        amount: getPlannedAmount(starBuyPrice, starQuantity),
        reason: "Half of one-turn budget at the star buy point.",
        priority: 1
      },
      {
        side: "BUY",
        orderType: "LOC",
        price: strategyConfig.averagePrice,
        quantity: averageQuantity,
        amount: getPlannedAmount(strategyConfig.averagePrice, averageQuantity),
        reason: "Half of one-turn budget at average price.",
        priority: 2
      }
    );
  } else if (starPrice) {
    const starBuyPrice = getBuyPrice(starPrice);
    const starQuantity = getBuyQuantity(dailyBuyAmount, starBuyPrice);
    buyOrders.push({
      side: "BUY",
      orderType: "LOC",
      price: starBuyPrice,
      quantity: starQuantity,
      amount: getPlannedAmount(starBuyPrice, starQuantity),
      reason: "Full one-turn budget at the star buy point.",
      priority: 1
    });
  }

  if (strategyConfig.quantity > 0 && starPrice) {
    const quarterSellQuantity = getQuarterSellQuantity(strategyConfig.quantity);
    const limitSellQuantity = strategyConfig.quantity - quarterSellQuantity;

    if (quarterSellQuantity > 0) {
      sellOrders.push({
        side: "SELL",
        orderType: "LOC",
        price: starPrice,
        quantity: quarterSellQuantity,
        amount: null,
        reason: "Quarter sell at star price.",
        priority: 1
      });
    }

    if (limitSellQuantity > 0) {
      sellOrders.push({
        side: "SELL",
        orderType: "LIMIT",
        price: getSoxlLimitSellPrice(strategyConfig.averagePrice),
        quantity: limitSellQuantity,
        amount: null,
        reason: "SOXL 20% target limit sell.",
        priority: 2
      });
    }
  }

  return {
    date: getKstDate(),
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
    limitSellPrice: strategyConfig.averagePrice > 0 ? getSoxlLimitSellPrice(strategyConfig.averagePrice) : undefined,
    buyOrders,
    sellOrders,
    warnings: warningForReverse(strategyConfig.tValue, strategyConfig.division)
  };
};

const hasValidReverseCloses = (lastFiveCloses: number[]): boolean => {
  return lastFiveCloses.length === 5 && lastFiveCloses.every((close) => Number.isFinite(close) && close > 0);
};

const getReverseStarPrice = (lastFiveCloses: number[]): number => {
  const validCloses = lastFiveCloses.filter((close) => Number.isFinite(close) && close > 0);
  if (validCloses.length !== 5) {
    throw new Error("Reverse star price requires exactly five positive closes.");
  }
  return round(validCloses.reduce((sum, close) => sum + close, 0) / validCloses.length);
};

const getReverseFirstSellQuantity = (quantity: number, division: Division): number => {
  return Math.floor(quantity / (division === 20 ? 10 : 20));
};

const getReverseBuyAmount = (cashBalance: number): number => round(cashBalance / 4);

export const generateReverseDailyPlan = (
  strategyConfig: StrategyConfig,
  lastFiveCloses: number[],
  isFirstReverseDay: boolean
): DailyPlan => {
  const hasReverseStarPrice = hasValidReverseCloses(lastFiveCloses);
  const reverseStarPrice = hasReverseStarPrice ? getReverseStarPrice(lastFiveCloses) : undefined;
  const sellQuantity = getReverseFirstSellQuantity(strategyConfig.quantity, strategyConfig.division);
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
      priority: 1
    }
  ];
  const buyOrders: PlannedOrder[] =
    isFirstReverseDay || !reverseStarPrice
      ? []
      : [
          {
            side: "BUY",
            orderType: "LOC",
            price: round(reverseStarPrice - 0.01),
            quantity: getBuyQuantity(getReverseBuyAmount(strategyConfig.cashBalance), round(reverseStarPrice - 0.01)),
            amount: getReverseBuyAmount(strategyConfig.cashBalance),
            reason: "Quarter buy below reverse star price.",
            priority: 1
          }
        ];
  const starPrice = isFirstReverseDay ? undefined : reverseStarPrice;

  return {
    date: getKstDate(),
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
        : ["Enter five valid recent closes before using reverse active orders."])
    ]
  };
};
