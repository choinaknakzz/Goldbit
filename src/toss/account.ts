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

interface OrdersResponse {
  orders: Array<{
    orderId: string;
    symbol: string;
    side: "BUY" | "SELL";
    quantity: string;
    price?: string | null;
    orderedAt: string;
    execution?: {
      averageFilledPrice?: string | null;
      filledAt?: string | null;
    };
  }>;
}

const toNumber = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined || value === "") return 0;
  return Number(value);
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

export const getRecentExecutions = async (symbol: string): Promise<Execution[]> => {
  const accountSeq = await getDefaultAccountSeq();
  const client = await createTossClient(accountSeq);
  const response = await client.get<ApiResponse<OrdersResponse>>("/api/v1/orders", {
    params: {
      status: "CLOSED",
      symbol,
      limit: 20
    }
  });

  return response.data.result.orders.map((order) => ({
    id: order.orderId,
    symbol: order.symbol,
    side: order.side,
    quantity: toNumber(order.quantity),
    price: toNumber(order.execution?.averageFilledPrice ?? order.price),
    executedAt: order.execution?.filledAt ?? order.orderedAt
  }));
};
