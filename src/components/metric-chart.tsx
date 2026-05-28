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

export function MetricChart({
  title,
  dataKey,
  data,
}: {
  title: string;
  dataKey: string;
  data: Array<Record<string, string | number>>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
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
        </div>
      </CardContent>
    </Card>
  );
}
