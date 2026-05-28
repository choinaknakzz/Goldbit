import { PlannedOrdersTable } from "@/components/planned-orders-table";
import { ReverseModeWarning } from "@/components/reverse-mode-warning";
import { StatusCard } from "@/components/status-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { generateNormalDailyPlan } from "@/lib/calculations";
import { mockStrategy } from "@/lib/mock-data";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default function TodayPage() {
  const plan = generateNormalDailyPlan(mockStrategy);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Today&apos;s Action</h2>
        <p className="mt-1 text-muted-foreground">Daily SOXL buy and sell plan for the current GoldOrbit loop.</p>
      </div>
      <ReverseModeWarning warnings={plan.warnings} />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatusCard title="Star Price" value={formatCurrency(plan.starPrice)} detail={`T ${formatNumber(plan.tValue, 4)}`} />
        <StatusCard title="Buy Point" value={formatCurrency(plan.buyPrice)} detail="Star Price minus 0.01" />
        <StatusCard title="Sell Point" value={formatCurrency(plan.sellPrice)} detail="LOC quarter sell point" />
        <StatusCard title="LIMIT Sell" value={formatCurrency(plan.limitSellPrice)} detail="Average Price plus 20%" />
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
