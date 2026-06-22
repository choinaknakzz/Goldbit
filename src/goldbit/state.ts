import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";
import type { GoldbitLocalState } from "./mechanism-types.js";

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
      dailyPlanSnapshots: Array.isArray(parsed.dailyPlanSnapshots) ? parsed.dailyPlanSnapshots : [],
      lastFiveCloses: latestFiveCloses.length > 0 ? latestFiveCloses : parsed.lastFiveCloses,
      previousClose: typeof parsed.previousClose === "number" ? parsed.previousClose : 0
    };
  } finally {
    db.close();
  }
};
