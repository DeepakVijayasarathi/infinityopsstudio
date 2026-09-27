import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number, opts: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat("en-US", opts).format(n);
}

export function formatCompact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function formatCurrency(cents: number, currency = "USD", opts: { compact?: boolean } = {}): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: opts.compact || cents % 100 === 0 ? 0 : 2,
    notation: opts.compact ? "compact" : "standard",
  }).format(cents / 100);
}

/** Micro-dollars → "$0.0123" */
export function formatMicros(micros: number): string {
  const dollars = micros / 1_000_000;
  return `$${dollars < 1 ? dollars.toFixed(4) : dollars.toFixed(2)}`;
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDate(date: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", opts).format(new Date(date));
}

export function formatDateTime(date: Date | string | null | undefined): string {
  return formatDate(date, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function timeAgo(date: Date | string): string {
  const diff = Date.now() - new Date(date).getTime();
  const s = Math.round(diff / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(s) < 60) return rtf.format(-s, "second");
  const m = Math.round(s / 60);
  if (Math.abs(m) < 60) return rtf.format(-m, "minute");
  const h = Math.round(m / 60);
  if (Math.abs(h) < 24) return rtf.format(-h, "hour");
  const d = Math.round(h / 24);
  if (Math.abs(d) < 30) return rtf.format(-d, "day");
  return formatDate(date);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
