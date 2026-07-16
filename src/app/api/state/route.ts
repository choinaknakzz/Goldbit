import { NextResponse } from "next/server";
import { readGoldbitState, writeGoldbitState } from "@/lib/app-state-store";
import { normalizeGoldbitState } from "@/lib/goldbit-state";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ state: await readGoldbitState() });
  } catch {
    return NextResponse.json(
      { error: "Saved Goldbit state is corrupted." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { state?: unknown };

  if (!body.state || typeof body.state !== "object") {
    return NextResponse.json(
      { error: "A state object is required." },
      { status: 400 },
    );
  }

  await writeGoldbitState(normalizeGoldbitState(body.state));

  return NextResponse.json({ ok: true });
}
