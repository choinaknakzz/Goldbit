import { TradeForm } from "@/components/trade-form";
import { TradeHistoryTable } from "@/components/trade-history-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockStrategy, mockTrades } from "@/lib/mock-data";

export default function TradesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Trades</h2>
        <p className="mt-1 text-muted-foreground">Enter manual fills and preview strategy state changes.</p>
      </div>
      <TradeForm strategy={mockStrategy} />
      <Card>
        <CardHeader>
          <CardTitle>Trade History</CardTitle>
        </CardHeader>
        <CardContent>
          <TradeHistoryTable trades={mockTrades} />
        </CardContent>
      </Card>
    </div>
  );
}
