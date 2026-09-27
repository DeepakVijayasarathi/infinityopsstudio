"use client";

import { useId } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  // Unique gradient id: duplicate ids inside hidden elements make the fill disappear.
  const id = `ios-logo-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset=".55" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id})`} />
      <path d="M20.5 24c-4.7 0-8 3.6-8 8s3.3 8 8 8c6.6 0 11.4-16 23-16 4.7 0 8 3.6 8 8s-3.3 8-8 8c-11.6 0-16.4-16-23-16Z" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ href = "/", className, compact }: { href?: string; className?: string; compact?: boolean }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5 font-semibold tracking-tight", className)} aria-label="Infinity Ops Studio home">
      <LogoMark className="size-7" />
      {!compact && (
        <span className="text-[15px]">
          Infinity Ops <span className="text-muted-foreground font-medium">Studio</span>
        </span>
      )}
    </Link>
  );
}
