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

export const buildLocOrderRequest = (request: OrderRequest): OrderRequest => {
  return {
    ...request,
    orderType: "LOC"
  };
};

export const placeOrder = async (orderRequest: OrderRequest): Promise<OrderResult> => {
  const accountSeq = orderRequest.accountId || (await getDefaultAccountSeq());
  const client = await createTossClient(accountSeq);
  const quantity = Math.floor(orderRequest.quantity);

  if (quantity < 1) {
    throw new Error("Toss LOC quantity must be at least 1 whole share.");
  }

  if (!orderRequest.limitPrice) {
    throw new Error("LOC order requires limitPrice.");
  }

  const payload = {
    clientOrderId: orderRequest.clientOrderId,
    symbol: orderRequest.symbol,
    side: orderRequest.side,
    orderType: "LIMIT",
    timeInForce: "CLS",
    quantity: String(quantity),
    price: String(orderRequest.limitPrice)
  };

  const response = await client.post<ApiResponse<OrderResponse>>("/api/v1/orders", payload);

  return {
    brokerOrderId: response.data.result.orderId,
    status: "SUCCESS",
    raw: response.data
  };
};
