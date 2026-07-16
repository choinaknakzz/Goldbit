"use client";

import { type FormEvent, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import {
  applyNormalTChange,
  applyReverseBuyT,
  applyReverseSellT,
  suggestDailyTEvent,
} from "@/lib/calculations";
import { formatNumber } from "@/lib/utils";
import type {
  DailyPlanSnapshot,
  DailyTEventInput,
  NormalTEvent,
  StrategyConfig,
  StrategyMode,
  Trade,
} from "@/lib/types";

const normalEvents: Array<{ value: NormalTEvent; label: string }> = [
  { value: "FULL_BUY", label: "Full buy: T + 1" },
  { value: "HALF_BUY", label: "Half buy: T + 0.5" },
  { value: "QUARTER_SELL", label: "Quarter sell: T x 0.75" },
  { value: "LIMIT_SELL_AND_FULL_LOC_BUY", label: "Limit sell + full LOC buy" },
  { value: "LIMIT_SELL_AND_HALF_LOC_BUY", label: "Limit sell + half LOC buy" },
];

export function DailyTEventForm({
  strategy,
  trades,
  dailyPlanSnapshots,
  onAddDailyTEvent,
}: {
  strategy: StrategyConfig;
  trades: Trade[];
  dailyPlanSnapshots: DailyPlanSnapshot[];
  onAddDailyTEvent: (input: DailyTEventInput) => void;
}) {
  const [input, setInput] = useState<DailyTEventInput>({
    date: new Date().toISOString().slice(0, 10),
    mode: strategy.mode,
    memo: "",
  });

  const previewT = useMemo(() => {
    if (input.mode === "NORMAL" && input.normalTEvent) {
      return applyNormalTChange(strategy.tValue, input.normalTEvent);
    }
    if (input.mode === "REVERSE" && input.reverseTEvent) {
      return input.reverseTEvent === "SELL"
        ? applyReverseSellT(strategy.tValue, strategy.division)
        : applyReverseBuyT(strategy.tValue, strategy.division);
    }
    return strategy.tValue;
  }, [input, strategy]);
  const planSnapshot = dailyPlanSnapshots.find(
    (snapshot) => snapshot.date === input.date,
  );
  const suggestion = useMemo(
    () => suggestDailyTEvent(strategy, planSnapshot, trades, input.date),
    [strategy, planSnapshot, trades, input.date],
  );

  const hasEvent =
    (input.mode === "NORMAL" && Boolean(input.normalTEvent)) ||
    (input.mode === "REVERSE" && Boolean(input.reverseTEvent));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily T Update</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-6"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (!hasEvent) return;
            onAddDailyTEvent(input);
            setInput({
              date: new Date().toISOString().slice(0, 10),
              mode: strategy.mode,
              memo: "",
            });
          }}
        >
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={input.date}
              onChange={(event) => setInput({ ...input, date: event.target.value })}
            />
          </div>
          <div>
            <Label>Mode</Label>
            <Select
              value={input.mode}
              onChange={(event) =>
                setInput({
                  ...input,
                  mode: event.target.value as StrategyMode,
                  normalTEvent: undefined,
                  reverseTEvent: undefined,
                })
              }
            >
              <option value="NORMAL">NORMAL</option>
              <option value="REVERSE">REVERSE</option>
            </Select>
          </div>
          {input.mode === "NORMAL" ? (
            <div className="md:col-span-2 xl:col-span-2">
              <Label>Normal Daily Result</Label>
              <Select
                value={input.normalTEvent ?? ""}
                onChange={(event) =>
                  setInput({
                    ...input,
                    normalTEvent: event.target.value as NormalTEvent,
                    reverseTEvent: undefined,
                  })
                }
              >
                <option value="">Select result</option>
                {normalEvents.map((event) => (
                  <option key={event.value} value={event.value}>
                    {event.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <div className="md:col-span-2 xl:col-span-2">
              <Label>Reverse Daily Result</Label>
              <Select
                value={input.reverseTEvent ?? ""}
                onChange={(event) =>
                  setInput({
                    ...input,
                    reverseTEvent: event.target.value as "SELL" | "BUY",
                    normalTEvent: undefined,
                  })
                }
              >
                <option value="">Select result</option>
                <option value="SELL">Reverse sell</option>
                <option value="BUY">Reverse buy</option>
              </Select>
            </div>
          )}
          <div className="md:col-span-2 xl:col-span-2">
            <Label>Memo</Label>
            <Textarea
              value={input.memo}
              onChange={(event) => setInput({ ...input, memo: event.target.value })}
            />
          </div>
          <div className="rounded-lg border border-border bg-white/[0.03] p-4 md:col-span-2 xl:col-span-6">
            <p className="mb-2 text-sm font-medium text-amber-100">T Preview</p>
            <p className="text-sm text-muted-foreground">
              Current T {formatNumber(strategy.tValue, 4)} to{" "}
              <span className="font-semibold text-foreground">{formatNumber(previewT, 4)}</span>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Use one Daily T Update per date after all buy and sell fills for that date are known.
            </p>
          </div>
          <div className="rounded-lg border border-amber-300/20 bg-amber-300/5 p-4 md:col-span-2 xl:col-span-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-medium text-amber-100">
                  Suggested T Update
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {suggestion.input?.normalTEvent ??
                    suggestion.input?.reverseTEvent ??
                    "No suggestion"}
                  {suggestion.input ? (
                    <span className="ml-2 text-xs">
                      Confidence {formatNumber(suggestion.confidence * 100, 0)}%
                    </span>
                  ) : null}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {suggestion.reason}
                </p>
                {suggestion.detectedSummary.length > 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {suggestion.detectedSummary.join(" / ")}
                  </p>
                ) : null}
              </div>
              <Button
                className="shrink-0 md:w-fit"
                disabled={!suggestion.input}
                type="button"
                onClick={() => {
                  if (!suggestion.input) return;
                  setInput(suggestion.input);
                }}
              >
                Use Suggestion
              </Button>
            </div>
          </div>
          <Button className="md:w-fit xl:col-span-2" type="submit" disabled={!hasEvent}>
            <Save className="h-4 w-4" />
            Save T Update
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
