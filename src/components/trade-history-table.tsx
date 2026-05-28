import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { Trade } from "@/lib/types";

export function TradeHistoryTable({ trades }: { trades: Trade[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <THead>
          <TR>
            <TH>Date</TH>
            <TH>Side</TH>
            <TH>Type</TH>
            <TH>Price</TH>
            <TH>Qty</TH>
            <TH>Amount</TH>
            <TH>T</TH>
            <TH>Reason</TH>
          </TR>
        </THead>
        <TBody>
          {trades.map((trade) => (
            <TR key={trade.id}>
              <TD>{trade.tradedAt}</TD>
              <TD><Badge variant={trade.type === "BUY" ? "gold" : "muted"}>{trade.type}</Badge></TD>
              <TD>{trade.orderType}</TD>
              <TD>{formatCurrency(trade.price)}</TD>
              <TD>{formatNumber(trade.quantity, 0)}</TD>
              <TD>{formatCurrency(trade.amount)}</TD>
              <TD>{formatNumber(trade.tAfter, 4)}</TD>
              <TD className="text-muted-foreground">{trade.reason}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
