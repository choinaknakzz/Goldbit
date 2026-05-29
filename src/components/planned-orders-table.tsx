import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { PlannedOrder } from "@/lib/types";

function getEstimatedOrderAmount(order: PlannedOrder) {
  if (typeof order.price === "number" && typeof order.quantity === "number") {
    return order.price * order.quantity;
  }

  return order.amount ?? null;
}

export function PlannedOrdersTable({ orders }: { orders: PlannedOrder[] }) {
  const totalAmount = orders.reduce((sum, order) => {
    return sum + (getEstimatedOrderAmount(order) ?? 0);
  }, 0);

  if (orders.length === 0) {
    return <p className="rounded-md border border-border bg-white/[0.03] p-4 text-sm text-muted-foreground">No planned orders.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm">
        <span className="text-muted-foreground">Estimated Total</span>
        <span className="font-semibold text-amber-100">{formatCurrency(totalAmount)}</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <THead>
            <TR>
              <TH>Side</TH>
              <TH>Type</TH>
              <TH>Price</TH>
              <TH>Qty</TH>
              <TH>Est. Amount</TH>
              <TH>Reason</TH>
            </TR>
          </THead>
          <TBody>
            {orders.map((order) => (
              <TR key={`${order.side}-${order.orderType}-${order.priority}`}>
                <TD>
                  <Badge variant={order.side === "BUY" ? "gold" : "muted"}>{order.side}</Badge>
                </TD>
                <TD>{order.orderType}</TD>
                <TD>{formatCurrency(order.price)}</TD>
                <TD>{formatNumber(order.quantity, 0)}</TD>
                <TD>{formatCurrency(getEstimatedOrderAmount(order))}</TD>
                <TD className="max-w-md text-muted-foreground">{order.reason}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
