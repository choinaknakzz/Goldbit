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

type ChartDatum = {
  date: string;
  fullDate?: string;
  [key: string]: string | number | undefined;
};

export function MetricChart({
  title,
  dataKey,
  data,
  valueType = "number",
  yPaddingRatio = 0.12,
  minimumYUnits,
  yTickStep,
}: {
  title: string;
  dataKey: string;
  data: ChartDatum[];
  valueType?: "number" | "currency";
  yPaddingRatio?: number;
  minimumYUnits?: number;
  yTickStep?: number;
}) {
  const latestValue = data.length > 0 ? data[data.length - 1]?.[dataKey] : null;
  const hasLineData = data.length > 1;
  const numericValues = data
    .map((item) => item[dataKey])
    .filter((value): value is number => typeof value === "number");
  const minValue = Math.min(...numericValues);
  const maxValue = Math.max(...numericValues);
  const range = maxValue - minValue;
  const minimumPadding = minimumYUnits ?? (valueType === "currency" ? 5 : 1);
  const padding =
    range === 0
      ? Math.max(Math.abs(maxValue) * 0.05, minimumPadding)
      : Math.max(range * yPaddingRatio, minimumPadding);
  const domainMin = numericValues.length > 0 ? Math.max(0, minValue - padding) : 0;
  const domainMax = numericValues.length > 0 ? maxValue + padding : 1;
  const steppedTickMin = yTickStep
    ? Math.floor(domainMin / yTickStep) * yTickStep
    : domainMin;
  const steppedTickMax = yTickStep
    ? Math.ceil(domainMax / yTickStep) * yTickStep
    : domainMax;
  const yTicks = yTickStep
    ? Array.from(
        {
          length:
            Math.round((steppedTickMax - steppedTickMin) / yTickStep) + 1,
        },
        (_, index) => Number((steppedTickMin + index * yTickStep).toFixed(4)),
      )
    : undefined;
  const allowDecimalTicks = dataKey === "averagePrice" || dataKey === "tValue";
  const formatValue = (value: string | number | null | undefined) => {
    if (typeof value !== "number") return "-";
    return valueType === "currency" ? formatCurrency(value) : formatNumber(value);
  };
  const formatYAxisTick = (value: number) => {
    if (valueType === "currency") {
      const tickValue = dataKey === "averagePrice" ? value : Math.round(value);
      return formatCurrency(tickValue).replace(".00", "");
    }

    if (dataKey === "tValue") return value.toFixed(1);

    return formatNumber(value, dataKey === "tValue" ? 1 : 0);
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
                <XAxis
                  dataKey="date"
                  minTickGap={18}
                  stroke="#a1a1aa"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  allowDecimals={allowDecimalTicks}
                  domain={[steppedTickMin, steppedTickMax]}
                  tickCount={yTicks ? undefined : 5}
                  ticks={yTicks}
                  tickFormatter={(value) => formatYAxisTick(Number(value))}
                  stroke="#a1a1aa"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={valueType === "currency" ? 72 : 52}
                />
                <Tooltip
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.fullDate ?? "-"
                  }
                  formatter={(value) => formatValue(value as number)}
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
