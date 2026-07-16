import { NextResponse } from "next/server";
import { readGoldbitStateOrInitial, writeGoldbitState } from "@/lib/app-state-store";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const state = await readGoldbitStateOrInitial();
  const pendingTrade = state.pendingTrades.find((trade) => trade.id === params.id);

  if (!pendingTrade) {
    return NextResponse.json(
      { error: "Pending trade was not found." },
      { status: 404 },
    );
  }

  const nextState = {
    ...state,
    pendingTrades: state.pendingTrades.map((item) =>
      item.id === pendingTrade.id
        ? {
            ...item,
            status: "REJECTED" as const,
            resolvedAt: new Date().toISOString(),
          }
        : item,
    ),
  };

  await writeGoldbitState(nextState);

  return NextResponse.json({ state: nextState });
}
