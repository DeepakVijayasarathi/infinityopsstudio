"use client";

import { z } from "zod";
import { leadSchema } from "@/lib/schemas";
import { LEAD_SOURCES, LEAD_STATUSES, humanize } from "@/lib/constants";
import { useForm } from "@/hooks/use-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { FormAlert } from "@/components/auth/form-alert";

type Values = { firstName: string; lastName: string; email: string; phone: string; company: string; jobTitle: string; website: string; source: string; status: string; tags: string; value: string; ownerId: string; campaignId: string };

const formSchema = z
  .object({ firstName: z.string(), lastName: z.string(), email: z.string(), phone: z.string(), company: z.string(), jobTitle: z.string(), website: z.string(), source: z.string(), status: z.string(), tags: z.string(), value: z.string(), ownerId: z.string(), campaignId: z.string() })
  .transform((v) => ({
    ...v,
    tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean),
    valueCents: Math.round((parseFloat(v.value) || 0) * 100),
    ownerId: v.ownerId || null,
    campaignId: v.campaignId || null,
    value: undefined,
  }))
  .pipe(leadSchema);

export type LeadInitial = Partial<{ firstName: string; lastName: string | null; email: string | null; phone: string | null; company: string | null; jobTitle: string | null; website: string | null; source: string; status: string; tags: string[]; valueCents: number; ownerId: string | null; campaignId: string | null }>;

export function LeadForm({ initial, members, campaigns, submitLabel, onSubmit, onCancel }: { initial?: LeadInitial; members: { id: string; name: string }[]; campaigns: { id: string; name: string }[]; submitLabel: string; onSubmit: (data: z.output<typeof leadSchema>) => Promise<void>; onCancel?: () => void }) {
  const f = useForm<Values, z.output<typeof leadSchema>>(formSchema, {
    firstName: initial?.firstName ?? "",
    lastName: initial?.lastName ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    company: initial?.company ?? "",
    jobTitle: initial?.jobTitle ?? "",
    website: initial?.website ?? "",
    source: initial?.source ?? "MANUAL",
    status: initial?.status ?? "NEW",
    tags: (initial?.tags ?? []).join(", "),
    value: initial?.valueCents ? String(initial.valueCents / 100) : "",
    ownerId: initial?.ownerId ?? "",
    campaignId: initial?.campaignId ?? "",
  });
  return (
    <form method="post" onSubmit={f.submit(onSubmit)} className="space-y-4" noValidate>
      {f.formError && <FormAlert>{f.formError}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName" error={f.errors.firstName} required>
          <Input {...f.bind("firstName")} autoFocus />
        </Field>
        <Field label="Last name" htmlFor="lastName" error={f.errors.lastName}>
          <Input {...f.bind("lastName")} />
        </Field>
        <Field label="Email" htmlFor="email" error={f.errors.email}>
          <Input {...f.bind("email")} type="email" />
        </Field>
        <Field label="Phone" htmlFor="phone" error={f.errors.phone}>
          <Input {...f.bind("phone")} type="tel" />
        </Field>
        <Field label="Company" htmlFor="company" error={f.errors.company}>
          <Input {...f.bind("company")} />
        </Field>
        <Field label="Job title" htmlFor="jobTitle" error={f.errors.jobTitle}>
          <Input {...f.bind("jobTitle")} />
        </Field>
        <Field label="Status" htmlFor="status">
          <Select {...f.bind("status")}>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Source" htmlFor="source">
          <Select {...f.bind("source")}>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Deal value (USD)" htmlFor="value" error={f.errors.valueCents}>
          <Input {...f.bind("value")} type="number" min={0} step="100" inputMode="decimal" />
        </Field>
        <Field label="Owner" htmlFor="ownerId">
          <Select {...f.bind("ownerId")}>
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Campaign" htmlFor="campaignId">
          <Select {...f.bind("campaignId")}>
            <option value="">None</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tags" htmlFor="tags" hint="Comma separated" error={f.errors.tags}>
          <Input {...f.bind("tags")} placeholder="enterprise, webinar" />
        </Field>
      </div>
      <Field label="Website" htmlFor="website" error={f.errors.website}>
        <Input {...f.bind("website")} type="url" placeholder="https://" />
      </Field>
      <div className="flex justify-end gap-2">
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
