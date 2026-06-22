import { createAndSendCandidate } from "./goldbit/candidate.js";
import { sendSoxlStatus } from "./goldbit/status.js";
import { startScheduler } from "./scheduler.js";
import { disconnectPrisma } from "./storage/prisma.js";
import { writeLog } from "./storage/logs.js";
import { startBot } from "./telegram/bot.js";

type Mode = "dev" | "bot" | "candidate" | "soxl";

const mode = (process.argv[2] ?? "dev") as Mode;

const run = async (): Promise<void> => {
  if (mode === "candidate") {
    await writeLog("INFO", "manual candidate command started");
    const candidateId = await createAndSendCandidate();
    await writeLog("INFO", "manual candidate command finished", { candidateId });
    return;
  }

  if (mode === "soxl") {
    await writeLog("INFO", "manual SOXL status command started");
    await sendSoxlStatus();
    await writeLog("INFO", "manual SOXL status command finished");
    return;
  }

  if (mode === "bot") {
    await startBot();
    return;
  }

  if (mode === "dev") {
    await writeLog("INFO", "application started", { mode });
    await startBot();
    await startScheduler();
    return;
  }

  throw new Error(`Unsupported mode: ${mode}`);
};

run()
  .catch(async (error) => {
    await writeLog("ERROR", "application failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mode === "candidate" || mode === "soxl") {
      await disconnectPrisma();
    }
  });
