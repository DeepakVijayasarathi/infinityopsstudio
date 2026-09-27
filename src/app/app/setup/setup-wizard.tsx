"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Building2, Check, PartyPopper, Plug, Rocket, UserPlus, Wand2, Workflow } from "lucide-react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { AutopilotDialog } from "@/components/app/autopilot-dialog";
import { mergeDraft, WebsiteAutofill } from "@/components/app/website-autofill";

type Kit = { companyName: string; website: string | null; industry: string | null; tagline: string | null; targetAudience: string | null; voice: string | null };
type Perms = { brand: boolean; campaigns: boolean; automations: boolean; members: boolean; integrations: boolean };

const STEPS = [
  { key: "business", label: "Your business", icon: Building2 },
  { key: "campaign", label: "First campaign", icon: Rocket },
  { key: "automate", label: "Automations", icon: Workflow },
  { key: "done", label: "Done", icon: PartyPopper },
] as const;

export function SetupWizard({ kit, campaigns, automations, perms }: { kit: Kit; campaigns: { key: string; name: string; description: string; goal: string }[]; automations: { key: string; name: string; description: string }[]; perms: Perms }) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [v, setV] = React.useState<Kit>(kit);
  const [busy, setBusy] = React.useState(false);
  const [goal, setGoal] = React.useState("");
  const [aiOpen, setAiOpen] = React.useState(false);
  const [campaignDone, setCampaignDone] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<string[]>(automations.slice(0, 1).map((a) => a.key));
  const [created, setCreated] = React.useState<string[]>([]);
  const text = (k: keyof Kit) => ({ value: v[k] ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value })) });

  async function saveBusiness() {
    if (!perms.brand) return setStep(1);
    if (!v.companyName.trim()) return toast.error("Add your company name");
    setBusy(true);
    try {
      await api.put("brand", { companyName: v.companyName.trim(), website: v.website || null, industry: v.industry || null, tagline: v.tagline || null, targetAudience: v.targetAudience || null, voice: v.voice || null });
      setCreated((c) => [...c, "Brand Kit saved"]);
      setStep(1);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function applyCampaignTemplate(key: string) {
    setBusy(true);
    try {
      const r = await api.post<{ name: string; href: string }>("templates/apply", { kind: "campaign", key });
      setCampaignDone(r.href);
      setCreated((c) => [...c, `Campaign “${r.name}”`]);
      setStep(2);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveAutomations() {
    setBusy(true);
    try {
      for (const key of picked) {
        const r = await api.post<{ name: string }>("templates/apply", { kind: "automation", key });
        setCreated((c) => [...c, `Automation “${r.name}” (off until you enable it)`]);
      }
      setStep(3);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Let&apos;s set up your AI marketing team</h1>
        <p className="mt-1 text-sm text-muted-foreground">About 5 minutes. Every step can be skipped and changed later.</p>
      </div>

      <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Setup progress">
        {STEPS.map((s, i) => (
          <li key={s.key} aria-current={i === step ? "step" : undefined} className={cn("flex flex-col gap-1.5 rounded-lg border p-2.5 text-xs sm:flex-row sm:items-center sm:text-sm", i === step ? "border-primary bg-primary/5 font-medium" : i < step ? "border-border text-muted-foreground" : "border-dashed border-border text-muted-foreground")}>
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[11px]", i < step ? "bg-success text-white" : i === step ? "bg-primary text-primary-foreground" : "bg-muted")}>{i < step ? <Check className="size-3.5" aria-hidden /> : i + 1}</span>
            <span className="truncate">{s.label}</span>
          </li>
        ))}
      </ol>

      <Card>
        <CardContent className="space-y-5 pt-6">
          {step === 0 && (
            <>
              <div>
                <h2 className="text-lg font-semibold">Tell us about your business</h2>
                <p className="text-sm text-muted-foreground">Your AI workers use this on every request so everything sounds like you.</p>
              </div>
              {perms.brand ? (
                <>
                  <WebsiteAutofill initialUrl={v.website ?? ""} onDraft={(d) => setV((x) => mergeDraft(x, d))} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Company name" htmlFor="w-name" required>
                      <Input id="w-name" {...text("companyName")} />
                    </Field>
                    <Field label="Industry" htmlFor="w-ind">
                      <Input id="w-ind" {...text("industry")} placeholder="e.g. Logistics software" />
                    </Field>
                    <Field label="What you do, in one line" htmlFor="w-tag" className="sm:col-span-2">
                      <Input id="w-tag" {...text("tagline")} placeholder="e.g. Route planning that saves fleets 15% on fuel" />
                    </Field>
                    <Field label="Who you sell to" htmlFor="w-aud" className="sm:col-span-2">
                      <Textarea id="w-aud" rows={2} {...text("targetAudience")} placeholder="e.g. Operations managers at mid-size logistics companies in India" />
                    </Field>
                    <Field label="Brand voice" htmlFor="w-voice" className="sm:col-span-2" hint="How should your content sound?">
                      <Input id="w-voice" {...text("voice")} placeholder="e.g. Friendly, expert and to the point" />
                    </Field>
                  </div>
                </>
              ) : (
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">An admin manages the Brand Kit for this workspace. Continue to the next step.</p>
              )}
              <div className="flex justify-between">
                <Button asChild variant="ghost">
                  <Link href="/app">Skip setup</Link>
                </Button>
                <Button onClick={saveBusiness} loading={busy}>
                  Save and continue <ArrowRight />
                </Button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <h2 className="text-lg font-semibold">Launch your first campaign</h2>
                <p className="text-sm text-muted-foreground">Describe a goal and the AI builds the whole campaign as drafts, or start from a proven template.</p>
              </div>
              {campaignDone ? (
                <p className="flex items-center gap-2 rounded-lg bg-success/10 p-3 text-sm">
                  <Check className="size-4 text-success" aria-hidden /> Campaign created.
                  <Link href={campaignDone} className="font-medium text-primary hover:underline">
                    Open it
                  </Link>
                </p>
              ) : perms.campaigns ? (
                <>
                  <Field label="What do you want to achieve?" htmlFor="w-goal">
                    <Textarea id="w-goal" rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Get 100 demo bookings for our new product in 4 weeks" />
                  </Field>
                  <Button onClick={() => (goal.trim().length < 10 ? toast.error("Describe the goal in a sentence") : setAiOpen(true))}>
                    <Wand2 /> Build it with AI
                  </Button>
                  <div>
                    <p className="mb-2 text-sm font-medium">Or start from a template</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {campaigns.slice(0, 4).map((c) => (
                        <button key={c.key} type="button" disabled={busy} onClick={() => applyCampaignTemplate(c.key)} className="rounded-lg border border-border p-3 text-left transition hover:border-primary disabled:opacity-60">
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="line-clamp-2 text-xs text-muted-foreground">{c.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Your role can&apos;t create campaigns. Continue to the next step.</p>
              )}
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(0)}>
                  <ArrowLeft /> Back
                </Button>
                <Button variant={campaignDone ? "default" : "outline"} onClick={() => setStep(2)}>
                  {campaignDone ? "Continue" : "Skip for now"} <ArrowRight />
                </Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <h2 className="text-lg font-semibold">Put busywork on autopilot</h2>
                <p className="text-sm text-muted-foreground">Pick automations to add. They start switched off so you can review them first.</p>
              </div>
              {perms.automations ? (
                <div className="space-y-2">
                  {automations.map((a) => {
                    const on = picked.includes(a.key);
                    return (
                      <label key={a.key} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3", on ? "border-primary bg-primary/5" : "border-border")}>
                        <Checkbox className="mt-0.5" checked={on} onCheckedChange={(c) => setPicked((p) => (c ? [...p, a.key] : p.filter((k) => k !== a.key)))} aria-label={a.name} />
                        <span>
                          <span className="block text-sm font-medium">{a.name}</span>
                          <span className="block text-xs text-muted-foreground">{a.description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Your role can&apos;t create automations. Continue to finish.</p>
              )}
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  <ArrowLeft /> Back
                </Button>
                <Button onClick={() => (perms.automations && picked.length ? saveAutomations() : setStep(3))} loading={busy}>
                  {perms.automations && picked.length ? `Add ${picked.length} automation${picked.length > 1 ? "s" : ""}` : "Continue"} <ArrowRight />
                </Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-success/10 text-success">
                  <PartyPopper className="size-6" aria-hidden />
                </span>
                <h2 className="mt-3 text-lg font-semibold">You&apos;re all set</h2>
                <p className="text-sm text-muted-foreground">Your AI team is ready. Here&apos;s what we set up:</p>
              </div>
              {created.length > 0 && (
                <ul className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
                  {created.map((c) => (
                    <li key={c} className="flex items-center gap-2">
                      <Check className="size-4 text-success" aria-hidden /> {c}
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {perms.integrations && (
                  <Link href="/app/social?tab=accounts" className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm hover:border-primary">
                    <Plug className="size-4 text-primary" aria-hidden /> Connect your social accounts
                  </Link>
                )}
                {perms.members && (
                  <Link href="/app/settings/team" className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm hover:border-primary">
                    <UserPlus className="size-4 text-primary" aria-hidden /> Invite your team
                  </Link>
                )}
              </div>
              <div className="flex justify-center">
                <Button onClick={() => router.push("/app")}>
                  Go to dashboard <ArrowRight />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AutopilotDialog
        open={aiOpen}
        initialGoal={goal}
        onDone={(r) => {
          setCampaignDone(r.href);
          setCreated((c) => [...c, "AI-built campaign with strategy, content and drafts"]);
        }}
        onOpenChange={(o) => {
          setAiOpen(o);
          if (!o) router.refresh();
        }}
      />
    </div>
  );
}
