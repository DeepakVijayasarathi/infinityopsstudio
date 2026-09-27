"use client";

import { z } from "zod";
import { campaignSchema } from "@/lib/schemas";
import { CAMPAIGN_CHANNELS, CAMPAIGN_OBJECTIVES, humanize } from "@/lib/constants";
import { useForm } from "@/hooks/use-form";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { FormAlert } from "@/components/auth/form-alert";

export type CampaignFormValues = {
  name: string;
  description: string;
  objective: string;
  targetAudience: string;
  budget: string;
  startDate: string;
  endDate: string;
  channels: string[];
};

const toDateInput = (d?: string | Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export function campaignDefaults(c?: Partial<{ name: string; description: string | null; objective: string; targetAudience: string | null; budgetCents: number; startDate: string | null; endDate: string | null; channels: string[] }>): CampaignFormValues {
  return {
    name: c?.name ?? "",
    description: c?.description ?? "",
    objective: c?.objective ?? "LEADS",
    targetAudience: c?.targetAudience ?? "",
    budget: c?.budgetCents ? String(c.budgetCents / 100) : "",
    startDate: toDateInput(c?.startDate),
    endDate: toDateInput(c?.endDate),
    channels: c?.channels ?? [],
  };
}

/** Converts form values into the API payload shared with campaignSchema. */
function toPayload(v: CampaignFormValues) {
  return {
    name: v.name,
    description: v.description || null,
    objective: v.objective,
    targetAudience: v.targetAudience || null,
    budgetCents: Math.round((parseFloat(v.budget) || 0) * 100),
    startDate: v.startDate || null,
    endDate: v.endDate || null,
    channels: v.channels,
  };
}

const formSchema = z
  .object({ name: z.string(), description: z.string(), objective: z.string(), targetAudience: z.string(), budget: z.string(), startDate: z.string(), endDate: z.string(), channels: z.array(z.string()) })
  .transform(toPayload)
  .pipe(campaignSchema);

export function CampaignForm({ initial, submitLabel, onSubmit, onCancel }: { initial: CampaignFormValues; submitLabel: string; onSubmit: (payload: z.output<typeof campaignSchema>) => Promise<void>; onCancel?: () => void }) {
  // Form values → API payload → validated with the same schema the API uses.
  const f = useForm(formSchema, initial);
  const toggleChannel = (c: string) => f.set("channels", f.values.channels.includes(c) ? f.values.channels.filter((x) => x !== c) : [...f.values.channels, c]);
  return (
    <form method="post" onSubmit={f.submit(onSubmit)} className="space-y-4" noValidate>
      {f.formError && <FormAlert>{f.formError}</FormAlert>}
      <Field label="Campaign name" htmlFor="name" error={f.errors.name} required>
        <Input {...f.bind("name")} placeholder="Q4 product launch" autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Objective" htmlFor="objective">
          <Select {...f.bind("objective")}>
            {CAMPAIGN_OBJECTIVES.map((o) => (
              <option key={o} value={o}>
                {humanize(o)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Budget (USD)" htmlFor="budget" error={f.errors.budgetCents}>
          <Input {...f.bind("budget")} type="number" min={0} step="100" inputMode="decimal" placeholder="10000" />
        </Field>
        <Field label="Start date" htmlFor="startDate" error={f.errors.startDate}>
          <Input {...f.bind("startDate")} type="date" />
        </Field>
        <Field label="End date" htmlFor="endDate" error={f.errors.endDate}>
          <Input {...f.bind("endDate")} type="date" min={f.values.startDate || undefined} />
        </Field>
      </div>
      <Field label="Target audience" htmlFor="targetAudience" error={f.errors.targetAudience}>
        <Textarea {...f.bind("targetAudience")} rows={2} placeholder="Who is this for? Role, company size, pain points…" />
      </Field>
      <Field label="Description" htmlFor="description" error={f.errors.description}>
        <Textarea {...f.bind("description")} rows={3} placeholder="Goals, key message, offer…" />
      </Field>
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium">Channels</legend>
        <div className="flex flex-wrap gap-1.5">
          {CAMPAIGN_CHANNELS.map((c) => {
            const on = f.values.channels.includes(c);
            return (
              <button key={c} type="button" aria-pressed={on} onClick={() => toggleChannel(c)} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition", on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                {c}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={f.submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
