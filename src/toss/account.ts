import type { AvailableCash, Execution } from "../types/index.js";
import { config } from "../config.js";
import { createTossClient } from "./client.js";

interface ApiResponse<T> {
  result: T;
}

interface TossAccount {
  accountNo: string;
  accountSeq: number;
  accountType: string;
}

interface BuyingPowerResponse {
  currency: string;
  cashBuyingPower: string;
}

interface CommissionResponse {
  marketCountry: string;
  commissionRate: string;
  startDate?: string | null;
  endDate?: string | null;
}

interface OrdersResponse {
  orders: Array<{
    orderId: string;
    symbol: string;
    side: "BUY" | "SELL";
    orderType?: "MARKET" | "LIMIT" | string | null;
    timeInForce?: "DAY" | "CLS" | string | null;
    quantity: string;
    price?: string | null;
    orderedAt: string;
    execution?: {
      filledQuantity?: string | null;
      averageFilledPrice?: string | null;
      commission?: string | null;
      tax?: string | null;
      filledAt?: string | null;
    };
  }>;
}

const toNumber = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined || value === "") return 0;
  return Number(value);
};

const toOptionalNumber = (value: string | number | null | undefined): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  return Number(value);
};

const getKstDate = (date = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
};

const addDays = (date: Date, days: number): Date => {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
};

const getNewYorkDate = (dateText: string): string => {
  const date = new Date(dateText);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
};

const getExecutionOrderType = (order: OrdersResponse["orders"][number]): Execution["orderType"] | undefined => {
  if (order.orderType === "MARKET") return "MARKET";
  if (order.orderType === "LIMIT" && order.timeInForce === "CLS") return "LOC";
  if (order.orderType === "LIMIT") return "LIMIT";
  return undefined;
};

export const getAccounts = async (): Promise<TossAccount[]> => {
  const client = await createTossClient();
  const response = await client.get<ApiResponse<TossAccount[]>>("/api/v1/accounts");
  return response.data.result;
};

export const getDefaultAccountSeq = async (): Promise<string> => {
  if (config.toss.accountId) {
    return config.toss.accountId;
  }

  const accounts = await getAccounts();
  const brokerageAccount = accounts.find((account) => account.accountType === "BROKERAGE") ?? accounts[0];
  if (!brokerageAccount) {
    throw new Error("No Toss Securities account found.");
  }

  return String(brokerageAccount.accountSeq);
};

export const getAvailableCash = async (): Promise<AvailableCash> => {
  const accountSeq = await getDefaultAccountSeq();
  const client = await createTossClient(accountSeq);
  const response = await client.get<ApiResponse<BuyingPowerResponse>>("/api/v1/buying-power", {
    params: { currency: "USD" }
  });

  return {
    currency: response.data.result.currency,
    amount: toNumber(response.data.result.cashBuyingPower)
  };
};

export const getUsCommissionRatePercent = async (): Promise<number | null> => {
  const accountSeq = await getDefaultAccountSeq();
  const client = await createTossClient(accountSeq);
  const response = await client.get<ApiResponse<CommissionResponse[]>>("/api/v1/commissions");
  const today = getKstDate();
  const usCommission = response.data.result.find((commission) => {
    if (commission.marketCountry !== "US") return false;
    const starts = !commission.startDate || commission.startDate <= today;
    const ends = !commission.endDate || commission.endDate >= today;
    return starts && ends;
  }) ?? response.data.result.find((commission) => commission.marketCountry === "US");

  return usCommission ? toNumber(usCommission.commissionRate) : null;
};

export const getRecentExecutions = async (symbol: string): Promise<Execution[]> => {
  const accountSeq = await getDefaultAccountSeq();
  const client = await createTossClient(accountSeq);
  const today = new Date();
  const from = getKstDate(addDays(today, -10));
  const to = getKstDate(today);
  const response = await client.get<ApiResponse<OrdersResponse>>("/api/v1/orders", {
    params: {
      status: "CLOSED",
      symbol,
      from,
      to,
      limit: 100
    }
  });

  const executions = response.data.result.orders
    .filter((order) => Boolean(order.execution?.filledAt))
    .map((order) => {
      const executedAt = order.execution?.filledAt as string;

      return {
        id: order.orderId,
        symbol: order.symbol,
        side: order.side,
        orderType: getExecutionOrderType(order),
        quantity: toNumber(order.execution?.filledQuantity ?? order.quantity),
        price: toNumber(order.execution?.averageFilledPrice),
        fee: toOptionalNumber(order.execution?.commission),
        executedAt,
        orderedAt: order.orderedAt,
        tradingDate: getNewYorkDate(executedAt)
      };
    });
  const latestTradingDate = executions
    .map((execution) => execution.tradingDate)
    .filter((tradingDate): tradingDate is string => Boolean(tradingDate))
    .sort()
    .at(-1);

  return executions.filter((execution) => execution.tradingDate === latestTradingDate);
};
