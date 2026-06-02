"use client";

import { MetricChart } from "@/components/metric-chart";
import { TradeHistoryTable } from "@/components/trade-history-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGoldbitStore } from "@/lib/local-store";
import { buildReportSeries } from "@/lib/report-series";
import { formatCurrency } from "@/lib/utils";

export default function ReportPage() {
  const { strategy, trades, tEvents, closeRecords, previousClose } =
    useGoldbitStore();
  const markPrice = previousClose > 0 ? previousClose : strategy.averagePrice;
  const chartSeries = buildReportSeries({
    strategy,
    trades,
    tEvents,
    closeRecords,
    markPrice,
  });
  const averagePriceSeries = chartSeries.filter(
    (point) => point.averagePrice > 0,
  );
  const realizedPnl = trades.reduce((sum, trade) => {
    if (trade.type !== "SELL") return sum;
    return (
      sum +
      (trade.price - trade.averagePriceBefore) * trade.quantity -
      trade.fee
    );
  }, 0);
  const unrealizedPnl =
    strategy.quantity > 0 && strategy.averagePrice > 0
      ? (markPrice - strategy.averagePrice) * strategy.quantity
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Report</h2>
        <p className="mt-1 text-muted-foreground">Track the current cycle&apos;s T value, average price, cash reserve, and position size.</p>
      </div>
      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Realized PnL</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-amber-100">{formatCurrency(realizedPnl)}</p>
            <p className="mt-2 text-sm text-muted-foreground">Closed sell fills minus their recorded average cost and fee.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Unrealized PnL</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-amber-100">{formatCurrency(unrealizedPnl)}</p>
            <p className="mt-2 text-sm text-muted-foreground">Open position marked against latest saved close.</p>
          </CardContent>
        </Card>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <MetricChart
          title="T Value"
          dataKey="tValue"
          data={chartSeries}
          yTickStep={0.5}
        />
        <MetricChart
          title="Total Assets"
          dataKey="totalAssets"
          data={chartSeries}
          valueType="currency"
          yPaddingRatio={0.4}
          minimumYUnits={25}
        />
        <MetricChart
          title="Average Price"
          dataKey="averagePrice"
          data={averagePriceSeries}
          valueType="currency"
        />
        <MetricChart title="Cash Reserve" dataKey="cashBalance" data={chartSeries} valueType="currency" />
        <MetricChart title="Quantity" dataKey="quantity" data={chartSeries} />
      </section>
      <Card>
        <CardHeader><CardTitle>Fill Timeline</CardTitle></CardHeader>
        <CardContent><TradeHistoryTable trades={trades} /></CardContent>
      </Card>
    </div>
  );
}
