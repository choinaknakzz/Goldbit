"use client";

import { type FormEvent, useEffect, useState } from "react";
import { CalendarDays, Download, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/form";
import { formatCurrency, formatKoreaDateTime } from "@/lib/utils";
import type { CloseRecord } from "@/lib/types";

export function DailyCloseCard({
  previousClose,
  closeRecords,
  onSave,
}: {
  previousClose: number;
  closeRecords: CloseRecord[];
  onSave: (record: CloseRecord) => void;
}) {
  const [draft, setDraft] = useState(previousClose);
  const [draftDate, setDraftDate] = useState(new Date().toISOString().slice(0, 10));
  const [quoteMeta, setQuoteMeta] = useState<{
    source: string;
    latestClose: number;
    priorClose: number | null;
    currentPrice: number;
    latestCloseTime: string | null;
    currentPriceTime: string | null;
  } | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(previousClose);
  }, [previousClose]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Previous Close</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 xl:grid-cols-[1fr_auto]"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (!Number.isFinite(draft) || draft <= 0) {
              setError("Enter a previous close greater than 0, or use Fetch Latest.");
              return;
            }
            setError("");
            onSave({ date: draftDate, close: draft, source: "Manual" });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Close Date</Label>
              <Input
                type="date"
                value={draftDate}
                onChange={(event) => setDraftDate(event.target.value)}
              />
            </div>
            <div>
            <Label>SOXL Latest Regular Close</Label>
            <Input
              type="number"
              step="0.01"
              value={draft}
              onChange={(event) => setDraft(Number(event.target.value))}
            />
            </div>
          </div>
          <Button type="submit" className="self-end">
            <Save className="h-4 w-4" />
            Update Plan
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            className="h-9 bg-zinc-800 text-amber-100 hover:bg-zinc-700"
            disabled={isFetching}
            onClick={async () => {
              setIsFetching(true);
              try {
                const response = await fetch("/api/quotes/soxl", {
                  cache: "no-store",
                });
                if (!response.ok) throw new Error("Quote request failed.");
                const quote = (await response.json()) as {
                  latestClose: number;
                  latestCloseDate: string;
                  priorClose: number | null;
                  currentPrice: number;
                  latestCloseTime: string | null;
                  currentPriceTime: string | null;
                  source: string;
                };
                setDraft(quote.latestClose);
                setDraftDate(quote.latestCloseDate);
                onSave({
                  date: quote.latestCloseDate,
                  close: quote.latestClose,
                  source: quote.source,
                });
                setQuoteMeta(quote);
                setError("");
              } finally {
                setIsFetching(false);
              }
            }}
          >
            <Download className="h-4 w-4" />
            Fetch Latest
          </Button>
          {quoteMeta ? (
            <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
              <span>Source: {quoteMeta.source}</span>
              <span>Latest Close: {formatCurrency(quoteMeta.latestClose)}</span>
              <span>Current Price: {formatCurrency(quoteMeta.currentPrice)}</span>
            </div>
          ) : null}
        </div>
        {quoteMeta?.latestCloseTime ? (
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            <p>Latest close time: {formatKoreaDateTime(quoteMeta.latestCloseTime)} KST</p>
            {quoteMeta.currentPriceTime ? (
              <p>Current price time: {formatKoreaDateTime(quoteMeta.currentPriceTime)} KST</p>
            ) : null}
          </div>
        ) : null}
        {error ? <p className="mt-2 text-xs text-red-200">{error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 text-amber-100">
            <CalendarDays className="h-3.5 w-3.5" />
            Close history
          </span>
          {closeRecords.length === 0 ? (
            <span className="rounded-md border border-border px-2 py-1">
              No closes saved yet.
            </span>
          ) : null}
          {closeRecords.slice(-5).map((record) => (
            <span
              key={record.date}
              className="rounded-md border border-border px-2 py-1"
            >
              {record.date}: {formatCurrency(record.close)}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
