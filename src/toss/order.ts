import type { OrderRequest, OrderResult } from "../types/index.js";
import { TossEndpointNotConfiguredError } from "./client.js";

export const buildLocOrderRequest = (request: OrderRequest): OrderRequest => {
  // TODO: Confirm whether LOC orders are supported by Toss Securities OpenAPI.
  // TODO: Replace or adapt this structure if official documentation requires LIMIT or another order type.
  return {
    ...request,
    orderType: "LOC"
  };
};

export const placeOrder = async (orderRequest: OrderRequest): Promise<OrderResult> => {
  // TODO: Replace with official Toss Securities OpenAPI endpoint.
  // TODO: Confirm request and response schema from Toss Securities OpenAPI documentation.
  void orderRequest;
  throw new TossEndpointNotConfiguredError("placeOrder");
};
