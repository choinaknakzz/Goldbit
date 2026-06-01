"use client";

import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { PlannedOrder } from "@/lib/types";

function getEstimatedOrderAmount(order: PlannedOrder) {
  if (typeof order.amount === "number") return order.amount;

  if (typeof order.price === "number" && typeof order.quantity === "number") {
    return order.price * order.quantity;
  }

  return null;
}

export function PlannedOrdersTable({ orders }: { orders: PlannedOrder[] }) {
  const [expandedOrderKey, setExpandedOrderKey] = useState<string | null>(null);
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
          {orders.map((order) => {
            const orderKey = `${order.side}-${order.orderType}-${order.priority}`;
            const isExpanded = expandedOrderKey === orderKey;

            return (
              <Fragment key={orderKey}>
                <TR>
                  <TD>
                    <Badge variant={order.side === "BUY" ? "gold" : "muted"}>
                      {order.side}
                    </Badge>
                  </TD>
                  <TD>{order.orderType}</TD>
                  <TD>{formatCurrency(order.price)}</TD>
                  <TD>{formatNumber(order.quantity, 0)}</TD>
                  <TD>{formatCurrency(getEstimatedOrderAmount(order))}</TD>
                  <TD className="w-48 max-w-48 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate" title={order.reason}>
                        {order.reason}
                      </span>
                      <button
                        className="shrink-0 rounded border border-white/10 px-2 py-1 text-xs text-amber-100 transition hover:border-amber-300/40 hover:bg-amber-300/10"
                        type="button"
                        onClick={() =>
                          setExpandedOrderKey(isExpanded ? null : orderKey)
                        }
                      >
                        {isExpanded ? "Hide" : "Details"}
                      </button>
                    </div>
                  </TD>
                </TR>
                {isExpanded ? (
                  <TR>
                    <TD
                      className="whitespace-normal bg-white/[0.02] text-xs leading-5 text-muted-foreground"
                      colSpan={6}
                    >
                      {order.reason}
                    </TD>
                  </TR>
                ) : null}
              </Fragment>
            );
          })}
        </TBody>
      </Table>
      </div>
    </div>
  );
}
