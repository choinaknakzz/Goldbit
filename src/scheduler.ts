import cron from "node-cron";
import { config } from "./config.js";
import { createAndSendGoldbitActionPlan } from "./goldbit/action-plan.js";
import { reconcileSubmittedOrders } from "./goldbit/order-reconciliation.js";
import { syncFilledOrdersToGoldbitState } from "./goldbit/trade-sync.js";
import { getNewYorkDateKey, isNyseTradingDate } from "./market/us-market-calendar.js";
import { refreshSoxlCloseState } from "./market/soxl-closes.js";
import { expireStalePendingCandidates } from "./storage/candidates.js";
import { writeLog } from "./storage/logs.js";
import { sendTextMessage, sendTradeSyncMessage } from "./telegram/message.js";
import { getAccessToken } from "./toss/auth.js";

let orderMaintenanceRunning = false;
let tossTokenMaintenanceRunning = false;
const sharedTokenMinimumTtlMs = 10 * 60 * 1000;

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
    await refreshSoxlCloseState().catch(async (error) => {
      await writeLog("WARN", "scheduled SOXL close refresh failed", {
        error: error instanceof Error ? error.message : String(error)
      });
    });
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

export const runOrderMaintenance = async (): Promise<void> => {
  if (orderMaintenanceRunning) return;
  orderMaintenanceRunning = true;
  try {
    const expiredCandidates = await expireStalePendingCandidates();
    const reconciliation = await reconcileSubmittedOrders();
    if (expiredCandidates > 0) {
      await writeLog("INFO", "stale pending candidates expired", { expiredCandidates });
    }
    if (reconciliation.unresolved > 0) {
      await writeLog("WARN", "submitted orders remain unresolved", { ...reconciliation });
    }
  } catch (error) {
    await writeLog("ERROR", "order maintenance failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    orderMaintenanceRunning = false;
  }
};

export const runTossTokenMaintenance = async (): Promise<void> => {
  if (tossTokenMaintenanceRunning || !config.toss.appKey || !config.toss.appSecret) return;

  tossTokenMaintenanceRunning = true;
  try {
    await getAccessToken({
      minimumTtlMs: sharedTokenMinimumTtlMs,
      skipConfiguredToken: true
    });
  } catch (error) {
    await writeLog("ERROR", "shared Toss token maintenance failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    tossTokenMaintenanceRunning = false;
  }
};

export const startScheduler = async (): Promise<void> => {
  cron.schedule(
    "*/5 * * * *",
    () => {
      void runTossTokenMaintenance();
    },
    { timezone: config.timezone }
  );

  cron.schedule(
    "*/5 * * * *",
    () => {
      void runOrderMaintenance();
    },
    { timezone: config.timezone }
  );

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
      actionPlan: "0 17 * * *",
      orderMaintenance: "*/5 * * * *",
      tossTokenMaintenance: "*/5 * * * *"
    },
    timezone: config.timezone,
    targetSymbol: config.targetSymbol,
    source: "Goldbit Today Action Plan",
    tossTokenOwner: "Goldbit Automation Lab"
  });
  await runTossTokenMaintenance();
  void runOrderMaintenance();
};
