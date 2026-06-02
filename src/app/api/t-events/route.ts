import { NextResponse } from "next/server";
import { suggestDailyTEvent } from "@/lib/calculations";
import {
  readGoldbitStateOrInitial,
  writeGoldbitState,
} from "@/lib/app-state-store";
import { applyDailyTEventInputToState } from "@/lib/goldbit-state";
import type { DailyTEventInput, NormalTEvent, StrategyMode } from "@/lib/types";

export const dynamic = "force-dynamic";

const normalEvents = new Set<NormalTEvent>([
  "FULL_BUY",
  "HALF_BUY",
  "QUARTER_SELL",
  "LIMIT_SELL_AND_FULL_LOC_BUY",
  "LIMIT_SELL_AND_HALF_LOC_BUY",
]);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function parseInput(value: unknown): DailyTEventInput | null {
  if (!value || typeof value !== "object") return null;

  const input = value as Partial<DailyTEventInput>;
  const mode = input.mode as StrategyMode;
  if (mode !== "NORMAL" && mode !== "REVERSE") return null;
  if (typeof input.date !== "string" || input.date.length === 0) return null;

  if (mode === "NORMAL") {
    if (!normalEvents.has(input.normalTEvent as NormalTEvent)) return null;
    return {
      date: input.date,
      mode,
      normalTEvent: input.normalTEvent as NormalTEvent,
      memo: input.memo,
    };
  }

  if (input.reverseTEvent !== "BUY" && input.reverseTEvent !== "SELL") {
    return null;
  }

  return {
    date: input.date,
    mode,
    reverseTEvent: input.reverseTEvent,
    memo: input.memo,
  };
}

export async function GET(request: Request) {
  const state = await readGoldbitStateOrInitial();
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || today();
  const planSnapshot = state.dailyPlanSnapshots.find(
    (snapshot) => snapshot.date === date,
  );
  const suggestion = suggestDailyTEvent(
    state.strategy,
    planSnapshot,
    state.trades,
    date,
  );

  return NextResponse.json({ suggestion, date });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { event?: unknown };
  const input = parseInput(body.event);

  if (!input) {
    return NextResponse.json(
      { error: "A valid Daily T event is required." },
      { status: 400 },
    );
  }

  const state = await readGoldbitStateOrInitial();
  const nextState = applyDailyTEventInputToState(state, input);
  await writeGoldbitState(nextState);

  const savedEvent = nextState.tEvents.find((event) => event.date === input.date);

  return NextResponse.json({ state: nextState, event: savedEvent });
}
