import type { OrderRequest, OrderResult } from "../types/index.js";
import { getDefaultAccountSeq } from "./account.js";
import { createTossClient } from "./client.js";

interface ApiResponse<T> {
  result: T;
}

interface OrderResponse {
  orderId: string;
  clientOrderId?: string | null;
}

export const placeOrder = async (orderRequest: OrderRequest): Promise<OrderResult> => {
  const accountSeq = orderRequest.accountId || (await getDefaultAccountSeq());
  const client = await createTossClient(accountSeq);
  const quantity = Math.floor(orderRequest.quantity);

  if (quantity < 1) {
    throw new Error("Toss order quantity must be at least 1 whole share.");
  }

  if (orderRequest.orderType === "MOC") {
    throw new Error("MOC order is not enabled. Confirm Toss Securities support before live ordering.");
  }

  if ((orderRequest.orderType === "LOC" || orderRequest.orderType === "LIMIT") && !orderRequest.limitPrice) {
    throw new Error(`${orderRequest.orderType} order requires limitPrice.`);
  }

  const payload = {
    clientOrderId: orderRequest.clientOrderId,
    symbol: orderRequest.symbol,
    side: orderRequest.side,
    orderType: orderRequest.orderType === "MARKET" ? "MARKET" : "LIMIT",
    ...(orderRequest.orderType === "LOC" ? { timeInForce: "CLS" } : {}),
    ...(orderRequest.orderType === "LIMIT" ? { timeInForce: "DAY" } : {}),
    quantity: String(quantity),
    ...(orderRequest.limitPrice ? { price: String(orderRequest.limitPrice) } : {})
  };

  const response = await client.post<ApiResponse<OrderResponse>>("/api/v1/orders", payload);

  return {
    brokerOrderId: response.data.result.orderId,
    status: "SUCCESS",
    raw: response.data
  };
};
