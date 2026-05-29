"use client";

import { type FormEvent, useEffect, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/form";
import type { CloseRecord, Division, StrategyConfig, StrategyMode } from "@/lib/types";

export function SettingsForm({
  strategy,
  closeRecords,
  feeRatePercent,
  onSave,
  onReset,
}: {
  strategy: StrategyConfig;
  closeRecords: CloseRecord[];
  feeRatePercent: number;
  onSave: (
    strategy: StrategyConfig,
    closeRecords: CloseRecord[],
    feeRatePercent: number,
  ) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState(strategy);
  const [closes, setCloses] = useState(closeRecords);
  const [feeRateDraft, setFeeRateDraft] = useState(feeRatePercent);
  const isBeforeFirstTrade =
    draft.quantity === 0 && draft.averagePrice === 0 && draft.tValue === 0;

  useEffect(() => {
    setDraft(strategy);
    setCloses(closeRecords);
    setFeeRateDraft(feeRatePercent);
  }, [strategy, closeRecords, feeRatePercent]);

  useEffect(() => {
    if (isBeforeFirstTrade && draft.cashBalance !== draft.initialCapital) {
      setDraft((currentDraft) => ({
        ...currentDraft,
        cashBalance: currentDraft.initialCapital,
      }));
    }
  }, [draft.cashBalance, draft.initialCapital, isBeforeFirstTrade]);

  const updateNumber = (key: keyof StrategyConfig, value: string) => {
    setDraft({ ...draft, [key]: Number(value) });
  };

  const updateInitialCapital = (value: string) => {
    const nextInitialCapital = Number(value);
    setDraft({
      ...draft,
      initialCapital: nextInitialCapital,
      cashBalance: isBeforeFirstTrade ? nextInitialCapital : draft.cashBalance,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Strategy Defaults</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 xl:grid-cols-4"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            onSave(
              isBeforeFirstTrade
                ? { ...draft, cashBalance: draft.initialCapital }
                : draft,
              closes,
              feeRateDraft,
            );
          }}
        >
          <div>
            <Label>Initial Capital</Label>
            <Input
              type="number"
              value={draft.initialCapital}
              onChange={(event) => updateInitialCapital(event.target.value)}
            />
            {isBeforeFirstTrade ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Before first trade, this also sets Current Cash.
              </p>
            ) : null}
          </div>
          <div>
            <Label>Division</Label>
            <Select
              value={draft.division}
              onChange={(event) =>
                setDraft({ ...draft, division: Number(event.target.value) as Division })
              }
            >
              <option value="20">20</option>
              <option value="40">40</option>
            </Select>
          </div>
          <div>
            <Label>Current Cash</Label>
            <Input
              type="number"
              value={draft.cashBalance}
              onChange={(event) => updateNumber("cashBalance", event.target.value)}
            />
          </div>
          <div>
            <Label>Average Price</Label>
            <Input
              type="number"
              value={draft.averagePrice}
              onChange={(event) => updateNumber("averagePrice", event.target.value)}
            />
          </div>
          <div>
            <Label>Quantity</Label>
            <Input
              type="number"
              value={draft.quantity}
              onChange={(event) => updateNumber("quantity", event.target.value)}
            />
          </div>
          <div>
            <Label>T Value</Label>
            <Input
              type="number"
              value={draft.tValue}
              onChange={(event) => updateNumber("tValue", event.target.value)}
            />
          </div>
          <div>
            <Label>Mode</Label>
            <Select
              value={draft.mode}
              onChange={(event) =>
                setDraft({ ...draft, mode: event.target.value as StrategyMode })
              }
            >
              <option value="NORMAL">NORMAL</option>
              <option value="REVERSE">REVERSE</option>
            </Select>
          </div>
          <div>
            <Label>Symbol</Label>
            <Input value="SOXL" readOnly />
          </div>
          <div>
            <Label>Fee Rate (%)</Label>
            <Input
              type="number"
              step="0.0001"
              value={feeRateDraft}
              onChange={(event) => setFeeRateDraft(Number(event.target.value))}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Trades fee = price x quantity x fee rate.
            </p>
          </div>
          <div className="xl:col-span-4">
            <Label>Close History</Label>
            <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
              {closes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No closes saved yet. Use Today&apos;s Fetch Latest or add a close manually.
                </p>
              ) : null}
              {closes.slice(-5).map((record) => (
                <div key={record.date} className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">{record.date}</p>
                  <Input
                    className="mt-2"
                    type="number"
                    value={record.close}
                    onChange={(event) =>
                      setCloses(
                        closes.map((item) =>
                          item.date === record.date
                            ? { ...item, close: Number(event.target.value) }
                            : item,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-3 xl:col-span-4">
            <Button type="submit">
              <Save className="h-4 w-4" />
              Save Settings
            </Button>
            <Button
              type="button"
              className="border-red-300/30 bg-red-500/15 text-red-100 hover:bg-red-500/25"
              onClick={onReset}
            >
              <RotateCcw className="h-4 w-4" />
              End Cycle &amp; Reset
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
