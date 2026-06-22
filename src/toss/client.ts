import axios, { AxiosError, type AxiosInstance } from "axios";
import { config } from "../config.js";
import { getAccessToken } from "./auth.js";

export class TossEndpointNotConfiguredError extends Error {
  constructor(operation: string) {
    super(
      `${operation} is not configured. Replace TODO endpoint and schema with official Toss Securities OpenAPI documentation.`
    );
    this.name = "TossEndpointNotConfiguredError";
  }
}

export const createTossClient = async (accountId?: string): Promise<AxiosInstance> => {
  const accessToken = await getAccessToken();

  const client = axios.create({
    baseURL: config.toss.apiBaseUrl || "https://openapi.tossinvest.com",
    timeout: 15_000,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(accountId ? { "X-Tossinvest-Account": accountId } : {})
    }
  });

  client.interceptors.response.use(undefined, async (error: AxiosError) => {
    const requestConfig = error.config;
    if (!requestConfig || error.response?.status !== 429) {
      throw error;
    }

    const retryCount = Number((requestConfig as { retryCount?: number }).retryCount ?? 0);
    if (retryCount >= 3) {
      throw error;
    }

    const retryAfterHeader = error.response.headers["retry-after"];
    const retryAfter = Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : retryAfterHeader;
    const waitMs = retryAfter ? Number(retryAfter) * 1000 : 1000 * (retryCount + 1);
    (requestConfig as { retryCount?: number }).retryCount = retryCount + 1;
    await new Promise((resolve) => setTimeout(resolve, Number.isFinite(waitMs) ? waitMs : 1000));
    return client.request(requestConfig);
  });

  return client;
};

export const parseTossError = (error: unknown): string => {
  if (error instanceof TossEndpointNotConfiguredError) {
    return error.message;
  }

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    return JSON.stringify({
      message: axiosError.message,
      status: axiosError.response?.status,
      data: axiosError.response?.data
    });
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};
