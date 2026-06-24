import type { CycleArchive, CycleDailySnapshot, GoldbitLocalState, Trade } from "./mechanism-types.js";

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

const getRealizedPnl = (trades: Trade[]): number => {
  return round(
    trades.reduce((sum, trade) => {
      if (trade.type !== "SELL") return sum;
      return sum + ((trade.price ?? 0) - (trade.averagePriceBefore ?? 0)) * (trade.quantity ?? 0) - (trade.fee ?? 0);
    }, 0)
  );
};

const getCycleDateRange = (state: GoldbitLocalState): { tradeStartDate: string; tradeEndDate: string } => {
  const tradeDates = state.trades.map((trade) => trade.tradedAt).sort();
  const fallbackDates = [
    ...tradeDates,
    ...state.tEvents.map((event) => event.date),
    ...state.closeRecords.map((record) => record.date),
    state.strategy.createdAt.slice(0, 10)
  ].sort();

  return {
    tradeStartDate: tradeDates[0] ?? fallbackDates[0],
    tradeEndDate: tradeDates[tradeDates.length - 1] ?? fallbackDates[fallbackDates.length - 1]
  };
};

const buildDailySnapshots = (state: GoldbitLocalState): CycleDailySnapshot[] => {
  const dates = new Set<string>();
  state.trades.forEach((trade) => dates.add(trade.tradedAt));
  state.tEvents.forEach((event) => dates.add(event.date));
  state.closeRecords.forEach((record) => dates.add(record.date));

  const sortedTrades = [...state.trades].sort((left, right) => {
    const dateOrder = left.tradedAt.localeCompare(right.tradedAt);
    return dateOrder === 0 ? left.id.localeCompare(right.id) : dateOrder;
  });
  const sortedTEvents = [...state.tEvents].sort((left, right) => left.date.localeCompare(right.date));

  let latestCashBalance = sortedTrades[0]?.cashBefore ?? state.strategy.cashBalance;
  let latestQuantity = sortedTrades[0]?.quantityBefore ?? state.strategy.quantity;
  let latestAveragePrice = sortedTrades[0]?.averagePriceBefore ?? state.strategy.averagePrice;
  let latestTValue = sortedTEvents[0]?.tBefore ?? state.strategy.tValue;

  return [...dates].sort().map((date) => {
    const trades = state.trades
      .filter((trade) => trade.tradedAt === date)
      .sort((left, right) => left.id.localeCompare(right.id));
    const tEvents = state.tEvents.filter((event) => event.date === date);
    const close = state.closeRecords.find((record) => record.date === date)?.close;

    if (trades.length > 0) {
      const finalTrade = trades[trades.length - 1];
      latestCashBalance = finalTrade.cashAfter ?? latestCashBalance;
      latestQuantity = finalTrade.quantityAfter ?? latestQuantity;
      latestAveragePrice = finalTrade.averagePriceAfter ?? latestAveragePrice;
    }

    if (tEvents.length > 0) {
      latestTValue = tEvents[tEvents.length - 1].tAfter;
    }

    const markPrice = close && close > 0 ? close : latestAveragePrice;

    return {
      date,
      tradeCount: trades.length,
      buyAmount: round(
        trades.filter((trade) => trade.type === "BUY").reduce((sum, trade) => sum + (trade.amount ?? 0), 0)
      ),
      sellAmount: round(
        trades.filter((trade) => trade.type === "SELL").reduce((sum, trade) => sum + (trade.amount ?? 0), 0)
      ),
      fee: round(trades.reduce((sum, trade) => sum + (trade.fee ?? 0), 0)),
      tValue: latestTValue,
      cashBalance: latestCashBalance,
      quantity: latestQuantity,
      averagePrice: latestAveragePrice,
      totalAssets: round(latestCashBalance + latestQuantity * markPrice)
    };
  });
};

export const createCycleArchive = (state: GoldbitLocalState): CycleArchive | null => {
  const hasCycleData =
    state.trades.length > 0 ||
    state.tEvents.length > 0 ||
    state.closeRecords.length > 0 ||
    state.strategy.quantity > 0 ||
    state.strategy.tValue > 0;

  if (!hasCycleData) return null;

  const { tradeStartDate, tradeEndDate } = getCycleDateRange(state);
  const markPrice = state.previousClose > 0 ? state.previousClose : state.strategy.averagePrice;
  const finalTotalAssets = round(state.strategy.cashBalance + state.strategy.quantity * markPrice);
  const archivedAt = new Date().toISOString();

  return {
    id: `cycle-${Date.now()}`,
    name: `${tradeStartDate} to ${tradeEndDate}`,
    startedAt: state.strategy.createdAt,
    endedAt: archivedAt,
    tradeStartDate,
    tradeEndDate,
    initialCapital: state.strategy.initialCapital,
    finalCashBalance: state.strategy.cashBalance,
    finalAveragePrice: state.strategy.averagePrice,
    finalQuantity: state.strategy.quantity,
    finalTValue: state.strategy.tValue,
    finalTotalAssets,
    realizedPnl: getRealizedPnl(state.trades),
    assetChange: round(finalTotalAssets - state.strategy.initialCapital),
    tradeCount: state.trades.length,
    buyCount: state.trades.filter((trade) => trade.type === "BUY").length,
    sellCount: state.trades.filter((trade) => trade.type === "SELL").length,
    trades: [...state.trades],
    tEvents: [...state.tEvents],
    closeRecords: [...state.closeRecords],
    dailySnapshots: buildDailySnapshots(state),
    archivedAt
  };
};

export const closeCycleAndResetState = (state: GoldbitLocalState): GoldbitLocalState => {
  const archivedCycle = createCycleArchive(state);
  const now = new Date().toISOString();

  return {
    ...state,
    strategy: {
      ...state.strategy,
      cashBalance: state.strategy.cashBalance,
      averagePrice: 0,
      quantity: 0,
      tValue: 0,
      mode: "NORMAL",
      reverseStartedAt: undefined,
      createdAt: now,
      updatedAt: now
    },
    trades: [],
    tEvents: [],
    dailyPlanSnapshots: [],
    cycleArchives: archivedCycle ? [archivedCycle, ...state.cycleArchives] : state.cycleArchives
  };
};
