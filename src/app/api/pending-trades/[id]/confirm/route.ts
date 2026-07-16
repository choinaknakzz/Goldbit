import { NextResponse } from "next/server";
import { applyTradeToStrategy } from "@/lib/calculations";
import { readGoldbitStateOrInitial, writeGoldbitState } from "@/lib/app-state-store";
import { createTradeRecord } from "@/lib/goldbit-state";
import type { OrderType, TradeInput, TradeType } from "@/lib/types";

export const dynamic = "force-dynamic";

const tradeTypes = new Set<TradeType>(["BUY", "SELL"]);
const orderTypes = new Set<OrderType>(["LOC", "MOC", "LIMIT"]);

function parseTradeOverride(value: unknown): TradeInput | null {
  if (!value || typeof value !== "object") return null;

  const input = value as Partial<TradeInput>;
  const price = Number(input.price);
  const quantity = Number(input.quantity);
  const fee = Number(input.fee);

  if (!tradeTypes.has(input.type as TradeType)) return null;
  if (!orderTypes.has(input.orderType as OrderType)) return null;
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (!Number.isFinite(fee) || fee < 0) return null;
  if (typeof input.tradedAt !== "string" || input.tradedAt.length === 0) {
    return null;
  }

  return {
    type: input.type as TradeType,
    orderType: input.orderType as OrderType,
    price,
    quantity,
    fee,
    reason: input.reason || "OCR confirmed trade",
    tradedAt: input.tradedAt,
    memo: input.memo,
  };
}

export async function POST(
  request: Request,
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

  if (pendingTrade.status !== "NEEDS_REVIEW") {
    return NextResponse.json(
      { error: "Pending trade has already been resolved." },
      { status: 400 },
    );
  }

  if (!pendingTrade.parsedTrade) {
    return NextResponse.json(
      { error: "Pending trade has no parsed trade to confirm." },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { trade?: unknown };
  const confirmedTrade = parseTradeOverride(body.trade) ?? pendingTrade.parsedTrade;

  if (confirmedTrade.type === "SELL" && confirmedTrade.quantity > state.strategy.quantity) {
    return NextResponse.json(
      { error: "Sell quantity cannot exceed current holding." },
      { status: 400 },
    );
  }

  const strategyAfter = applyTradeToStrategy(
    state.strategy,
    confirmedTrade,
  );
  const trade = createTradeRecord(
    state.strategy,
    strategyAfter,
    confirmedTrade,
  );
  const resolvedAt = new Date().toISOString();
  const nextState = {
    ...state,
    strategy: strategyAfter,
    trades: [trade, ...state.trades],
    pendingTrades: state.pendingTrades.map((item) =>
      item.id === pendingTrade.id
        ? {
            ...item,
            parsedTrade: confirmedTrade,
            status: "CONFIRMED" as const,
            confirmedTradeId: trade.id,
            resolvedAt,
          }
        : item,
    ),
  };

  await writeGoldbitState(nextState);

  return NextResponse.json({ state: nextState, trade });
}
