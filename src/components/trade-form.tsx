"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { applyTradeToStrategy } from "@/lib/calculations";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { StrategyConfig, TradeInput } from "@/lib/types";

const createEmptyTradeInput = (): TradeInput => ({
  type: "BUY",
  orderType: "LOC",
  price: 0,
  quantity: 0,
  fee: 0,
  reason: "",
  tradedAt: new Date().toISOString().slice(0, 10),
  memo: "",
});

function calculateFee(price: number, quantity: number, feeRatePercent: number) {
  const amount = price * quantity;
  return Number(((amount * feeRatePercent) / 100).toFixed(2));
}

function parseNumericInput(value: string) {
  if (value.trim() === "") return 0;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function TradeForm({
  strategy,
  feeRatePercent,
  onAddTrade,
}: {
  strategy: StrategyConfig;
  feeRatePercent: number;
  onAddTrade: (input: TradeInput) => void;
}) {
  const [input, setInput] = useState<TradeInput>(createEmptyTradeInput);
  const [priceInput, setPriceInput] = useState("");
  const [quantityInput, setQuantityInput] = useState("");

  useEffect(() => {
    setInput(createEmptyTradeInput());
    setPriceInput("");
    setQuantityInput("");
  }, [strategy.updatedAt]);

  useEffect(() => {
    setInput((currentInput) => {
      const nextFee = calculateFee(
        currentInput.price,
        currentInput.quantity,
        feeRatePercent,
      );

      return currentInput.fee === nextFee
        ? currentInput
        : { ...currentInput, fee: nextFee };
    });
  }, [feeRatePercent]);

  const hasFillInput = input.price > 0 && input.quantity > 0;
  const hasValidSellQuantity =
    input.type !== "SELL" || input.quantity <= strategy.quantity;
  const canSubmit = hasFillInput && hasValidSellQuantity;
  const fillAmount = input.price * input.quantity;
  const preview = useMemo(
    () => (hasFillInput ? applyTradeToStrategy(strategy, input) : strategy),
    [hasFillInput, strategy, input],
  );
  const updatePrice = (value: string) => {
    const price = parseNumericInput(value);
    setPriceInput(value);
    setInput({
      ...input,
      price,
      fee: calculateFee(price, input.quantity, feeRatePercent),
    });
  };
  const updateQuantity = (value: string) => {
    const quantity = parseNumericInput(value);
    setQuantityInput(value);
    setInput({
      ...input,
      quantity,
      fee: calculateFee(input.price, quantity, feeRatePercent),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trade Entry</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 xl:grid-cols-6"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (!canSubmit) return;
            onAddTrade(input);
            setInput(createEmptyTradeInput());
            setPriceInput("");
            setQuantityInput("");
          }}
        >
          <div>
            <Label>Side</Label>
            <Select
              value={input.type}
              onChange={(event) =>
                setInput({ ...input, type: event.target.value as TradeInput["type"] })
              }
            >
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </Select>
          </div>
          <div>
            <Label>Order Type</Label>
            <Select
              value={input.orderType}
              onChange={(event) =>
                setInput({
                  ...input,
                  orderType: event.target.value as TradeInput["orderType"],
                })
              }
            >
              <option value="LOC">LOC</option>
              <option value="MOC">MOC</option>
              <option value="LIMIT">LIMIT</option>
            </Select>
          </div>
          <div>
            <Label>Price</Label>
            <Input
              type="number"
              step="0.01"
              value={priceInput}
              onChange={(event) => updatePrice(event.target.value)}
            />
          </div>
          <div>
            <Label>Quantity</Label>
            <Input
              type="number"
              step="1"
              max={input.type === "SELL" ? strategy.quantity : undefined}
              value={quantityInput}
              onChange={(event) => updateQuantity(event.target.value)}
            />
            {!hasValidSellQuantity ? (
              <p className="mt-1 text-xs text-red-200">
                Sell quantity cannot exceed current holding{" "}
                {formatNumber(strategy.quantity, 0)}.
              </p>
            ) : null}
          </div>
          <div>
            <Label>Fee</Label>
            <Input type="number" step="0.01" value={input.fee} readOnly />
            <p className="mt-1 text-xs text-muted-foreground">
              {formatCurrency(fillAmount)} x {feeRatePercent}% from Settings.
            </p>
          </div>
          <div>
            <Label>Traded At</Label>
            <Input
              type="date"
              value={input.tradedAt}
              onChange={(event) => setInput({ ...input, tradedAt: event.target.value })}
            />
          </div>
          <div className="xl:col-span-3">
            <Label>Reason</Label>
            <Input
              value={input.reason}
              onChange={(event) => setInput({ ...input, reason: event.target.value })}
            />
          </div>
          <div className="xl:col-span-3">
            <Label>Memo</Label>
            <Textarea
              value={input.memo}
              onChange={(event) => setInput({ ...input, memo: event.target.value })}
            />
          </div>
          <div className="rounded-lg border border-border bg-white/[0.03] p-4 xl:col-span-6">
            <p className="mb-3 text-sm font-medium text-amber-100">Post-fill Preview</p>
            <div className="grid gap-3 sm:grid-cols-4">
              <span>Cash: {formatCurrency(preview.cashBalance)}</span>
              <span>Quantity: {formatNumber(preview.quantity, 0)}</span>
              <span>Average Price: {formatCurrency(preview.averagePrice)}</span>
              <span>T Value: {formatNumber(preview.tValue, 4)}</span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Trade entries update cash, quantity, and average price only. T value is handled
              in Daily T Update below.
            </p>
          </div>
          <Button className="xl:col-span-2" type="submit" disabled={!canSubmit}>
            <Save className="h-4 w-4" />
            Add Trade
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
