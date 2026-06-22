import type { CurrentPrice } from "../types/index.js";
import { createTossClient } from "./client.js";

interface ApiResponse<T> {
  result: T;
}

interface PriceResponse {
  symbol: string;
  timestamp: string | null;
  lastPrice: string;
  currency: string;
}

export const getCurrentPrice = async (symbol: string): Promise<CurrentPrice> => {
  const client = await createTossClient();
  const response = await client.get<ApiResponse<PriceResponse[]>>("/api/v1/prices", {
    params: { symbols: symbol }
  });
  const price = response.data.result.find((item) => item.symbol.toUpperCase() === symbol.toUpperCase());

  if (!price) {
    throw new Error(`No current price returned for ${symbol}.`);
  }

  return {
    symbol: price.symbol,
    price: Number(price.lastPrice),
    currency: price.currency,
    asOf: price.timestamp ?? new Date().toISOString()
  };
};
