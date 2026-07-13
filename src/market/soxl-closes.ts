import { config } from "../config.js";
import { writeLog } from "../storage/logs.js";
import { GoldbitStateConflictError, readGoldbitStateSnapshot, writeGoldbitState } from "../goldbit/state.js";

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{ close?: Array<number | null> }>;
      };
    }>;
    error?: unknown;
  };
}

export interface SoxlCloseRecord {
  date: string;
  close: number;
  source: "Yahoo Finance";
}

const toNewYorkDate = (timestamp: number): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(timestamp * 1000));

export const getRecentSoxlCloses = async (): Promise<SoxlCloseRecord[]> => {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${config.targetSymbol}?range=1mo&interval=1d&events=history`;
  const response = await fetch(url, {
    headers: { "User-Agent": "GoldbitAutomationLab/0.1" }
  });
  if (!response.ok) {
    throw new Error(`Yahoo Finance daily close request failed: ${response.status}`);
  }

  const body = (await response.json()) as YahooChartResponse;
  const result = body.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const records = timestamps
    .map((timestamp, index) => ({ timestamp, close: closes[index] }))
    .filter((item): item is { timestamp: number; close: number } =>
      typeof item.close === "number" && Number.isFinite(item.close) && item.close > 0
    )
    .map((item) => ({
      date: toNewYorkDate(item.timestamp),
      close: Number(item.close.toFixed(2)),
      source: "Yahoo Finance" as const
    }));

  if (records.length === 0) {
    throw new Error("Yahoo Finance returned no valid SOXL daily closes.");
  }

  return records.slice(-10);
};

export const refreshSoxlCloseState = async (): Promise<{
  updated: boolean;
  latest?: { date: string; close: number; source?: string };
}> => {
  const fetchedRecords = await getRecentSoxlCloses();

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const snapshot = readGoldbitStateSnapshot();
    const merged = new Map(snapshot.state.closeRecords.map((record) => [record.date, record]));
    for (const record of fetchedRecords) merged.set(record.date, record);
    const closeRecords = [...merged.values()].sort((left, right) => left.date.localeCompare(right.date));
    const latest = closeRecords.at(-1);
    const changed = fetchedRecords.some((record) => {
      const existing = snapshot.state.closeRecords.find((item) => item.date === record.date);
      return !existing || existing.close !== record.close;
    });

    if (!changed || !latest) return { updated: false, latest };

    try {
      writeGoldbitState(
        {
          ...snapshot.state,
          closeRecords,
          previousClose: latest.close,
          lastFiveCloses: closeRecords.slice(-5).map((record) => record.close)
        },
        snapshot.rawData
      );
      await writeLog("INFO", "SOXL daily closes refreshed", {
        latestDate: latest.date,
        latestClose: latest.close,
        fetchedCount: fetchedRecords.length
      });
      return { updated: true, latest };
    } catch (error) {
      if (!(error instanceof GoldbitStateConflictError) || attempt === 3) throw error;
    }
  }

  return { updated: false };
};
