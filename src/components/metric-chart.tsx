"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/utils";

export function MetricChart({
  title,
  dataKey,
  data,
  valueType = "number",
}: {
  title: string;
  dataKey: string;
  data: Array<Record<string, string | number>>;
  valueType?: "number" | "currency";
}) {
  const latestValue = data.length > 0 ? data[data.length - 1]?.[dataKey] : null;
  const hasLineData = data.length > 1;
  const formatValue = (value: string | number | null | undefined) => {
    if (typeof value !== "number") return "-";
    return valueType === "currency" ? formatCurrency(value) : formatNumber(value);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          {hasLineData ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="date" stroke="#a1a1aa" tickLine={false} axisLine={false} />
                <YAxis stroke="#a1a1aa" tickLine={false} axisLine={false} width={52} />
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8,
                  }}
                />
                <Line type="monotone" dataKey={dataKey} stroke="#f5c85f" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full flex-col items-center justify-center rounded-md border border-dashed border-border bg-white/[0.02] text-center">
              <p className="text-3xl font-semibold text-amber-100">
                {formatValue(latestValue)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Chart appears after at least two trades are recorded.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
