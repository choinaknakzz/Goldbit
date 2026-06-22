import type { CurrentPrice } from "../types/index.js";
import { TossEndpointNotConfiguredError } from "./client.js";

export const getCurrentPrice = async (symbol: string): Promise<CurrentPrice> => {
  // TODO: Replace with official Toss Securities OpenAPI endpoint.
  // TODO: Confirm request and response schema from Toss Securities OpenAPI documentation.
  void symbol;
  throw new TossEndpointNotConfiguredError("getCurrentPrice");
};
