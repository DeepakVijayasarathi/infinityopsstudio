"use client";

import * as React from "react";
import {
  Area,
  AreaChart as RAreaChart,
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart as RLineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { cn, formatCompact } from "@/lib/utils";

// Categorical hues assigned in fixed order — never cycled; >8 series fold into "Other".
export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);

export type SeriesDef = { key: string; label: string; format?: (v: number) => string };

const axisProps = {
  stroke: "var(--chart-axis)",
  tick: { fill: "var(--chart-axis)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

const shortDate = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

function ChartTooltip({ active, payload, label, series, labelFormat }: TooltipProps<number, string> & { series: SeriesDef[]; labelFormat?: (v: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-foreground">{labelFormat ? labelFormat(String(label)) : label}</div>
      {payload.map((p) => {
        const def = series.find((s) => s.key === p.dataKey);
        return (
          <div key={String(p.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
              {def?.label ?? p.name}
            </span>
            <span className="font-medium tabular-nums text-foreground">{def?.format ? def.format(Number(p.value)) : Number(p.value).toLocaleString()}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Legend shown whenever there are 2+ series (identity is never color-alone). */
export function ChartLegend({ series, totals }: { series: SeriesDef[]; totals?: Record<string, number> }) {
  if (series.length < 2) return null;
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm" style={{ background: SERIES[i] }} aria-hidden />
          {s.label}
          {totals?.[s.key] !== undefined && <span className="font-medium text-foreground tabular-nums">{s.format ? s.format(totals[s.key]!) : totals[s.key]!.toLocaleString()}</span>}
        </li>
      ))}
    </ul>
  );
}

type TimeChartProps<T> = { data: T[]; xKey: keyof T & string; series: SeriesDef[]; height?: number; className?: string; stacked?: boolean };

export function TrendAreaChart<T extends Record<string, unknown>>({ data, xKey, series, height = 260, className }: TimeChartProps<T>) {
  const id = React.useId().replace(/:/g, "");
  return (
    <div className={cn("w-full", className)}>
      <ChartLegend series={series} />
      <ResponsiveContainer width="100%" height={height}>
        <RAreaChart data={data} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`${id}-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES[i]} stopOpacity={0.22} />
                <stop offset="100%" stopColor={SERIES[i]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey={xKey} {...axisProps} tickFormatter={shortDate} minTickGap={24} />
          <YAxis {...axisProps} tickFormatter={(v) => formatCompact(Number(v))} width={48} />
          <Tooltip content={<ChartTooltip series={series} labelFormat={shortDate} />} cursor={{ stroke: "var(--chart-axis)", strokeDasharray: "3 3" }} />
          {series.map((s, i) => (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={SERIES[i]} strokeWidth={2} fill={`url(#${id}-${i})`} activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }} dot={false} />
          ))}
        </RAreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendLineChart<T extends Record<string, unknown>>({ data, xKey, series, height = 260, className }: TimeChartProps<T>) {
  return (
    <div className={cn("w-full", className)}>
      <ChartLegend series={series} />
      <ResponsiveContainer width="100%" height={height}>
        <RLineChart data={data} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey={xKey} {...axisProps} tickFormatter={shortDate} minTickGap={24} />
          <YAxis {...axisProps} tickFormatter={(v) => formatCompact(Number(v))} width={48} />
          <Tooltip content={<ChartTooltip series={series} labelFormat={shortDate} />} cursor={{ stroke: "var(--chart-axis)", strokeDasharray: "3 3" }} />
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={SERIES[i]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }} />
          ))}
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimpleBarChart<T extends Record<string, unknown>>({ data, xKey, series, height = 260, className, stacked, horizontal, dateAxis }: TimeChartProps<T> & { horizontal?: boolean; dateAxis?: boolean }) {
  const fmtX = dateAxis ? shortDate : undefined;
  return (
    <div className={cn("w-full", className)}>
      <ChartLegend series={series} />
      <ResponsiveContainer width="100%" height={height}>
        <RBarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 6, right: 8, left: horizontal ? 8 : -12, bottom: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid stroke="var(--chart-grid)" vertical={!!horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" {...axisProps} tickFormatter={(v) => formatCompact(Number(v))} />
              <YAxis type="category" dataKey={xKey} {...axisProps} width={110} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} {...axisProps} tickFormatter={fmtX} minTickGap={16} />
              <YAxis {...axisProps} tickFormatter={(v) => formatCompact(Number(v))} width={48} />
            </>
          )}
          <Tooltip content={<ChartTooltip series={series} labelFormat={fmtX} />} cursor={{ fill: "var(--chart-grid)", opacity: 0.5 }} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={SERIES[i]}
              stackId={stacked ? "s" : undefined}
              stroke="hsl(var(--card))"
              strokeWidth={stacked ? 2 : 0}
              radius={stacked && i < series.length - 1 ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              maxBarSize={36}
            />
          ))}
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Donut with a value legend (the legend doubles as the table view for low-contrast slots). */
export function DonutChart({ data, height = 220, format, stacked }: { data: { name: string; value: number }[]; height?: number; format?: (v: number) => string; stacked?: boolean }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  // Fold series beyond 7 into "Other" so hues are never cycled.
  const rows = data.length > 8 ? [...data.slice(0, 7), { name: "Other", value: data.slice(7).reduce((a, d) => a + d.value, 0) }] : data;
  return (
    <div className={cn("flex flex-col items-center gap-4", !stacked && "sm:flex-row")}>
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<ChartTooltip series={[{ key: "value", label: "Value", format }]} />} />
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="96%" paddingAngle={1.5} stroke="hsl(var(--card))" strokeWidth={2}>
              {rows.map((_, i) => (
                <Cell key={i} fill={SERIES[i]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-xl font-semibold tabular-nums">{format ? format(total) : formatCompact(total)}</div>
            <div className="text-[11px] text-muted-foreground">Total</div>
          </div>
        </div>
      </div>
      <ul className="w-full space-y-1.5 text-sm">
        {rows.map((d, i) => (
          <li key={d.name} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: SERIES[i] }} aria-hidden />
              <span className="truncate">{d.name}</span>
            </span>
            <span className="font-medium tabular-nums">
              {format ? format(d.value) : d.value.toLocaleString()}
              <span className="ml-1.5 text-xs text-muted-foreground">{total ? Math.round((d.value / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Funnel as ordinal horizontal bars (one hue, dark→light) with direct labels and step conversion. */
export function FunnelChart({ stages }: { stages: { stage: string; value: number }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <ol className="space-y-2.5">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1]!.value : null;
        const conv = prev ? s.value / prev : null;
        return (
          <li key={s.stage} className="grid grid-cols-[88px_1fr] items-center gap-3 sm:grid-cols-[110px_1fr_70px]">
            <span className="text-[13px] text-muted-foreground">{s.stage}</span>
            <div className="relative h-8 rounded-md bg-muted" title={`${s.stage}: ${s.value.toLocaleString()}`}>
              <div className="h-full rounded-md transition-[width] duration-700" style={{ width: `${Math.max(2, (s.value / max) * 100)}%`, background: `var(--ordinal-${Math.min(6, i + 1)})` }} />
              <span className="absolute inset-y-0 left-2 flex items-center text-xs font-semibold text-foreground tabular-nums mix-blend-normal">
                <span className="rounded bg-card/85 px-1.5 py-0.5">{s.value.toLocaleString()}</span>
              </span>
            </div>
            <span className="hidden text-right text-xs text-muted-foreground tabular-nums sm:block">{conv !== null ? `${(conv * 100).toFixed(1)}%` : "—"}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Tiny inline trend (no axes) for KPI tiles and table cells. */
export function Sparkline({ data, color = "var(--series-1)", height = 32 }: { data: number[]; color?: string; height?: number }) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RLineChart data={points} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </RLineChart>
    </ResponsiveContainer>
  );
}
