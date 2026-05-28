"use client";

import { DailyCloseCard } from "@/components/daily-close-card";
import { PlannedOrdersTable } from "@/components/planned-orders-table";
import { ReverseModeWarning } from "@/components/reverse-mode-warning";
import { StatusCard } from "@/components/status-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFirstBuyLocPrice } from "@/lib/calculations";
import { useGoldbitStore } from "@/lib/local-store";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

export default function TodayPage() {
  const { plan, previousClose, closeRecords, lastFiveCloses, strategy, updateLatestClose } =
    useGoldbitStore();
  const isFirstBuy = plan.phase === "FIRST_BUY";
  const firstBuyLocPrice =
    isFirstBuy && previousClose > 0 ? getFirstBuyLocPrice(previousClose) : undefined;
  const normalStarRateFormula =
    strategy.division === 20
      ? `(20 - 2 x ${formatNumber(plan.tValue, 4)})%`
      : `(20 - ${formatNumber(plan.tValue, 4)})%`;
  const reverseStarFormula =
    lastFiveCloses.length === 5
      ? `(${lastFiveCloses.map((close) => formatCurrency(close)).join(" + ")}) / 5`
      : "Recent 5 closes average";
  const starPriceDetail =
    plan.mode === "NORMAL" ? (
      <span className="space-y-1">
        <span className="block">
          Star Rate: {normalStarRateFormula} = {formatPercent(plan.starRate)}
        </span>
        <span className="block">
          {formatCurrency(plan.averagePrice)} x (1 +{" "}
          {formatPercent(plan.starRate)}) = {formatCurrency(plan.starPrice)}
        </span>
      </span>
    ) : (
      <span>
        {reverseStarFormula} = {formatCurrency(plan.starPrice)}
      </span>
    );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Today&apos;s Action</h2>
        <p className="mt-1 text-muted-foreground">Daily SOXL buy and sell plan for the current GoldOrbit loop.</p>
      </div>
      <DailyCloseCard
        previousClose={previousClose}
        closeRecords={closeRecords}
        onSave={updateLatestClose}
      />
      <ReverseModeWarning warnings={plan.warnings} />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {isFirstBuy ? (
          <>
            <StatusCard
              title="Latest Close"
              value={formatCurrency(previousClose || undefined)}
              detail="Used for first buy LOC"
            />
            <StatusCard
              title="First Buy LOC"
              value={formatCurrency(firstBuyLocPrice)}
              detail="Previous Close x 1.12"
            />
            <StatusCard
              title="T Value"
              value={formatNumber(plan.tValue, 4)}
              detail="First buy state"
            />
            <StatusCard
              title="Buy Budget"
              value={formatCurrency(plan.buyOrders[0]?.amount)}
              detail="Cash divided by division"
            />
          </>
        ) : (
          <>
            <StatusCard title="Star Price" value={formatCurrency(plan.starPrice)} detail={starPriceDetail} />
            <StatusCard title="Buy Point" value={formatCurrency(plan.buyPrice)} detail="Star Price minus 0.01" />
            <StatusCard title="Sell Point" value={formatCurrency(plan.sellPrice)} detail="LOC quarter sell point" />
            <StatusCard title="LIMIT Sell" value={formatCurrency(plan.limitSellPrice)} detail="Average Price plus 20%" />
          </>
        )}
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>LOC Buy Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <PlannedOrdersTable orders={plan.buyOrders} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sell Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <PlannedOrdersTable orders={plan.sellOrders} />
          </CardContent>
        </Card>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Expected T Change</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
          <p>Full buy: T + 1</p>
          <p>Half buy: T + 0.5</p>
          <p>Quarter sell: T x 0.75</p>
        </CardContent>
      </Card>
    </div>
  );
}
