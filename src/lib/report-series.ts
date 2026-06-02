import type { CloseRecord, DailyTEvent, StrategyConfig, Trade } from "./types";

export interface ReportSeriesPoint {
  date: string;
  fullDate: string;
  [key: string]: string | number;
  tValue: number;
  averagePrice: number;
  cashBalance: number;
  quantity: number;
  totalAssets: number;
}

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const formatChartDate = (date: string) => date.slice(5);

function getPreviousDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return previous.toISOString().slice(0, 10);
}

function getTradeSequence(trade: Trade) {
  const match = trade.id.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function getMarkPrice(
  date: string,
  closeRecords: CloseRecord[],
  fallbackPrice: number,
) {
  const close = closeRecords.find((record) => record.date === date)?.close;
  return close && close > 0 ? close : fallbackPrice;
}

export function buildReportSeries({
  strategy,
  trades,
  tEvents,
  closeRecords,
  markPrice,
}: {
  strategy: StrategyConfig;
  trades: Trade[];
  tEvents: DailyTEvent[];
  closeRecords: CloseRecord[];
  markPrice: number;
}): ReportSeriesPoint[] {
  const sortedTrades = [...trades].sort((left, right) => {
    const dateOrder = left.tradedAt.localeCompare(right.tradedAt);
    return dateOrder === 0
      ? getTradeSequence(left) - getTradeSequence(right)
      : dateOrder;
  });
  const sortedTEvents = [...tEvents].sort((left, right) => {
    const dateOrder = left.date.localeCompare(right.date);
    return dateOrder === 0 ? left.id.localeCompare(right.id) : dateOrder;
  });
  const timeline = [
    ...sortedTrades.map((trade) => ({
      kind: "trade" as const,
      date: trade.tradedAt,
      id: trade.id,
      trade,
    })),
    ...sortedTEvents.map((event) => ({
      kind: "tEvent" as const,
      date: event.date,
      id: event.id,
      event,
    })),
  ].sort((left, right) => {
    const dateOrder = left.date.localeCompare(right.date);
    if (dateOrder !== 0) return dateOrder;
    if (left.kind !== right.kind) return left.kind === "trade" ? -1 : 1;
    return left.id.localeCompare(right.id);
  });

  if (timeline.length === 0) {
    return [
      {
        date: "Now",
        fullDate: "Now",
        tValue: strategy.tValue,
        averagePrice: strategy.averagePrice,
        cashBalance: strategy.cashBalance,
        quantity: strategy.quantity,
        totalAssets: round(strategy.cashBalance + strategy.quantity * markPrice),
      },
    ];
  }

  let latestCashBalance =
    sortedTrades[0]?.cashBefore ?? strategy.cashBalance;
  let latestQuantity = sortedTrades[0]?.quantityBefore ?? strategy.quantity;
  let latestAveragePrice =
    sortedTrades[0]?.averagePriceBefore ?? strategy.averagePrice;
  let latestTValue = sortedTEvents[0]?.tBefore ?? strategy.tValue;
  const dailyPoints = new Map<string, ReportSeriesPoint>();
  const initialDate = getPreviousDate(timeline[0].date);
  const initialMarkPrice = getMarkPrice(
    initialDate,
    closeRecords,
    latestAveragePrice || markPrice,
  );

  dailyPoints.set(initialDate, {
    date: formatChartDate(initialDate),
    fullDate: initialDate,
    tValue: latestTValue,
    averagePrice: latestAveragePrice,
    cashBalance: latestCashBalance,
    quantity: latestQuantity,
    totalAssets: round(latestCashBalance + latestQuantity * initialMarkPrice),
  });

  for (const item of timeline) {
    if (item.kind === "trade") {
      latestCashBalance = item.trade.cashAfter;
      latestQuantity = item.trade.quantityAfter;
      latestAveragePrice = item.trade.averagePriceAfter;
    } else {
      latestTValue = item.event.tAfter;
    }

    const pointMarkPrice = getMarkPrice(
      item.date,
      closeRecords,
      latestAveragePrice || markPrice,
    );

    dailyPoints.set(item.date, {
      date: formatChartDate(item.date),
      fullDate: item.date,
      tValue: latestTValue,
      averagePrice: latestAveragePrice,
      cashBalance: latestCashBalance,
      quantity: latestQuantity,
      totalAssets: round(latestCashBalance + latestQuantity * pointMarkPrice),
    });
  }

  return [...dailyPoints.values()];
}
