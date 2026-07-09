import axios from "axios";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

export interface TossTokenResult {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  expiresAt: number;
  raw: unknown;
}

let cachedToken: TossTokenResult | undefined;

const minTokenTtlMs = 60_000;
const lockRetryMs = 250;
const staleLockMs = 30_000;
const lockTimeoutMs = 75_000;

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const readTokenCache = async (): Promise<TossTokenResult | undefined> => {
  try {
    const text = await readFile(config.toss.tokenCachePath, "utf8");
    const token = JSON.parse(text) as TossTokenResult;
    if (!token.accessToken || token.expiresAt - Date.now() <= minTokenTtlMs) {
      return undefined;
    }
    cachedToken = token;
    return token;
  } catch {
    return undefined;
  }
};

const writeTokenCache = async (token: TossTokenResult): Promise<void> => {
  await mkdir(path.dirname(config.toss.tokenCachePath), { recursive: true });
  await writeFile(config.toss.tokenCachePath, `${JSON.stringify(token, null, 2)}\n`, "utf8");
};

const withTokenRefreshLock = async <T>(operation: () => Promise<T>): Promise<T> => {
  const lockPath = `${config.toss.tokenCachePath}.lock`;
  const startedAt = Date.now();

  await mkdir(path.dirname(config.toss.tokenCachePath), { recursive: true });

  while (true) {
    try {
      await mkdir(lockPath, { recursive: false });
      break;
    } catch {
      try {
        const lockStat = await stat(lockPath);
        if (Date.now() - lockStat.mtimeMs > staleLockMs) {
          await rm(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {
        // The lock disappeared between attempts. Retry immediately.
      }

      if (Date.now() - startedAt > lockTimeoutMs) {
        throw new Error(`Timed out waiting for Toss token cache lock: ${lockPath}`);
      }

      await sleep(lockRetryMs);
    }
  }

  try {
    return await operation();
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
};

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

  await writeTokenCache(cachedToken);

  return cachedToken;
};

export const clearCachedAccessToken = (): void => {
  cachedToken = undefined;
};

export const getAccessToken = async (options?: { forceRefresh?: boolean }): Promise<string> => {
  if (config.toss.accessToken && !options?.forceRefresh) {
    return config.toss.accessToken;
  }

  if (!options?.forceRefresh && cachedToken && cachedToken.expiresAt - Date.now() > minTokenTtlMs) {
    return cachedToken.accessToken;
  }

  if (!options?.forceRefresh) {
    const fileToken = await readTokenCache();
    if (fileToken) {
      return fileToken.accessToken;
    }
  }

  const token = await withTokenRefreshLock(async () => {
    if (!options?.forceRefresh) {
      const fileToken = await readTokenCache();
      if (fileToken) {
        return fileToken;
      }
    }

    return refreshAccessToken();
  });
  return token.accessToken;
};
