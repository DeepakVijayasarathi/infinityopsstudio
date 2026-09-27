"use client";

import * as React from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { PLANS } from "@/config/plans";
import { cn, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function PricingTable({ compact }: { compact?: boolean }) {
  const [yearly, setYearly] = React.useState(true);
  return (
    <div>
      <div className="mb-10 flex items-center justify-center gap-3">
        <div className="inline-flex rounded-full border border-border bg-card p-1 text-sm" role="radiogroup" aria-label="Billing interval">
          {[
            { v: false, label: "Monthly" },
            { v: true, label: "Yearly" },
          ].map((o) => (
            <button
              key={o.label}
              role="radio"
              aria-checked={yearly === o.v}
              onClick={() => setYearly(o.v)}
              className={cn("rounded-full px-4 py-1.5 font-medium transition", yearly === o.v ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground")}
            >
              {o.label}
            </button>
          ))}
        </div>
        <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">Save up to 20%</span>
      </div>
      <div className={cn("grid gap-4", compact ? "md:grid-cols-2 xl:grid-cols-5" : "md:grid-cols-2 xl:grid-cols-5")}>
        {PLANS.map((p) => {
          const price = yearly ? p.yearlyPriceCents : p.monthlyPriceCents;
          return (
            <div
              key={p.key}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-card p-6 card-shadow",
                p.highlighted ? "border-primary/60 ring-1 ring-primary/40 xl:-translate-y-2" : "border-border",
              )}
            >
              {p.highlighted && <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">Most popular</span>}
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="mt-1 min-h-10 text-sm text-muted-foreground">{p.tagline}</p>
              <div className="mt-5">
                {price === null ? (
                  <span className="text-3xl font-semibold tracking-tight">Custom</span>
                ) : (
                  <>
                    <span className="text-4xl font-semibold tracking-tight">{formatCurrency(price)}</span>
                    <span className="text-sm text-muted-foreground"> /month</span>
                  </>
                )}
                <p className="mt-1 h-4 text-xs text-muted-foreground">{price ? (yearly ? `Billed ${formatCurrency(price * 12)} yearly` : "Billed monthly") : price === 0 ? "Free forever" : "Annual agreement"}</p>
              </div>
              <Button asChild className="mt-6" variant={p.highlighted ? "default" : "outline"}>
                <Link href={p.key === "ENTERPRISE" ? "/contact?type=SALES" : `/signup?plan=${p.key}`}>{p.key === "ENTERPRISE" ? "Talk to sales" : p.key === "FREE" ? "Start free" : `Start with ${p.name}`}</Link>
              </Button>
              <p className="mt-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">For {p.audience.toLowerCase()}</p>
              <ul className="mt-3 space-y-2.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
