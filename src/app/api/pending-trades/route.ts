import { NextResponse } from "next/server";
import { readGoldbitStateOrInitial, writeGoldbitState } from "@/lib/app-state-store";
import { parseOcrTradeText } from "@/lib/ocr-trade-parser";
import type { PendingTrade } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    rawText?: unknown;
    source?: unknown;
  };

  if (typeof body.rawText !== "string" || body.rawText.trim().length === 0) {
    return NextResponse.json(
      { error: "OCR text is required." },
      { status: 400 },
    );
  }

  const state = await readGoldbitStateOrInitial();
  const parseResult = parseOcrTradeText(body.rawText, {
    feeRatePercent: state.feeRatePercent,
  });
  const pendingTrade: PendingTrade = {
    id: `pending-${Date.now()}`,
    source: body.source === "TELEGRAM" ? "TELEGRAM" : "SCREENSHOT",
    status: "NEEDS_REVIEW",
    rawText: body.rawText,
    parsedTrade: parseResult.trade,
    confidence: parseResult.confidence,
    notes: parseResult.notes,
    createdAt: new Date().toISOString(),
  };
  const nextState = {
    ...state,
    pendingTrades: [pendingTrade, ...state.pendingTrades],
  };

  await writeGoldbitState(nextState);

  return NextResponse.json({ state: nextState, pendingTrade });
}
