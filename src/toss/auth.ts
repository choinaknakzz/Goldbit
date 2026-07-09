import axios from "axios";
import { config } from "../config.js";

export interface TossTokenResult {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  expiresAt: number;
  raw: unknown;
}

let cachedToken: TossTokenResult | undefined;

export const refreshAccessToken = async (): Promise<TossTokenResult> => {
  if (!config.toss.appKey || !config.toss.appSecret) {
    throw new Error("TOSS_APP_KEY and TOSS_APP_SECRET are required.");
  }

  const baseUrl = config.toss.apiBaseUrl || "https://openapi.tossinvest.com";
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.toss.appKey,
    client_secret: config.toss.appSecret
  });

  const response = await axios.post<{
    access_token: string;
    token_type: "Bearer";
    expires_in: number;
  }>(`${baseUrl}/oauth2/token`, body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 15_000
  });

  cachedToken = {
    accessToken: response.data.access_token,
    tokenType: response.data.token_type,
    expiresIn: response.data.expires_in,
    expiresAt: Date.now() + response.data.expires_in * 1000,
    raw: response.data
  };

  return cachedToken;
};

export const clearCachedAccessToken = (): void => {
  cachedToken = undefined;
};

export const getAccessToken = async (options?: { forceRefresh?: boolean }): Promise<string> => {
  if (config.toss.accessToken && !options?.forceRefresh) {
    return config.toss.accessToken;
  }

  if (!options?.forceRefresh && cachedToken && cachedToken.expiresAt - Date.now() > 60_000) {
    return cachedToken.accessToken;
  }

  const token = await refreshAccessToken();
  return token.accessToken;
};
