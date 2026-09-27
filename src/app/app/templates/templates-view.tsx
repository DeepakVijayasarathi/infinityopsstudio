"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, Mail, Megaphone, Wand2, Workflow, Zap } from "lucide-react";
import { api } from "@/lib/api-client";
import { humanize, TRIGGER_LABELS, type WorkflowTrigger } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutopilotDialog } from "@/components/app/autopilot-dialog";

type Data = {
  campaigns: { key: string; name: string; description: string; objective: string; channels: string[]; durationWeeks: number; tasks: string[]; goal: string }[];
  emails: { key: string; name: string; category: string; subject: string; previewText: string }[];
  automations: { key: string; name: string; description: string; trigger: WorkflowTrigger; steps: string[] }[];
};

export function TemplatesView({ data, initialTab, perms }: { data: Data; initialTab: string; perms: { campaigns: boolean; emails: boolean; automations: boolean } }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [aiGoal, setAiGoal] = React.useState<string | null>(null);

  async function use(kind: "campaign" | "email" | "automation", key: string) {
    setBusy(`${kind}-${key}`);
    try {
      const r = await api.post<{ href: string; name: string }>("templates/apply", { kind, key });
      toast.success(`“${r.name}” created — it's ready to edit`);
      router.push(r.href);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <>
      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="campaigns">
            <Megaphone /> Campaigns
          </TabsTrigger>
          <TabsTrigger value="automations">
            <Workflow /> Automations
          </TabsTrigger>
          <TabsTrigger value="emails">
            <Mail /> Emails
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.campaigns.map((t) => (
              <Card key={t.key} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{t.name}</h2>
                  <Badge>{humanize(t.objective)}</Badge>
                </div>
                <p className="mt-1 flex-1 text-sm text-muted-foreground">{t.description}</p>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="size-3.5" aria-hidden /> {t.durationWeeks} weeks · {t.tasks.length} tasks · {t.channels.join(", ")}
                </p>
                {perms.campaigns ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setAiGoal(t.goal)}>
                      <Wand2 /> Build with AI
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => use("campaign", t.key)} loading={busy === `campaign-${t.key}`}>
                      Use template
                    </Button>
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-muted-foreground">Your role can&apos;t create campaigns.</p>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="automations">
          <div className="grid gap-4 sm:grid-cols-2">
            {data.automations.map((t) => (
              <Card key={t.key} className="flex flex-col p-5">
                <h2 className="font-semibold">{t.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
                <ol className="mt-3 flex-1 space-y-1 text-xs text-muted-foreground">
                  <li className="flex items-center gap-1.5">
                    <Zap className="size-3.5 text-primary" aria-hidden /> When: {TRIGGER_LABELS[t.trigger]?.label ?? humanize(t.trigger)}
                  </li>
                  {t.steps.map((s, i) => (
                    <li key={s} className="pl-5">
                      {i + 1}. {s}
                    </li>
                  ))}
                </ol>
                {perms.automations ? (
                  <Button size="sm" variant="outline" className="mt-4 w-fit" onClick={() => use("automation", t.key)} loading={busy === `automation-${t.key}`}>
                    Use template
                  </Button>
                ) : (
                  <p className="mt-4 text-xs text-muted-foreground">Your role can&apos;t create automations.</p>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="emails">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.emails.map((t) => (
              <Card key={t.key} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{t.name}</h2>
                  <Badge>{t.category}</Badge>
                </div>
                <p className="mt-2 text-sm">{t.subject}</p>
                <p className="mt-1 flex-1 text-xs text-muted-foreground">{t.previewText}</p>
                {perms.emails ? (
                  <Button size="sm" variant="outline" className="mt-4 w-fit" onClick={() => use("email", t.key)} loading={busy === `email-${t.key}`}>
                    Add to my templates
                  </Button>
                ) : (
                  <p className="mt-4 text-xs text-muted-foreground">Your role can&apos;t edit email templates.</p>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      <AutopilotDialog open={aiGoal !== null} onOpenChange={(o) => !o && setAiGoal(null)} initialGoal={aiGoal ?? ""} />
    </>
  );
}
