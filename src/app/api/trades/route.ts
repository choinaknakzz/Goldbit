import { NextResponse } from "next/server";
import { applyTradeToStrategy } from "@/lib/calculations";
import { readGoldbitStateOrInitial, writeGoldbitState } from "@/lib/app-state-store";
import { createTradeRecord } from "@/lib/goldbit-state";
import type { OrderType, TradeInput, TradeType } from "@/lib/types";

export const dynamic = "force-dynamic";

const tradeTypes = new Set<TradeType>(["BUY", "SELL"]);
const orderTypes = new Set<OrderType>(["LOC", "MOC", "LIMIT"]);

function isTradeType(value: unknown): value is TradeType {
  return typeof value === "string" && tradeTypes.has(value as TradeType);
}

function isOrderType(value: unknown): value is OrderType {
  return typeof value === "string" && orderTypes.has(value as OrderType);
}

function parseTradeInput(value: unknown): TradeInput | string {
  if (!value || typeof value !== "object") {
    return "A trade object is required.";
  }

  const input = value as Partial<TradeInput>;
  const price = Number(input.price);
  const quantity = Number(input.quantity);
  const fee = Number(input.fee);

  if (!isTradeType(input.type)) return "Trade type must be BUY or SELL.";
  if (!isOrderType(input.orderType)) return "Order type must be LOC, MOC, or LIMIT.";
  if (!Number.isFinite(price) || price <= 0) return "Price must be greater than 0.";
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return "Quantity must be greater than 0.";
  }
  if (!Number.isFinite(fee) || fee < 0) return "Fee must be 0 or greater.";
  if (typeof input.tradedAt !== "string" || input.tradedAt.length === 0) {
    return "Trade date is required.";
  }

  return {
    type: input.type,
    orderType: input.orderType,
    price,
    quantity,
    fee,
    reason: typeof input.reason === "string" ? input.reason : "",
    tradedAt: input.tradedAt,
    memo: typeof input.memo === "string" ? input.memo : undefined,
  };
}

export async function POST(request: Request) {
  const body = (await request.json()) as { trade?: unknown };
  const parsedTrade = parseTradeInput(body.trade);

  if (typeof parsedTrade === "string") {
    return NextResponse.json({ error: parsedTrade }, { status: 400 });
  }

  const state = await readGoldbitStateOrInitial();

  if (parsedTrade.type === "SELL" && parsedTrade.quantity > state.strategy.quantity) {
    return NextResponse.json(
      { error: "Sell quantity cannot exceed current holding." },
      { status: 400 },
    );
  }

  const strategyAfter = applyTradeToStrategy(state.strategy, parsedTrade);
  const trade = createTradeRecord(state.strategy, strategyAfter, parsedTrade);
  const nextState = {
    ...state,
    strategy: strategyAfter,
    trades: [trade, ...state.trades],
  };

  await writeGoldbitState(nextState);

  return NextResponse.json({ state: nextState, trade });
}
