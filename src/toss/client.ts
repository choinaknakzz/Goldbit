import axios, { AxiosError, type AxiosInstance } from "axios";
import { config } from "../config.js";

export class TossEndpointNotConfiguredError extends Error {
  constructor(operation: string) {
    super(
      `${operation} is not configured. Replace TODO endpoint and schema with official Toss Securities OpenAPI documentation.`
    );
    this.name = "TossEndpointNotConfiguredError";
  }
}

export const createTossClient = (): AxiosInstance => {
  if (!config.toss.apiBaseUrl) {
    throw new TossEndpointNotConfiguredError("Toss API base URL");
  }

  return axios.create({
    baseURL: config.toss.apiBaseUrl,
    timeout: 15_000,
    headers: {
      Authorization: config.toss.accessToken ? `Bearer ${config.toss.accessToken}` : undefined,
      "Content-Type": "application/json"
    }
  });
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
