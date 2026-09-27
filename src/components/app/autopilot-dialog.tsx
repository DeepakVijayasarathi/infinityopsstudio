"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, CheckCircle2, Circle, Loader2, MinusCircle, Wand2 } from "lucide-react";
import { streamEvents } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { FormAlert } from "@/components/auth/form-alert";

const CHANNELS = [
  { key: "blog", label: "Blog" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "instagram", label: "Instagram" },
  { key: "x", label: "X" },
  { key: "facebook", label: "Facebook" },
  { key: "email", label: "Email" },
] as const;
type Channel = (typeof CHANNELS)[number]["key"];

const EXAMPLES = ["Get 100 demo bookings for our new product in 4 weeks", "Launch our Diwali sale and drive online orders", "Grow LinkedIn awareness among HR leaders in India"];

type Step = { key: string; label: string; status: "running" | "done" | "skipped" | "error"; detail?: string; href?: string };

const ICON = {
  running: <Loader2 className="size-4 animate-spin text-primary" aria-hidden />,
  done: <CheckCircle2 className="size-4 text-success" aria-hidden />,
  skipped: <MinusCircle className="size-4 text-muted-foreground" aria-hidden />,
  error: <AlertCircle className="size-4 text-danger" aria-hidden />,
};

/** One-click AI campaign: goal in, a full draft campaign out, with live progress. */
export function AutopilotDialog({ open, onOpenChange, initialGoal = "", onDone }: { open: boolean; onOpenChange: (o: boolean) => void; initialGoal?: string; onDone?: (result: { href: string; summary: string }) => void }) {
  const router = useRouter();
  const [goal, setGoal] = React.useState(initialGoal);
  const [audience, setAudience] = React.useState("");
  const [channels, setChannels] = React.useState<Channel[]>(["blog", "linkedin", "instagram", "email"]);
  const [weeks, setWeeks] = React.useState("4");
  const [budget, setBudget] = React.useState("");
  const [steps, setSteps] = React.useState<Step[]>([]);
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<{ href: string; summary: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open && initialGoal) setGoal(initialGoal);
  }, [open, initialGoal]);

  const reset = () => {
    setSteps([]);
    setResult(null);
    setError(null);
  };

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (goal.trim().length < 10) return setError("Describe the goal in a sentence (at least 10 characters).");
    if (!channels.length) return setError("Pick at least one channel.");
    reset();
    setRunning(true);
    const { error: err } = await streamEvents("campaigns/autopilot", { goal, audience: audience || undefined, channels, durationWeeks: Number(weeks), budget: budget ? Number(budget) : undefined }, (event, data) => {
      if (event === "step") {
        const s = data as Step;
        setSteps((prev) => {
          const i = prev.findIndex((p) => p.key === s.key);
          return i < 0 ? [...prev, s] : prev.map((p, j) => (j === i ? s : p));
        });
      } else if (event === "done") {
        setResult(data as { href: string; summary: string });
        onDone?.(data as { href: string; summary: string });
      }
      else if (event === "error") setError((data as { message: string }).message);
    });
    if (err) setError(err);
    setRunning(false);
    router.refresh();
  }

  const close = (o: boolean) => {
    if (running) return; // keep open while building so progress stays visible
    onOpenChange(o);
    if (!o) setTimeout(reset, 200);
  };

  const building = running || steps.length > 0;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="size-5 text-primary" aria-hidden /> AI campaign in one click
          </DialogTitle>
          <DialogDescription>Describe the goal. The AI team builds the strategy, tasks, content, social posts, email and follow-up automation — all as drafts for you to review.</DialogDescription>
        </DialogHeader>

        {error && <FormAlert>{error}</FormAlert>}

        {!building ? (
          <form id="autopilot-form" onSubmit={start} className="space-y-4">
            <Field label="Campaign goal" htmlFor="ap-goal" required>
              <Textarea id="ap-goal" value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} placeholder={EXAMPLES[0]} autoFocus />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => setGoal(ex)} className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground">
                  {ex}
                </button>
              ))}
            </div>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Channels</legend>
              <div className="flex flex-wrap gap-1.5">
                {CHANNELS.map((c) => {
                  const on = channels.includes(c.key);
                  return (
                    <button key={c.key} type="button" aria-pressed={on} onClick={() => setChannels((cs) => (on ? cs.filter((x) => x !== c.key) : [...cs, c.key]))} className={cn("rounded-full border px-3 py-1 text-sm transition", on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Audience" htmlFor="ap-aud" hint="Defaults to your Brand Kit">
                <Input id="ap-aud" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. HR leaders" />
              </Field>
              <Field label="Duration" htmlFor="ap-weeks">
                <Select id="ap-weeks" value={weeks} onChange={(e) => setWeeks(e.target.value)}>
                  {[1, 2, 4, 6, 8, 12].map((w) => (
                    <option key={w} value={w}>
                      {w} week{w > 1 ? "s" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Budget (USD)" htmlFor="ap-budget" hint="Optional">
                <Input id="ap-budget" type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="5000" />
              </Field>
            </div>
          </form>
        ) : (
          <ol className="space-y-2" aria-live="polite">
            {steps.map((s) => (
              <li key={s.key} className="flex items-start gap-3 rounded-lg border border-border p-3">
                <span className="mt-0.5">{ICON[s.status]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{s.label}</p>
                  {s.detail && <p className={cn("truncate text-xs", s.status === "error" ? "text-danger" : "text-muted-foreground")}>{s.detail}</p>}
                </div>
                {s.href && s.status === "done" && !running && (
                  <Link href={s.href} className="shrink-0 text-xs font-medium text-primary hover:underline" onClick={() => onOpenChange(false)}>
                    Open
                  </Link>
                )}
              </li>
            ))}
            {running && (
              <li className="flex items-center gap-3 px-3 text-xs text-muted-foreground">
                <Circle className="size-3 animate-pulse" aria-hidden /> Working… you can keep this open while the AI team drafts everything.
              </li>
            )}
            {result && <p className="rounded-lg bg-success/10 p-3 text-sm">{result.summary}</p>}
          </ol>
        )}

        <DialogFooter>
          {!building ? (
            <>
              <Button type="button" variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" form="autopilot-form">
                <Wand2 /> Build campaign
              </Button>
            </>
          ) : result ? (
            <>
              <Button type="button" variant="outline" onClick={reset}>
                Build another
              </Button>
              <Button asChild>
                <Link href={result.href} onClick={() => onOpenChange(false)}>
                  Open campaign <ArrowRight />
                </Link>
              </Button>
            </>
          ) : (
            <Button type="button" disabled={running} variant="outline" onClick={reset}>
              {running ? "Building…" : "Try again"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Button that opens the autopilot dialog. */
export function AutopilotButton({ variant = "default", label = "AI campaign" }: { variant?: "default" | "outline"; label?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Wand2 /> {label}
      </Button>
      <AutopilotDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
