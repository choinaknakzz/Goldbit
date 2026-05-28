import { MetricChart } from "@/components/metric-chart";
import { TradeHistoryTable } from "@/components/trade-history-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { historySeries, mockStrategy, mockTrades } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

export default function HistoryPage() {
  const unrealizedPnl = mockStrategy.quantity * (mockStrategy.averagePrice * 1.03 - mockStrategy.averagePrice);
  const realizedPnl = 186.42;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">History</h2>
        <p className="mt-1 text-muted-foreground">Track T value, average price, cash reserve, and position size.</p>
      </div>
      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Realized PnL</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold text-amber-100">{formatCurrency(realizedPnl)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Unrealized PnL</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-semibold text-amber-100">{formatCurrency(unrealizedPnl)}</p></CardContent>
        </Card>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <MetricChart title="T Value" dataKey="tValue" data={historySeries} />
        <MetricChart title="Average Price" dataKey="averagePrice" data={historySeries} />
        <MetricChart title="Cash Reserve" dataKey="cashBalance" data={historySeries} />
        <MetricChart title="Quantity" dataKey="quantity" data={historySeries} />
      </section>
      <Card>
        <CardHeader><CardTitle>Fill Timeline</CardTitle></CardHeader>
        <CardContent><TradeHistoryTable trades={mockTrades} /></CardContent>
      </Card>
    </div>
  );
}
