import cron from "node-cron";
import { config } from "./config.js";
import { createAndSendGoldbitActionPlan } from "./goldbit/action-plan.js";
import { syncFilledOrdersToGoldbitState } from "./goldbit/trade-sync.js";
import { getNewYorkDateKey, isNyseTradingDate } from "./market/us-market-calendar.js";
import { writeLog } from "./storage/logs.js";
import { sendTextMessage, sendTradeSyncMessage } from "./telegram/message.js";

const shouldRunForNyseTradingDate = async (job: string, instant = new Date()): Promise<boolean> => {
  const newYorkDate = getNewYorkDateKey(instant);
  if (isNyseTradingDate(newYorkDate)) return true;

  await writeLog("INFO", "scheduled job skipped because NYSE is closed", { job, newYorkDate });
  return false;
};

export const runScheduledCandidate = async (instant = new Date()): Promise<void> => {
  if (!(await shouldRunForNyseTradingDate("actionPlan", instant))) return;

  try {
    await createAndSendGoldbitActionPlan();
  } catch (error) {
    await writeLog("ERROR", "Goldbit action plan creation failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
};

export const runScheduledTradeSync = async (instant = new Date()): Promise<void> => {
  if (!(await shouldRunForNyseTradingDate("tradeSync", instant))) return;

  try {
    const result = await syncFilledOrdersToGoldbitState();
    await sendTradeSyncMessage(result);
  } catch (error) {
    await sendTextMessage(
      [
        "[Goldbit 05:30 체결 동기화 실패]",
        "",
        error instanceof Error ? error.message : String(error)
      ].join("\n")
    );
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
