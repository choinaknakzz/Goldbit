import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";
import type { DailyPlan, DailyPlanSnapshot, GoldbitLocalState } from "./mechanism-types.js";

const APP_STATE_ID = "goldbit-main";

const getLatestFiveCloses = (records: GoldbitLocalState["closeRecords"]): number[] => {
  return [...records]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-5)
    .map((record) => record.close);
};

export const readGoldbitState = (): GoldbitLocalState => {
  if (!existsSync(config.goldbitStateDbPath)) {
    throw new Error(`Goldbit state database not found: ${config.goldbitStateDbPath}`);
  }

  const db = new DatabaseSync(config.goldbitStateDbPath, { readOnly: true });
  try {
    const row = db
      .prepare("SELECT data FROM AppState WHERE id = ?")
      .get(APP_STATE_ID) as { data?: string } | undefined;

    if (!row?.data) {
      throw new Error(`Goldbit AppState row not found: ${APP_STATE_ID}`);
    }

    const parsed = JSON.parse(row.data) as GoldbitLocalState;
    const closeRecords = Array.isArray(parsed.closeRecords) ? parsed.closeRecords : [];
    const latestFiveCloses = getLatestFiveCloses(closeRecords);

    return {
      ...parsed,
      closeRecords,
      trades: Array.isArray(parsed.trades) ? parsed.trades : [],
      tEvents: Array.isArray(parsed.tEvents) ? parsed.tEvents : [],
      dailyPlanSnapshots: Array.isArray(parsed.dailyPlanSnapshots) ? parsed.dailyPlanSnapshots : [],
      lastFiveCloses: latestFiveCloses.length > 0 ? latestFiveCloses : parsed.lastFiveCloses,
      previousClose: typeof parsed.previousClose === "number" ? parsed.previousClose : 0,
      feeRatePercent: typeof parsed.feeRatePercent === "number" ? parsed.feeRatePercent : 0,
      pendingTrades: Array.isArray(parsed.pendingTrades) ? parsed.pendingTrades : [],
      cycleArchives: Array.isArray(parsed.cycleArchives) ? parsed.cycleArchives : []
    };
  } finally {
    db.close();
  }
};

export const writeGoldbitState = (state: GoldbitLocalState): void => {
  if (!existsSync(config.goldbitStateDbPath)) {
    throw new Error(`Goldbit state database not found: ${config.goldbitStateDbPath}`);
  }

  const db = new DatabaseSync(config.goldbitStateDbPath);
  try {
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS AppState (
        id TEXT NOT NULL PRIMARY KEY,
        data TEXT NOT NULL,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `
    ).run();
    db.prepare(
      `
      INSERT INTO AppState (id, data, updatedAt)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        data = excluded.data,
        updatedAt = CURRENT_TIMESTAMP
    `
    ).run(APP_STATE_ID, JSON.stringify(state));
  } finally {
    db.close();
  }
};

export const saveGoldbitPlanSnapshot = (plan: DailyPlan): boolean => {
  const state = readGoldbitState();
  const hasTradeOrTEvent = state.trades.some((trade) => trade.tradedAt === plan.date) ||
    state.tEvents.some((event) => event.date === plan.date);

  if (hasTradeOrTEvent) {
    return false;
  }

  const now = new Date().toISOString();
  const existing = state.dailyPlanSnapshots.find((snapshot) => snapshot.date === plan.date);
  const snapshot: DailyPlanSnapshot = {
    date: plan.date,
    plan,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  writeGoldbitState({
    ...state,
    dailyPlanSnapshots: [snapshot, ...state.dailyPlanSnapshots.filter((item) => item.date !== plan.date)]
  });

  return true;
};
