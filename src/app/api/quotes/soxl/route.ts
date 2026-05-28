import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

export async function GET() {
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

      return NextResponse.json({
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
      });
    }
  }

  const response = await fetch(
    "https://stooq.com/q/l/?s=soxl.us&f=sd2t2ohlcv&h&e=csv",
    { cache: "no-store" },
  );

  if (!response.ok) {
    return NextResponse.json({ error: "Failed to fetch SOXL quote." }, { status: 502 });
  }

  const csv = await response.text();
  const [headerLine, valueLine] = csv.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  const values = valueLine.split(",");
  const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));

  return NextResponse.json({
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
  });
}
