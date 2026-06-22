import { TossEndpointNotConfiguredError } from "./client.js";

export interface TossTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  raw: unknown;
}

export const refreshAccessToken = async (): Promise<TossTokenResult> => {
  // TODO: Replace with official Toss Securities OpenAPI endpoint.
  // TODO: Confirm request and response schema from Toss Securities OpenAPI documentation.
  throw new TossEndpointNotConfiguredError("refreshAccessToken");
};
