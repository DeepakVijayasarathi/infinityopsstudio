"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api-client";
import { emailOnlySchema } from "@/lib/schemas";
import { useForm } from "@/hooks/use-form";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { FormAlert } from "@/components/auth/form-alert";
import { ResetForm } from "@/components/auth/reset-form";

function RequestRecovery() {
  const [sent, setSent] = React.useState(false);
  const f = useForm(emailOnlySchema, { email: "" });
  const onSubmit = f.submit(async (data) => {
    await api.post("auth/recovery", data);
    setSent(true);
  });
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Account recovery</h1>
      <p className="mt-1 text-sm text-muted-foreground">Lost access to your authenticator and recovery codes? We&apos;ll email a one-time link that turns off two-factor authentication and lets you set a new password.</p>
      {sent ? (
        <FormAlert tone="success" className="mt-6">
          If two-factor authentication is enabled for that account, a recovery link has been sent. It expires in 30 minutes.
        </FormAlert>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          {f.formError && <FormAlert>{f.formError}</FormAlert>}
          <Field label="Account email" htmlFor="email" error={f.errors.email}>
            <Input {...f.bind("email")} type="email" autoComplete="email" autoFocus />
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={f.submitting}>
            Send recovery link
          </Button>
        </form>
      )}
      <Link href="/login" className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to sign in
      </Link>
    </div>
  );
}

function Recovery() {
  const token = useSearchParams().get("token");
  if (token) return <ResetForm endpoint="auth/recovery/complete" title="Recover your account" description="Set a new password. Two-factor authentication will be turned off — re-enable it in Settings afterwards." />;
  return <RequestRecovery />;
}

export default function AccountRecoveryPage() {
  return (
    <React.Suspense>
      <Recovery />
    </React.Suspense>
  );
}
