import { NextResponse } from "next/server";
import { readSharedTossAccessToken } from "@/lib/toss-shared-token";

export const dynamic = "force-dynamic";

interface QuotePayload {
  symbol: "SOXL";
  source: string;
  latestClose: number;
  latestCloseDate: string;
  priorClose: number | null;
  currentPrice: number;
  latestCloseTime: string | null;
  currentPriceTime: string | null;
  timezone: string | null;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

interface YahooChartResult {
  meta?: {
    regularMarketPrice?: number;
    previousClose?: number;
    regularMarketTime?: number;
    timezone?: string;
  };
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      close?: Array<number | null>;
    }>;
  };
}

interface YahooChartResponse {
  chart?: {
    result?: YahooChartResult[];
  };
}

interface TossPriceResponse {
  result?: Array<{
    symbol?: string;
    timestamp?: string;
    lastPrice?: string;
    currency?: string;
  }>;
}

function getLastIntradayPrice(result: YahooChartResult) {
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const timestamps = result.timestamp ?? [];

  for (let index = closes.length - 1; index >= 0; index -= 1) {
    const close = closes[index];
    if (typeof close === "number" && Number.isFinite(close)) {
      return {
        price: Number(close.toFixed(2)),
        time: timestamps[index]
          ? new Date(timestamps[index] * 1000).toISOString()
          : null,
      };
    }
  }

  return { price: null, time: null };
}

function toNewYorkDate(isoTime: string | null) {
  if (!isoTime) return new Date().toISOString().slice(0, 10);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoTime));
}

async function fetchYahooQuote(): Promise<QuotePayload | null> {
  const yahooResponse = await fetch(
    "https://query1.finance.yahoo.com/v8/finance/chart/SOXL?range=1d&interval=1m&includePrePost=true",
    { cache: "no-store" },
  );

  if (yahooResponse.ok) {
    const yahoo = (await yahooResponse.json()) as YahooChartResponse;
    const result = yahoo.chart?.result?.[0];
    const meta = result?.meta;

    if (result && meta?.regularMarketPrice) {
      const latestIntraday = getLastIntradayPrice(result);
      const latestClose = Number(meta.regularMarketPrice.toFixed(2));

      return {
        symbol: "SOXL",
        source: "Yahoo Finance",
        latestClose,
        latestCloseDate: toNewYorkDate(
          meta.regularMarketTime
            ? new Date(meta.regularMarketTime * 1000).toISOString()
            : null,
        ),
        priorClose:
          typeof meta.previousClose === "number"
            ? Number(meta.previousClose.toFixed(2))
            : null,
        currentPrice: latestIntraday.price ?? latestClose,
        latestCloseTime: meta.regularMarketTime
          ? new Date(meta.regularMarketTime * 1000).toISOString()
          : null,
        currentPriceTime: latestIntraday.time,
        timezone: meta.timezone ?? null,
      };
    }
  }

  const response = await fetch(
    "https://stooq.com/q/l/?s=soxl.us&f=sd2t2ohlcv&h&e=csv",
    { cache: "no-store" },
  );

  if (!response.ok) {
    return null;
  }

  const csv = await response.text();
  const [headerLine, valueLine] = csv.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  const values = valueLine.split(",");
  const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));

  return {
    symbol: "SOXL",
    source: "Stooq",
    latestClose: Number(row.Close),
    latestCloseDate: row.Date,
    priorClose: null,
    currentPrice: Number(row.Close),
    latestCloseTime: `${row.Date}T${row.Time}`,
    currentPriceTime: `${row.Date}T${row.Time}`,
    timezone: null,
    open: Number(row.Open),
    high: Number(row.High),
    low: Number(row.Low),
    volume: Number(row.Volume),
  };
}

async function fetchTossCurrentPrice() {
  const tokenCachePath = process.env.TOSS_TOKEN_CACHE_PATH;
  if (!tokenCachePath) return null;

  const apiBaseUrl = process.env.TOSS_API_BASE_URL ?? "https://openapi.tossinvest.com";
  const firstToken = await readSharedTossAccessToken(tokenCachePath);
  if (!firstToken) return null;

  const requestPrice = (accessToken: string) =>
    fetch(`${apiBaseUrl}/api/v1/prices?symbols=SOXL`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

  let priceResponse = await requestPrice(firstToken);
  if (priceResponse.status === 401) {
    const refreshedToken = await readSharedTossAccessToken(tokenCachePath);
    if (refreshedToken && refreshedToken !== firstToken) {
      priceResponse = await requestPrice(refreshedToken);
    }
  }

  if (!priceResponse.ok) return null;

  const payload = (await priceResponse.json()) as TossPriceResponse;
  const soxl = payload.result?.find((item) => item.symbol === "SOXL");
  const currentPrice = Number(soxl?.lastPrice);

  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;

  return {
    currentPrice,
    currentPriceTime: soxl?.timestamp ?? null,
    source: "Toss Open API",
  };
}

export async function GET() {
  const [baseQuote, tossQuote] = await Promise.all([
    fetchYahooQuote(),
    fetchTossCurrentPrice(),
  ]);

  if (baseQuote && tossQuote) {
    return NextResponse.json({
      ...baseQuote,
      source: `${tossQuote.source} + ${baseQuote.source}`,
      currentPrice: tossQuote.currentPrice,
      currentPriceTime: tossQuote.currentPriceTime,
    });
  }

  if (baseQuote) {
    return NextResponse.json(baseQuote);
  }

  if (tossQuote) {
    return NextResponse.json({
      symbol: "SOXL",
      source: tossQuote.source,
      latestClose: tossQuote.currentPrice,
      latestCloseDate: toNewYorkDate(tossQuote.currentPriceTime),
      priorClose: null,
      currentPrice: tossQuote.currentPrice,
      latestCloseTime: null,
      currentPriceTime: tossQuote.currentPriceTime,
      timezone: null,
      warning: "Toss current price is being used because the regular close provider is unavailable.",
    });
  }

  return NextResponse.json(
    { error: "Failed to fetch SOXL quote." },
    { status: 502 },
  );
}
