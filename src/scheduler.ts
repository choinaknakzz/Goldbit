import cron from "node-cron";
import { config } from "./config.js";
import { createAndSendGoldbitActionPlan } from "./goldbit/action-plan.js";
import { syncFilledOrdersToGoldbitState } from "./goldbit/trade-sync.js";
import { writeLog } from "./storage/logs.js";

export const runScheduledCandidate = async (): Promise<void> => {
  try {
    await createAndSendGoldbitActionPlan();
  } catch (error) {
    await writeLog("ERROR", "Goldbit action plan creation failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

export const runScheduledTradeSync = async (): Promise<void> => {
  try {
    await syncFilledOrdersToGoldbitState();
  } catch (error) {
    await writeLog("ERROR", "Goldbit filled order sync failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

export const startScheduler = async (): Promise<void> => {
  cron.schedule(
    "30 5 * * *",
    () => {
      void runScheduledTradeSync();
    },
    {
      timezone: config.timezone
    }
  );

  cron.schedule(
    "0 17 * * *",
    () => {
      void runScheduledCandidate();
    },
    {
      timezone: config.timezone
    }
  );

  await writeLog("INFO", "scheduler started", {
    schedules: {
      tradeSync: "30 5 * * *",
      actionPlan: "0 17 * * *"
    },
    timezone: config.timezone,
    targetSymbol: config.targetSymbol,
    source: "Goldbit Today Action Plan"
  });
};
