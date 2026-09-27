"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api-client";
import { emailOnlySchema } from "@/lib/schemas";
import { useForm } from "@/hooks/use-form";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { FormAlert } from "@/components/auth/form-alert";

export default function ForgotPasswordPage() {
  const [sent, setSent] = React.useState(false);
  const f = useForm(emailOnlySchema, { email: "" });
  const onSubmit = f.submit(async (data) => {
    await api.post("auth/forgot-password", data);
    setSent(true);
  });
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1 text-sm text-muted-foreground">We&apos;ll email you a secure link to choose a new password.</p>
      {sent ? (
        <FormAlert tone="success" className="mt-6">
          If an account exists for <strong>{f.values.email}</strong>, a reset link is on its way. It expires in 1 hour.
        </FormAlert>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          {f.formError && <FormAlert>{f.formError}</FormAlert>}
          <Field label="Email" htmlFor="email" error={f.errors.email}>
            <Input {...f.bind("email")} type="email" autoComplete="email" autoFocus />
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={f.submitting}>
            Send reset link
          </Button>
        </form>
      )}
      <Link href="/login" className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to sign in
      </Link>
    </div>
  );
}
