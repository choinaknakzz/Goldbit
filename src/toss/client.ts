import axios, { AxiosError, AxiosHeaders, type AxiosInstance } from "axios";
import { config } from "../config.js";
import { clearCachedAccessToken, getAccessToken } from "./auth.js";

export class TossEndpointNotConfiguredError extends Error {
  constructor(operation: string) {
    super(
      `${operation} is not configured. Replace TODO endpoint and schema with official Toss Securities OpenAPI documentation.`
    );
    this.name = "TossEndpointNotConfiguredError";
  }
}

type RetryableAxiosConfig = NonNullable<AxiosError["config"]> & {
  retryCount?: number;
  tokenRefreshRetry?: boolean;
};

const getTossErrorCode = (error: AxiosError): string | undefined => {
  const data = error.response?.data;
  if (!data || typeof data !== "object" || !("error" in data)) {
    return undefined;
  }

  const tossError = (data as { error?: unknown }).error;
  if (!tossError || typeof tossError !== "object" || !("code" in tossError)) {
    return undefined;
  }

  const code = (tossError as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
};

export const isInvalidTossTokenError = (error: AxiosError): boolean => {
  return error.response?.status === 401 && getTossErrorCode(error) === "invalid-token";
};

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
    if (!requestConfig) {
      throw error;
    }

    const retryableConfig = requestConfig as RetryableAxiosConfig;

    if (isInvalidTossTokenError(error) && !retryableConfig.tokenRefreshRetry) {
      clearCachedAccessToken();
      const refreshedAccessToken = await getAccessToken({ forceRefresh: true });
      retryableConfig.tokenRefreshRetry = true;
      retryableConfig.headers = AxiosHeaders.from(retryableConfig.headers);
      retryableConfig.headers.set("Authorization", `Bearer ${refreshedAccessToken}`);
      return client.request(retryableConfig);
    }

    if (error.response?.status !== 429) {
      throw error;
    }

    const retryCount = Number(retryableConfig.retryCount ?? 0);
    if (retryCount >= 3) {
      throw error;
    }

    const retryAfterHeader = error.response.headers["retry-after"];
    const retryAfter = Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : retryAfterHeader;
    const waitMs = retryAfter ? Number(retryAfter) * 1000 : 1000 * (retryCount + 1);
    retryableConfig.retryCount = retryCount + 1;
    await new Promise((resolve) => setTimeout(resolve, Number.isFinite(waitMs) ? waitMs : 1000));
    return client.request(retryableConfig);
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
