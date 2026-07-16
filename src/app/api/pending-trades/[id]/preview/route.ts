import { NextResponse } from "next/server";
import { applyTradeToStrategy } from "@/lib/calculations";
import { readGoldbitStateOrInitial } from "@/lib/app-state-store";

export const dynamic = "force-dynamic";

export async function GET(
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

  if (!pendingTrade.parsedTrade) {
    return NextResponse.json({
      pendingTrade,
      preview: null,
      error: "Pending trade has no parsed trade to preview.",
    });
  }

  if (
    pendingTrade.parsedTrade.type === "SELL" &&
    pendingTrade.parsedTrade.quantity > state.strategy.quantity
  ) {
    return NextResponse.json({
      pendingTrade,
      preview: null,
      error: "Sell quantity cannot exceed current holding.",
    });
  }

  const strategyAfter = applyTradeToStrategy(
    state.strategy,
    pendingTrade.parsedTrade,
  );

  return NextResponse.json({
    pendingTrade,
    preview: {
      strategyBefore: state.strategy,
      strategyAfter,
    },
  });
}
