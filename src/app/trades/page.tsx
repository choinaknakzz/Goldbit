"use client";

import { DailyTEventForm } from "@/components/daily-t-event-form";
import { TEventHistoryTable } from "@/components/t-event-history-table";
import { TradeForm } from "@/components/trade-form";
import { TradeHistoryTable } from "@/components/trade-history-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGoldbitStore } from "@/lib/local-store";

export default function TradesPage() {
  const {
    strategy,
    trades,
    tEvents,
    feeRatePercent,
    addTrade,
    addDailyTEvent,
  } = useGoldbitStore();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Trades</h2>
        <p className="mt-1 text-muted-foreground">Enter manual fills and preview strategy state changes.</p>
      </div>
      <TradeForm
        strategy={strategy}
        feeRatePercent={feeRatePercent}
        onAddTrade={addTrade}
      />
      <DailyTEventForm strategy={strategy} onAddDailyTEvent={addDailyTEvent} />
      <Card>
        <CardHeader>
          <CardTitle>Trade History</CardTitle>
        </CardHeader>
        <CardContent>
          <TradeHistoryTable trades={trades} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Daily T History</CardTitle>
        </CardHeader>
        <CardContent>
          <TEventHistoryTable events={tEvents} />
        </CardContent>
      </Card>
    </div>
  );
}
