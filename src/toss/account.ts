import type { AvailableCash, Execution } from "../types/index.js";
import { TossEndpointNotConfiguredError } from "./client.js";

export const getAvailableCash = async (): Promise<AvailableCash> => {
  // TODO: Replace with official Toss Securities OpenAPI endpoint.
  // TODO: Confirm request and response schema from Toss Securities OpenAPI documentation.
  throw new TossEndpointNotConfiguredError("getAvailableCash");
};

export const getRecentExecutions = async (symbol: string): Promise<Execution[]> => {
  // TODO: Replace with official Toss Securities OpenAPI endpoint.
  // TODO: Confirm request and response schema from Toss Securities OpenAPI documentation.
  void symbol;
  throw new TossEndpointNotConfiguredError("getRecentExecutions");
};
