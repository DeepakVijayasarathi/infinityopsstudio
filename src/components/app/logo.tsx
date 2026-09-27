"use client";

import { useId } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { MARK_ARROW_HEAD, MARK_ARROW_SHAFT, MARK_LOOP, MARK_STOPS, MARK_VIEWBOX } from "@/lib/brand";

export function LogoMark({ className }: { className?: string }) {
  // Unique gradient id: duplicate ids inside hidden elements make the fill disappear.
  const id = `ios-logo-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox={MARK_VIEWBOX} className={cn("h-7 w-auto", className)} aria-hidden>
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="200" x2="720" y2="200">
          {MARK_STOPS.map(([o, c]) => (
            <stop key={o} offset={o} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      <circle cx="62" cy="58" r="52" fill={`url(#${id})`} />
      <path d={MARK_LOOP} fill="none" stroke={`url(#${id})`} strokeWidth="84" />
      <path d={MARK_ARROW_SHAFT} fill="none" stroke={`url(#${id})`} strokeWidth="56" />
      <path d={MARK_ARROW_HEAD} fill={`url(#${id})`} />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("text-[16px] font-bold tracking-tight text-brand-ink", className)}>
      InfinityOps <span className="font-semibold text-brand">Studio</span>
    </span>
  );
}

export function Logo({ href = "/", className, compact }: { href?: string; className?: string; compact?: boolean }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5", className)} aria-label="InfinityOps Studio home">
      <LogoMark className="h-6" />
      {!compact && <Wordmark />}
    </Link>
  );
}
