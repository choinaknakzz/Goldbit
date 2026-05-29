"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TradeHistoryTable } from "@/components/trade-history-table";
import { useGoldbitStore } from "@/lib/local-store";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default function HistoryPage() {
  const { cycleArchives, deleteCycleArchive } = useGoldbitStore();
  const [openCycleIds, setOpenCycleIds] = useState<string[]>([]);
  const toggleCycle = (cycleId: string) => {
    setOpenCycleIds((currentIds) =>
      currentIds.includes(cycleId)
        ? currentIds.filter((id) => id !== cycleId)
        : [...currentIds, cycleId],
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">History</h2>
        <p className="mt-1 text-muted-foreground">
          Review completed GoldOrbit cycles archived when data is reset.
        </p>
      </div>

      {cycleArchives.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No completed cycles yet. Use Settings reset after a cycle ends to archive
            the current trades, T updates, closes, and asset path.
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-5">
        {cycleArchives.map((cycle) => {
          const isOpen = openCycleIds.includes(cycle.id);

          return (
            <Card key={cycle.id}>
              <CardHeader>
              <div className="flex flex-col justify-between gap-2 xl:flex-row xl:items-end">
                <div>
                  <CardTitle>{cycle.name}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Cycle period by trade dates: {cycle.tradeStartDate} to{" "}
                    {cycle.tradeEndDate}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Archived {cycle.archivedAt.slice(0, 10)}
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-md border border-border bg-white/[0.03] p-3">
                  <p className="text-xs uppercase text-muted-foreground">Final Assets</p>
                  <p className="mt-2 text-xl font-semibold text-amber-100">
                    {formatCurrency(cycle.finalTotalAssets)}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-white/[0.03] p-3">
                  <p className="text-xs uppercase text-muted-foreground">Asset Change</p>
                  <p className="mt-2 text-xl font-semibold text-amber-100">
                    {formatCurrency(cycle.assetChange)}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-white/[0.03] p-3">
                  <p className="text-xs uppercase text-muted-foreground">Realized PnL</p>
                  <p className="mt-2 text-xl font-semibold text-amber-100">
                    {formatCurrency(cycle.realizedPnl)}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-white/[0.03] p-3">
                  <p className="text-xs uppercase text-muted-foreground">Trades</p>
                  <p className="mt-2 text-xl font-semibold text-amber-100">
                    {cycle.tradeCount} total
                  </p>
                  <p className="text-xs text-muted-foreground">
                    BUY {cycle.buyCount} / SELL {cycle.sellCount}
                  </p>
                </div>
              </section>

              <div className="flex flex-wrap gap-3">
                <Button
                  className="bg-zinc-800 text-amber-100 hover:bg-zinc-700"
                  onClick={() => toggleCycle(cycle.id)}
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  Detail
                </Button>
                <Button
                  className="border-red-300/30 bg-red-500/15 text-red-100 hover:bg-red-500/25"
                  onClick={() => {
                    const confirmed = window.confirm(
                      "Delete this archived cycle? This cannot be undone.",
                    );
                    if (confirmed) deleteCycleArchive(cycle.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>

              {isOpen ? (
                <>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <Table>
                      <THead>
                        <TR>
                          <TH>Date</TH>
                          <TH>Trades</TH>
                          <TH>Buy</TH>
                          <TH>Sell</TH>
                          <TH>Fee</TH>
                          <TH>T</TH>
                          <TH>Assets</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {cycle.dailySnapshots.map((snapshot) => (
                          <TR key={`${cycle.id}-${snapshot.date}`}>
                            <TD>{snapshot.date}</TD>
                            <TD>{snapshot.tradeCount}</TD>
                            <TD>{formatCurrency(snapshot.buyAmount)}</TD>
                            <TD>{formatCurrency(snapshot.sellAmount)}</TD>
                            <TD>{formatCurrency(snapshot.fee)}</TD>
                            <TD>{formatNumber(snapshot.tValue, 4)}</TD>
                            <TD>{formatCurrency(snapshot.totalAssets)}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>

                  <div>
                    <p className="mb-3 text-sm font-medium text-amber-100">
                      Cycle Trades
                    </p>
                    <TradeHistoryTable trades={cycle.trades} />
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
          );
        })}
      </div>
    </div>
  );
}
