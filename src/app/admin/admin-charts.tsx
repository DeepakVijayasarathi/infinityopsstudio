"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DonutChart, SimpleBarChart } from "@/components/charts/charts";

export function AdminCharts({ signups, byPlan }: { signups: { date: string; count: number }[]; byPlan: { name: string; value: number }[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Signups</CardTitle>
          <CardDescription>New users per day, last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <SimpleBarChart data={signups} xKey="date" series={[{ key: "count", label: "Signups" }]} height={240} dateAxis />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Workspaces by plan</CardTitle>
        </CardHeader>
        <CardContent>
          <DonutChart stacked data={byPlan} height={180} />
        </CardContent>
      </Card>
    </div>
  );
}
