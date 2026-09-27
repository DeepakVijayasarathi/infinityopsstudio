"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { z } from "zod";
import { api } from "@/lib/api-client";
import { password } from "@/lib/schemas";
import { useForm } from "@/hooks/use-form";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { FormAlert } from "./form-alert";

const schema = z.object({ password, confirm: z.string() }).refine((v) => v.password === v.confirm, { message: "Passwords don't match", path: ["confirm"] });

export function ResetForm({ endpoint, title, description }: { endpoint: string; title: string; description: string }) {
  const token = useSearchParams().get("token") ?? "";
  const [done, setDone] = React.useState(false);
  const f = useForm(schema, { password: "", confirm: "" });
  const onSubmit = f.submit(async (data) => {
    await api.post(endpoint, { token, password: data.password });
    setDone(true);
  });
  if (!token) return <FormAlert>This link is missing its token. Request a new one.</FormAlert>;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {done ? (
        <div className="mt-6 space-y-4">
          <FormAlert tone="success">Your password has been updated and all other sessions were signed out.</FormAlert>
          <Button asChild className="w-full" size="lg">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          {f.formError && <FormAlert>{f.formError}</FormAlert>}
          <Field label="New password" htmlFor="password" error={f.errors.password} hint="At least 8 characters with a letter and a number.">
            <Input {...f.bind("password")} type="password" autoComplete="new-password" autoFocus />
          </Field>
          <Field label="Confirm password" htmlFor="confirm" error={f.errors.confirm}>
            <Input {...f.bind("confirm")} type="password" autoComplete="new-password" />
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={f.submitting}>
            Update password
          </Button>
        </form>
      )}
    </div>
  );
}

