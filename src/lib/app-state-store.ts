import { prisma } from "@/lib/prisma";
import {
  initialGoldbitState,
  normalizeGoldbitState,
  type GoldbitLocalState,
} from "@/lib/goldbit-state";

const APP_STATE_ID = "goldbit-main";

export async function ensureAppStateTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AppState" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "data" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function readGoldbitState() {
  await ensureAppStateTable();

  const appState = await prisma.appState.findUnique({
    where: { id: APP_STATE_ID },
  });

  if (!appState) return null;

  return normalizeGoldbitState(
    JSON.parse(appState.data) as Partial<GoldbitLocalState>,
  );
}

export async function readGoldbitStateOrInitial() {
  return (await readGoldbitState()) ?? initialGoldbitState;
}

export async function writeGoldbitState(state: GoldbitLocalState) {
  await ensureAppStateTable();

  await prisma.appState.upsert({
    where: { id: APP_STATE_ID },
    create: {
      id: APP_STATE_ID,
      data: JSON.stringify(state),
    },
    update: {
      data: JSON.stringify(state),
    },
  });
}
