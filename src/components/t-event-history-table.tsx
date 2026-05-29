import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";
import type { DailyTEvent } from "@/lib/types";

function getEventLabel(event: DailyTEvent) {
  if (event.mode === "NORMAL") return event.normalTEvent ?? "-";
  return event.reverseTEvent ? `REVERSE_${event.reverseTEvent}` : "-";
}

export function TEventHistoryTable({ events }: { events: DailyTEvent[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <THead>
          <TR>
            <TH>Date</TH>
            <TH>Mode</TH>
            <TH>Event</TH>
            <TH>T Before</TH>
            <TH>T After</TH>
            <TH>Memo</TH>
          </TR>
        </THead>
        <TBody>
          {events.length === 0 ? (
            <TR>
              <TD colSpan={6} className="text-center text-muted-foreground">
                No daily T updates yet.
              </TD>
            </TR>
          ) : null}
          {events.map((event) => (
            <TR key={event.id}>
              <TD>{event.date}</TD>
              <TD>{event.mode}</TD>
              <TD>{getEventLabel(event)}</TD>
              <TD>{formatNumber(event.tBefore, 4)}</TD>
              <TD>{formatNumber(event.tAfter, 4)}</TD>
              <TD className="text-muted-foreground">{event.memo}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
