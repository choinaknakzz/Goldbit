"use client";

import { DailyTEventForm } from "@/components/daily-t-event-form";
import { OcrTradeReviewCard } from "@/components/ocr-trade-review-card";
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
    dailyPlanSnapshots,
    pendingTrades,
    feeRatePercent,
    addTrade,
    addPendingTrade,
    confirmPendingTrade,
    rejectPendingTrade,
    addDailyTEvent,
  } = useGoldbitStore();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Trades</h2>
        <p className="mt-1 text-muted-foreground">
          Review captured fills, confirm trades, and update daily T changes.
        </p>
      </div>
      <OcrTradeReviewCard
        pendingTrades={pendingTrades}
        onAddPendingTrade={addPendingTrade}
        onConfirmPendingTrade={confirmPendingTrade}
        onRejectPendingTrade={rejectPendingTrade}
      />
      <TradeForm
        strategy={strategy}
        feeRatePercent={feeRatePercent}
        onAddTrade={addTrade}
      />
      <DailyTEventForm
        strategy={strategy}
        trades={trades}
        dailyPlanSnapshots={dailyPlanSnapshots}
        onAddDailyTEvent={addDailyTEvent}
      />
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
