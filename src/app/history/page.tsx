"use client";

import { MetricChart } from "@/components/metric-chart";
import { TradeHistoryTable } from "@/components/trade-history-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGoldbitStore } from "@/lib/local-store";
import { formatCurrency } from "@/lib/utils";

export default function HistoryPage() {
  const { strategy, trades, previousClose } = useGoldbitStore();
  const chartSeries =
    trades.length >= 2
      ? [...trades]
          .sort((left, right) => {
            const dateOrder = left.tradedAt.localeCompare(right.tradedAt);
            return dateOrder === 0 ? left.id.localeCompare(right.id) : dateOrder;
          })
          .map((trade, index) => ({
            date: `${trade.tradedAt} #${index + 1}`,
            tValue: trade.tAfter,
            averagePrice: trade.averagePriceAfter,
            cashBalance: trade.cashAfter,
            quantity: trade.quantityAfter,
            totalAssets: trade.cashAfter + trade.quantityAfter * trade.price,
          }))
      : [
          {
            date: "Now",
            tValue: strategy.tValue,
            averagePrice: strategy.averagePrice,
            cashBalance: strategy.cashBalance,
            quantity: strategy.quantity,
            totalAssets:
              strategy.cashBalance +
              strategy.quantity *
                (previousClose > 0 ? previousClose : strategy.averagePrice),
          },
        ];
  const realizedPnl = trades.reduce((sum, trade) => {
    if (trade.type !== "SELL") return sum;
    return (
      sum +
      (trade.price - trade.averagePriceBefore) * trade.quantity -
      trade.fee
    );
  }, 0);
  const markPrice = previousClose > 0 ? previousClose : strategy.averagePrice;
  const unrealizedPnl =
    strategy.quantity > 0 && strategy.averagePrice > 0
      ? (markPrice - strategy.averagePrice) * strategy.quantity
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">History</h2>
        <p className="mt-1 text-muted-foreground">Track T value, average price, cash reserve, and position size.</p>
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
        <MetricChart title="T Value" dataKey="tValue" data={chartSeries} />
        <MetricChart title="Total Assets" dataKey="totalAssets" data={chartSeries} valueType="currency" />
        <MetricChart title="Average Price" dataKey="averagePrice" data={chartSeries} valueType="currency" />
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
