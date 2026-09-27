"use client";

import { formatDate, formatDateTime, timeAgo } from "@/lib/utils";

// Dates render in the viewer's timezone and relative times change every second, so the
// server HTML can legitimately differ from the client — suppress the hydration warning.

export function TimeAgo({ date, className }: { date: string | Date; className?: string }) {
  const iso = new Date(date).toISOString();
  return (
    <time dateTime={iso} title={formatDateTime(date)} className={className} suppressHydrationWarning>
      {timeAgo(date)}
    </time>
  );
}

export function DateText({ date, withTime, options, className }: { date: string | Date | null | undefined; withTime?: boolean; options?: Intl.DateTimeFormatOptions; className?: string }) {
  if (!date) return <span className={className}>—</span>;
  return (
    <time dateTime={new Date(date).toISOString()} className={className} suppressHydrationWarning>
      {withTime ? formatDateTime(date) : formatDate(date, options)}
    </time>
  );
}
