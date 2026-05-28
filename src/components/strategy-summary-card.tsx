import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { StrategyConfig } from "@/lib/types";

export function StrategySummaryCard({ strategy }: { strategy: StrategyConfig }) {
  const marketValue = strategy.quantity * strategy.averagePrice;
  return (
    <Card className="shadow-glow">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Current Loop</CardTitle>
          <Badge variant={strategy.mode === "NORMAL" ? "gold" : "danger"}>{strategy.mode}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Symbol</p>
            <p className="text-2xl font-semibold">{strategy.symbol}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">T Value</p>
            <p className="text-2xl font-semibold">{formatNumber(strategy.tValue, 4)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Cash Reserve</p>
            <p className="text-2xl font-semibold">{formatCurrency(strategy.cashBalance)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Position Value</p>
            <p className="text-2xl font-semibold">{formatCurrency(marketValue)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
