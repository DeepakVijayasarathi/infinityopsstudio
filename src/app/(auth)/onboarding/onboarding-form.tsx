"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { workspaceSchema } from "@/lib/schemas";
import { useForm } from "@/hooks/use-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { FormAlert } from "@/components/auth/form-alert";

const INDUSTRIES = ["SaaS", "E-commerce", "Agency", "Professional services", "Healthcare", "Education", "Financial services", "Logistics", "Manufacturing", "Creator / media", "Other"];

export function OnboardingForm({ name }: { name: string }) {
  const router = useRouter();
  const f = useForm(workspaceSchema, { name: `${name.split(" ")[0]}'s Workspace`, industry: "", website: "" });
  const onSubmit = f.submit(async (data) => {
    const ws = await api.post<{ id: string }>("workspaces", data);
    await api.post("workspaces/switch", { workspaceId: ws.id });
    router.push("/app?welcome=1");
    router.refresh();
  });
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Set up your workspace</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your AI workers use this to tailor every output.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        {f.formError && <FormAlert>{f.formError}</FormAlert>}
        <Field label="Workspace name" htmlFor="name" error={f.errors.name}>
          <Input {...f.bind("name")} autoFocus />
        </Field>
        <Field label="Industry" htmlFor="industry" error={f.errors.industry}>
          <Select {...f.bind("industry")}>
            <option value="">Select an industry</option>
            {INDUSTRIES.map((i) => (
              <option key={i}>{i}</option>
            ))}
          </Select>
        </Field>
        <Field label="Website" htmlFor="website" error={f.errors.website} hint="Optional">
          <Input {...f.bind("website")} type="url" placeholder="https://example.com" />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={f.submitting}>
          Create workspace
        </Button>
      </form>
    </div>
  );
}
