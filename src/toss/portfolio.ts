import type { Position } from "../types/index.js";
import { TossEndpointNotConfiguredError } from "./client.js";

export const getPosition = async (symbol: string): Promise<Position> => {
  // TODO: Replace with official Toss Securities OpenAPI endpoint.
  // TODO: Confirm request and response schema from Toss Securities OpenAPI documentation.
  void symbol;
  throw new TossEndpointNotConfiguredError("getPosition");
};
