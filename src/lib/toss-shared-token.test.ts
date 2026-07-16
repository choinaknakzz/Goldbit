import { describe, expect, it } from "vitest";
import { parseSharedTossAccessToken } from "./toss-shared-token";

describe("shared Toss token cache", () => {
  it("accepts a token with sufficient remaining lifetime", () => {
    const now = Date.parse("2026-07-15T00:00:00.000Z");
    const text = JSON.stringify({
      accessToken: "shared-token",
      expiresAt: now + 60_000,
    });

    expect(parseSharedTossAccessToken(text, now)).toBe("shared-token");
  });

  it("rejects expired, nearly expired, and malformed cache data", () => {
    const now = Date.parse("2026-07-15T00:00:00.000Z");

    expect(
      parseSharedTossAccessToken(
        JSON.stringify({ accessToken: "stale", expiresAt: now + 30_000 }),
        now,
      ),
    ).toBeNull();
    expect(parseSharedTossAccessToken("not-json", now)).toBeNull();
  });
});
