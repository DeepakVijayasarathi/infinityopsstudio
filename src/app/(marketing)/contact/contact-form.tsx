"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { contactSchema } from "@/lib/schemas";
import { useForm } from "@/hooks/use-form";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { FormAlert } from "@/components/auth/form-alert";

const TYPES = [
  { v: "SALES", label: "Sales enquiry" },
  { v: "SUPPORT", label: "Support" },
  { v: "GENERAL", label: "General" },
] as const;

export function ContactForm({ initialType }: { initialType: "SALES" | "SUPPORT" | "GENERAL" }) {
  const [sent, setSent] = React.useState(false);
  const f = useForm(contactSchema, { type: initialType, name: "", email: "", company: "", teamSize: "", message: "", website: "" });
  const onSubmit = f.submit(async (data) => {
    await api.post("contact", data);
    setSent(true);
  });
  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-10 text-center card-shadow">
        <CheckCircle2 className="size-10 text-success" />
        <h2 className="mt-4 text-xl font-semibold">Message received</h2>
        <p className="mt-2 text-muted-foreground">Thanks, {f.values.name.split(" ")[0]}! We&apos;ve emailed you a confirmation and will reply within one business day.</p>
      </div>
    );
  }
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-6 card-shadow sm:p-8" noValidate>
      <div role="radiogroup" aria-label="Enquiry type" className="grid grid-cols-3 gap-2">
        {TYPES.map((t) => (
          <button
            key={t.v}
            type="button"
            role="radio"
            aria-checked={f.values.type === t.v}
            onClick={() => f.set("type", t.v)}
            className={cn("rounded-lg border px-3 py-2 text-sm font-medium transition", f.values.type === t.v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </button>
        ))}
      </div>
      {f.formError && <FormAlert>{f.formError}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" error={f.errors.name} required>
          <Input {...f.bind("name")} autoComplete="name" />
        </Field>
        <Field label="Work email" htmlFor="email" error={f.errors.email} required>
          <Input {...f.bind("email")} type="email" autoComplete="email" />
        </Field>
        <Field label="Company" htmlFor="company" error={f.errors.company}>
          <Input {...f.bind("company")} autoComplete="organization" />
        </Field>
        <Field label="Team size" htmlFor="teamSize">
          <Select {...f.bind("teamSize")}>
            <option value="">Select</option>
            {["Just me", "2–10", "11–50", "51–200", "201–1,000", "1,000+"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="How can we help?" htmlFor="message" error={f.errors.message} required>
        <Textarea {...f.bind("message")} rows={5} placeholder={f.values.type === "SUPPORT" ? "Describe the issue and your workspace name" : "Tell us about your team and goals"} />
      </Field>
      {/* Honeypot: hidden from humans, bots fill it in. */}
      <div className="hidden" aria-hidden>
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" value={f.values.website} onChange={(e) => f.set("website", e.target.value)} />
      </div>
      <Button type="submit" size="lg" className="w-full" loading={f.submitting}>
        Send message
      </Button>
      <p className="text-center text-xs text-muted-foreground">By submitting, you agree to our privacy policy.</p>
    </form>
  );
}
