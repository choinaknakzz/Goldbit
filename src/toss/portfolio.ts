import type { Position } from "../types/index.js";
import { getDefaultAccountSeq } from "./account.js";
import { createTossClient } from "./client.js";

interface ApiResponse<T> {
  result: T;
}

interface HoldingsOverview {
  items: Array<{
    symbol: string;
    quantity: string;
    averagePurchasePrice: string;
  }>;
}

const toNumber = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined || value === "") return 0;
  return Number(value);
};

export const getPosition = async (symbol: string): Promise<Position> => {
  const accountSeq = await getDefaultAccountSeq();
  const client = await createTossClient(accountSeq);
  const response = await client.get<ApiResponse<HoldingsOverview>>("/api/v1/holdings", {
    params: { symbol }
  });

  const item = response.data.result.items.find((holding) => holding.symbol.toUpperCase() === symbol.toUpperCase());

  return {
    symbol,
    quantity: toNumber(item?.quantity),
    averagePrice: toNumber(item?.averagePurchasePrice)
  };
};
