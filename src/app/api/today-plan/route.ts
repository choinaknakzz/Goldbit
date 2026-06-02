import { NextResponse } from "next/server";
import {
  generateNormalDailyPlan,
  generateReverseDailyPlan,
} from "@/lib/calculations";
import {
  readGoldbitStateOrInitial,
  writeGoldbitState,
} from "@/lib/app-state-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await readGoldbitStateOrInitial();
  const isFirstReverseDay =
    state.strategy.mode === "REVERSE" &&
    Boolean(state.strategy.reverseStartedAt) &&
    !state.trades.some(
      (trade) => trade.tradedAt === state.strategy.reverseStartedAt,
    );
  const plan =
    state.strategy.mode === "REVERSE"
      ? generateReverseDailyPlan(
          state.strategy,
          state.lastFiveCloses,
          isFirstReverseDay,
        )
      : generateNormalDailyPlan(state.strategy, state.previousClose);
  const existingSnapshot = state.dailyPlanSnapshots.find(
    (snapshot) => snapshot.date === plan.date,
  );

  if (!existingSnapshot) {
    const snapshot = {
      date: plan.date,
      plan,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeGoldbitState({
      ...state,
      dailyPlanSnapshots: [
        snapshot,
        ...state.dailyPlanSnapshots.filter((item) => item.date !== plan.date),
      ],
    });
  }

  return NextResponse.json({ plan });
}
