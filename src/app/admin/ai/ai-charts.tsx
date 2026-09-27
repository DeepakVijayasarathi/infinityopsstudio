"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DonutChart, SimpleBarChart } from "@/components/charts/charts";
import { formatMicros } from "@/lib/utils";

export function AiCharts({ series, byModel }: { series: { date: string; requests: number; costMicros: number }[]; byModel: { name: string; value: number }[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Daily AI cost</CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleBarChart data={series.map((s) => ({ date: s.date, cost: s.costMicros / 1_000_000 }))} xKey="date" series={[{ key: "cost", label: "Cost (USD)", format: (v) => `$${v.toFixed(2)}` }]} height={240} dateAxis />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Cost by model</CardTitle>
        </CardHeader>
        <CardContent>
          <DonutChart stacked data={byModel} height={180} format={formatMicros} />
        </CardContent>
      </Card>
    </div>
  );
}
