import type {
  DailyPlan,
  DailyPlanSnapshot,
  DailyTEventInput,
  DailyTEventSuggestion,
  Division,
  GoldbitOrderType,
  NormalTEvent,
  PlannedOrder,
  StrategyConfig,
  Trade,
  TradeInput
} from "./mechanism-types.js";

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

export const applyNormalTChange = (currentT: number, eventType: NormalTEvent): number => {
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
};

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

export const applyTradeToStrategy = (strategyConfig: StrategyConfig, trade: TradeInput | Trade): StrategyConfig => {
  if (
    !trade.type ||
    typeof trade.price !== "number" ||
    typeof trade.quantity !== "number" ||
    typeof trade.fee !== "number"
  ) {
    return strategyConfig;
  }

  const amount = round(trade.price * trade.quantity);
  const isBuy = trade.type === "BUY";
  const cashAfter = isBuy
    ? strategyConfig.cashBalance - amount - trade.fee
    : strategyConfig.cashBalance + amount - trade.fee;
  const quantityAfter = isBuy ? strategyConfig.quantity + trade.quantity : strategyConfig.quantity - trade.quantity;
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
    updatedAt: new Date().toISOString()
  };
};

export const applyDailyTEventToStrategy = (
  strategyConfig: StrategyConfig,
  event: DailyTEventInput
): StrategyConfig => {
  let tValue = strategyConfig.tValue;

  if (event.mode === "NORMAL" && event.normalTEvent) {
    tValue = applyNormalTChange(strategyConfig.tValue, event.normalTEvent);
  }

  if (event.mode === "REVERSE" && event.reverseTEvent) {
    tValue =
      event.reverseTEvent === "SELL"
        ? strategyConfig.tValue * (strategyConfig.division === 20 ? 0.9 : 0.95)
        : strategyConfig.tValue + (strategyConfig.division - strategyConfig.tValue) * 0.25;
  }

  return {
    ...strategyConfig,
    tValue,
    mode: shouldEnterReverseMode(tValue, strategyConfig.division) ? "REVERSE" : strategyConfig.mode,
    updatedAt: new Date().toISOString()
  };
};

const getTradeAmount = (trade: Trade): number => {
  return round((trade.price ?? 0) * (trade.quantity ?? 0));
};

const getPlanBuyAmount = (plan: DailyPlan): number => {
  return plan.buyOrders.reduce((sum, order) => sum + (order.amount ?? 0), 0);
};

export const suggestDailyTEvent = (
  strategyConfig: StrategyConfig,
  planSnapshot: DailyPlanSnapshot | null | undefined,
  trades: Trade[],
  date: string
): DailyTEventSuggestion => {
  const dayTrades = trades.filter((trade) => trade.tradedAt === date);
  const detectedSummary = dayTrades.map(
    (trade) => `${trade.type} ${trade.orderType} ${trade.quantity} @ ${round(trade.price ?? 0, 4)}`
  );

  if (!planSnapshot) {
    return { input: null, confidence: 0, reason: "No saved action plan snapshot for this date.", detectedSummary };
  }

  if (dayTrades.length === 0) {
    return { input: null, confidence: 0, reason: "No confirmed trades for this date.", detectedSummary };
  }

  if (planSnapshot.plan.mode === "REVERSE") {
    const hasBuy = dayTrades.some((trade) => trade.type === "BUY");
    const hasSell = dayTrades.some((trade) => trade.type === "SELL");

    if (hasBuy) {
      return {
        input: { date, mode: "REVERSE", reverseTEvent: "BUY", memo: "Suggested from Toss filled orders." },
        confidence: 0.85,
        reason: "Reverse-mode buy trade was detected.",
        detectedSummary
      };
    }

    if (hasSell) {
      return {
        input: { date, mode: "REVERSE", reverseTEvent: "SELL", memo: "Suggested from Toss filled orders." },
        confidence: 0.85,
        reason: "Reverse-mode sell trade was detected.",
        detectedSummary
      };
    }
  }

  const buyTrades = dayTrades.filter((trade) => trade.type === "BUY");
  const sellTrades = dayTrades.filter((trade) => trade.type === "SELL");
  const totalBuyAmount = buyTrades.reduce((sum, trade) => sum + getTradeAmount(trade), 0);
  const planBuyAmount = getPlanBuyAmount(planSnapshot.plan);
  const buyFillRatio = planBuyAmount > 0 ? totalBuyAmount / planBuyAmount : 0;
  const hasLimitSell = sellTrades.some((trade) => trade.orderType === "LIMIT");
  const hasLocSell = sellTrades.some((trade) => trade.orderType === "LOC");

  if (hasLimitSell && buyTrades.length > 0) {
    return {
      input: {
        date,
        mode: "NORMAL",
        normalTEvent: buyFillRatio >= 0.7 ? "LIMIT_SELL_AND_FULL_LOC_BUY" : "LIMIT_SELL_AND_HALF_LOC_BUY",
        memo: "Suggested from Toss filled orders."
      },
      confidence: buyFillRatio >= 0.3 ? 0.85 : 0.65,
      reason: `LIMIT sell and LOC buy were detected. Buy fill ratio: ${round(buyFillRatio * 100, 0)}%.`,
      detectedSummary
    };
  }

  if (hasLocSell && buyTrades.length === 0) {
    return {
      input: { date, mode: "NORMAL", normalTEvent: "QUARTER_SELL", memo: "Suggested from Toss filled orders." },
      confidence: 0.8,
      reason: "LOC sell was detected without same-day buy fills.",
      detectedSummary
    };
  }

  if (buyTrades.length > 0) {
    const normalTEvent: NormalTEvent = buyFillRatio >= 0.7 ? "FULL_BUY" : "HALF_BUY";

    return {
      input: { date, mode: "NORMAL", normalTEvent, memo: "Suggested from Toss filled orders." },
      confidence: buyFillRatio >= 0.3 ? 0.9 : 0.55,
      reason: `Confirmed buy amount ${round(totalBuyAmount)} vs planned buy amount ${round(planBuyAmount)} (${round(
        buyFillRatio * 100,
        0
      )}%).`,
      detectedSummary
    };
  }

  return {
    input: null,
    confidence: 0,
    reason: "Confirmed trades did not match a supported T update pattern.",
    detectedSummary
  };
};

export const toGoldbitOrderType = (orderType: string | undefined): GoldbitOrderType | null => {
  return orderType === "LOC" || orderType === "MOC" || orderType === "LIMIT" ? orderType : null;
};
