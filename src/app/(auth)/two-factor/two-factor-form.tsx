"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { api } from "@/lib/api-client";
import { twoFactorCodeSchema } from "@/lib/schemas";
import { useForm } from "@/hooks/use-form";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { FormAlert } from "@/components/auth/form-alert";

export function TwoFactorForm({ next, email }: { next: string; email: string }) {
  const router = useRouter();
  const [recovery, setRecovery] = React.useState(false);
  const f = useForm(twoFactorCodeSchema, { code: "" });
  const onSubmit = f.submit(async (data) => {
    const res = await api.post<{ method: string; remainingRecoveryCodes?: number }>("auth/2fa/verify", data);
    if (res.method === "recovery_code") toast.warning(`Recovery code used. ${res.remainingRecoveryCodes ?? 0} remaining — generate new codes in Settings.`);
    router.push(next);
    router.refresh();
  });
  return (
    <div>
      <div className="mb-4 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
        <ShieldCheck className="size-6" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Two-factor authentication</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {recovery ? "Enter one of your saved recovery codes." : "Enter the 6-digit code from your authenticator app."} Signing in as <strong>{email}</strong>.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        {f.formError && <FormAlert>{f.formError}</FormAlert>}
        <Field label={recovery ? "Recovery code" : "Authentication code"} htmlFor="code" error={f.errors.code}>
          <Input
            {...f.bind("code")}
            inputMode={recovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            placeholder={recovery ? "XXXXX-XXXXX" : "123 456"}
            className="text-center text-lg tracking-[0.3em]"
            autoFocus
          />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={f.submitting}>
          Verify
        </Button>
      </form>
      <div className="mt-6 space-y-2 text-center text-sm">
        <button type="button" className="font-medium text-primary hover:underline" onClick={() => setRecovery((r) => !r)}>
          {recovery ? "Use authenticator app instead" : "Use a recovery code"}
        </button>
        <p className="text-muted-foreground">
          Lost your device and codes?{" "}
          <Link href="/account-recovery" className="text-primary hover:underline">
            Recover your account
          </Link>
        </p>
      </div>
    </div>
  );
}
