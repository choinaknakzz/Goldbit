import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { PlannedOrder } from "@/lib/types";

export function PlannedOrdersTable({ orders }: { orders: PlannedOrder[] }) {
  if (orders.length === 0) {
    return <p className="rounded-md border border-border bg-white/[0.03] p-4 text-sm text-muted-foreground">No planned orders.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <THead>
          <TR>
            <TH>Side</TH>
            <TH>Type</TH>
            <TH>Price</TH>
            <TH>Qty</TH>
            <TH>Amount</TH>
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
              <TD>{formatCurrency(order.amount)}</TD>
              <TD className="max-w-md text-muted-foreground">{order.reason}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
