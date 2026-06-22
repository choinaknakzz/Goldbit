import cron from "node-cron";
import { config } from "./config.js";
import { createAndSendCandidate } from "./goldbit/candidate.js";
import { writeLog } from "./storage/logs.js";

export const runScheduledCandidate = async (): Promise<void> => {
  try {
    await createAndSendCandidate(config.targetSymbol);
  } catch (error) {
    await writeLog("ERROR", "candidate creation failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

export const startScheduler = async (): Promise<void> => {
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
    schedule: "0 17 * * *",
    timezone: config.timezone,
    targetSymbol: config.targetSymbol
  });
};
