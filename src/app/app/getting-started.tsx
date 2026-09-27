"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Rocket, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";

type Step = { key: string; label: string; done: boolean; href: string };

export function GettingStarted({ steps, forceOpen }: { steps: Step[]; forceOpen?: boolean }) {
  const done = steps.filter((s) => s.done).length;
  const [hidden, setHidden] = React.useState(true);
  React.useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem("ios:getting-started") === "dismissed";
    } catch {
      /* storage unavailable */
    }
    setHidden(!forceOpen && (dismissed || done === steps.length));
  }, [done, steps.length, forceOpen]);
  if (hidden) return null;
  const dismiss = () => {
    try {
      localStorage.setItem("ios:getting-started", "dismissed");
    } catch {
      /* ignore */
    }
    setHidden(true);
  };
  return (
    <Card className="relative overflow-hidden border-primary/25 p-5">
      <div className="bg-hero-glow absolute inset-0 opacity-70" aria-hidden />
      <div className="relative">
        <button onClick={dismiss} className="absolute right-0 top-0 rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Dismiss getting started">
          <X className="size-4" />
        </button>
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Rocket className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">Get set up in 5 steps</h2>
            <p className="text-sm text-muted-foreground">
              {done} of {steps.length} complete
            </p>
          </div>
        </div>
        <Progress value={(done / steps.length) * 100} className="mt-4" />
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((s) => (
            <li key={s.key}>
              <Link href={s.href} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm transition hover:border-primary/40">
                {s.done ? <CheckCircle2 className="size-4 shrink-0 text-success" /> : <Circle className="size-4 shrink-0 text-muted-foreground" />}
                <span className={s.done ? "text-muted-foreground line-through" : ""}>{s.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
