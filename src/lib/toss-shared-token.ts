import { readFile } from "node:fs/promises";

interface SharedTossTokenPayload {
  accessToken?: unknown;
  expiresAt?: unknown;
}

const defaultMinimumTtlMs = 30_000;

export function parseSharedTossAccessToken(
  text: string,
  now = Date.now(),
  minimumTtlMs = defaultMinimumTtlMs,
): string | null {
  try {
    const payload = JSON.parse(text) as SharedTossTokenPayload;
    if (
      typeof payload.accessToken !== "string" ||
      !payload.accessToken ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt - now <= minimumTtlMs
    ) {
      return null;
    }

    return payload.accessToken;
  } catch {
    return null;
  }
}

export async function readSharedTossAccessToken(
  cachePath: string,
  now = Date.now(),
): Promise<string | null> {
  try {
    const text = await readFile(cachePath, "utf8");
    return parseSharedTossAccessToken(text, now);
  } catch {
    return null;
  }
}
