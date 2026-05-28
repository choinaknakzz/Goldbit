"use client";

import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { applyTradeToStrategy } from "@/lib/calculations";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { StrategyConfig, TradeInput } from "@/lib/types";

export function TradeForm({ strategy }: { strategy: StrategyConfig }) {
  const [input, setInput] = useState<TradeInput>({
    type: "BUY",
    orderType: "LOC",
    price: 38,
    quantity: 10,
    fee: 0.5,
    reason: "Manual fill",
    tradedAt: new Date().toISOString().slice(0, 10),
    memo: "",
    normalTEvent: "FULL_BUY",
  });

  const preview = useMemo(() => applyTradeToStrategy(strategy, input), [strategy, input]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trade Entry</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 xl:grid-cols-6">
          <div>
            <Label>Side</Label>
            <Select value={input.type} onChange={(event) => setInput({ ...input, type: event.target.value as TradeInput["type"] })}>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </Select>
          </div>
          <div>
            <Label>Order Type</Label>
            <Select value={input.orderType} onChange={(event) => setInput({ ...input, orderType: event.target.value as TradeInput["orderType"] })}>
              <option value="LOC">LOC</option>
              <option value="MOC">MOC</option>
              <option value="LIMIT">LIMIT</option>
            </Select>
          </div>
          <div>
            <Label>Price</Label>
            <Input type="number" step="0.01" value={input.price} onChange={(event) => setInput({ ...input, price: Number(event.target.value) })} />
          </div>
          <div>
            <Label>Quantity</Label>
            <Input type="number" step="1" value={input.quantity} onChange={(event) => setInput({ ...input, quantity: Number(event.target.value) })} />
          </div>
          <div>
            <Label>Fee</Label>
            <Input type="number" step="0.01" value={input.fee} onChange={(event) => setInput({ ...input, fee: Number(event.target.value) })} />
          </div>
          <div>
            <Label>Traded At</Label>
            <Input type="date" value={input.tradedAt} onChange={(event) => setInput({ ...input, tradedAt: event.target.value })} />
          </div>
          <div className="xl:col-span-2">
            <Label>Normal T Event</Label>
            <Select value={input.normalTEvent ?? ""} onChange={(event) => setInput({ ...input, normalTEvent: event.target.value as TradeInput["normalTEvent"], reverseTEvent: undefined })}>
              <option value="">No normal T change</option>
              <option value="FULL_BUY">Full buy: T + 1</option>
              <option value="HALF_BUY">Half buy: T + 0.5</option>
              <option value="QUARTER_SELL">Quarter sell: T x 0.75</option>
              <option value="LIMIT_SELL_AND_FULL_LOC_BUY">Limit sell + full LOC buy</option>
              <option value="LIMIT_SELL_AND_HALF_LOC_BUY">Limit sell + half LOC buy</option>
            </Select>
          </div>
          <div className="xl:col-span-2">
            <Label>Reverse T Event</Label>
            <Select value={input.reverseTEvent ?? ""} onChange={(event) => setInput({ ...input, reverseTEvent: event.target.value as TradeInput["reverseTEvent"], normalTEvent: undefined })}>
              <option value="">No reverse T change</option>
              <option value="SELL">Reverse sell</option>
              <option value="BUY">Reverse buy</option>
            </Select>
          </div>
          <div className="xl:col-span-3">
            <Label>Reason</Label>
            <Input value={input.reason} onChange={(event) => setInput({ ...input, reason: event.target.value })} />
          </div>
          <div className="xl:col-span-3">
            <Label>Memo</Label>
            <Textarea value={input.memo} onChange={(event) => setInput({ ...input, memo: event.target.value })} />
          </div>
          <div className="rounded-lg border border-border bg-white/[0.03] p-4 xl:col-span-6">
            <p className="mb-3 text-sm font-medium text-amber-100">Post-fill Preview</p>
            <div className="grid gap-3 sm:grid-cols-4">
              <span>Cash: {formatCurrency(preview.cashBalance)}</span>
              <span>Quantity: {formatNumber(preview.quantity, 0)}</span>
              <span>Average Price: {formatCurrency(preview.averagePrice)}</span>
              <span>T Value: {formatNumber(preview.tValue, 4)}</span>
            </div>
          </div>
          <Button className="xl:col-span-2">
            <Save className="h-4 w-4" />
            Add Trade
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
