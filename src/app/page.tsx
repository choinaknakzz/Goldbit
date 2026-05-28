import { ArrowUpRight, CircleDollarSign, Gauge, Wallet } from "lucide-react";
import { ReverseModeWarning } from "@/components/reverse-mode-warning";
import { StatusCard } from "@/components/status-card";
import { StrategySummaryCard } from "@/components/strategy-summary-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { generateNormalDailyPlan } from "@/lib/calculations";
import { mockStrategy } from "@/lib/mock-data";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

export default function DashboardPage() {
  const plan = generateNormalDailyPlan(mockStrategy);
  const totalStatus = mockStrategy.cashBalance + mockStrategy.quantity * mockStrategy.averagePrice;
  const primaryAction = plan.buyOrders[0]?.reason ?? plan.sellOrders[0]?.reason ?? "Review current loop.";

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 rounded-lg border border-amber-300/20 bg-zinc-950/60 p-6 shadow-glow xl:flex-row xl:items-end">
        <div>
          <Badge variant="gold">GoldOrbit</Badge>
          <h2 className="mt-3 text-4xl font-bold text-amber-100">Goldbit</h2>
          <p className="mt-2 text-muted-foreground">Mine gains, loop by loop.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <span className="flex items-center gap-2 text-sm text-zinc-300"><Gauge className="h-4 w-4 text-amber-200" /> {mockStrategy.division}-division</span>
          <span className="flex items-center gap-2 text-sm text-zinc-300"><Wallet className="h-4 w-4 text-amber-200" /> Manual tracking</span>
          <span className="flex items-center gap-2 text-sm text-zinc-300"><CircleDollarSign className="h-4 w-4 text-amber-200" /> SOXL only</span>
        </div>
      </section>

      <StrategySummaryCard strategy={mockStrategy} />
      <ReverseModeWarning warnings={plan.warnings} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatusCard title="T Value" value={formatNumber(mockStrategy.tValue, 4)} detail={`Phase: ${plan.phase}`} />
        <StatusCard title="Average Price" value={formatCurrency(mockStrategy.averagePrice)} detail="Current weighted average" />
        <StatusCard title="Cash Reserve" value={formatCurrency(mockStrategy.cashBalance)} detail="Available manual budget" />
        <StatusCard title="Total Status" value={formatCurrency(totalStatus)} detail="Cash plus position at average price" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s Action</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-foreground">{primaryAction}</p>
            <p className="mt-3 text-sm text-muted-foreground">
              Star Price {formatCurrency(plan.starPrice)} / Buy Point {formatCurrency(plan.buyPrice)} / Sell Point {formatCurrency(plan.sellPrice)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Loop Signal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Star Rate</span>
              <span className="font-semibold">{formatPercent(plan.starRate)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Limit Sell</span>
              <span className="font-semibold">{formatCurrency(plan.limitSellPrice)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-amber-100">
              <ArrowUpRight className="h-4 w-4" />
              Orders are plans only, not brokerage execution.
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
