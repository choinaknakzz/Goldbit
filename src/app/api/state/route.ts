import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const APP_STATE_ID = "goldbit-main";

export const dynamic = "force-dynamic";

async function ensureAppStateTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AppState" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "data" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function GET() {
  await ensureAppStateTable();

  const appState = await prisma.appState.findUnique({
    where: { id: APP_STATE_ID },
  });

  if (!appState) {
    return NextResponse.json({ state: null });
  }

  try {
    return NextResponse.json({ state: JSON.parse(appState.data) });
  } catch {
    return NextResponse.json(
      { error: "Saved Goldbit state is corrupted." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  await ensureAppStateTable();

  const body = (await request.json()) as { state?: unknown };

  if (!body.state || typeof body.state !== "object") {
    return NextResponse.json(
      { error: "A state object is required." },
      { status: 400 },
    );
  }

  await prisma.appState.upsert({
    where: { id: APP_STATE_ID },
    create: {
      id: APP_STATE_ID,
      data: JSON.stringify(body.state),
    },
    update: {
      data: JSON.stringify(body.state),
    },
  });

  return NextResponse.json({ ok: true });
}
