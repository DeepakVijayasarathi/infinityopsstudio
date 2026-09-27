"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { signupSchema } from "@/lib/schemas";
import { useForm } from "@/hooks/use-form";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { Divider, FormAlert, GoogleButton } from "@/components/auth/form-alert";

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

export function SignupForm({ inviteToken, email, plan }: { inviteToken?: string; email?: string; plan?: string }) {
  const router = useRouter();
  const f = useForm(signupSchema, { name: "", email: email ?? "", password: "", workspaceName: "", inviteToken, acceptTerms: false as boolean });
  const s = strength(f.values.password);

  const onSubmit = f.submit(async (data) => {
    await api.post("auth/signup", data);
    router.push(plan && plan !== "FREE" ? `/app/billing?plan=${plan}` : "/app?welcome=1");
    router.refresh();
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{inviteToken ? "Join your team" : "Create your account"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{inviteToken ? "Create an account to accept your invitation." : "Start free — no credit card required."}</p>
      {!inviteToken && (
        <>
          <div className="mt-6">
            <GoogleButton label="Sign up with Google" />
          </div>
          <Divider label="or sign up with email" />
        </>
      )}
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        {f.formError && <FormAlert>{f.formError}</FormAlert>}
        <Field label="Full name" htmlFor="name" error={f.errors.name}>
          <Input {...f.bind("name")} autoComplete="name" placeholder="Alex Morgan" autoFocus />
        </Field>
        <Field label="Work email" htmlFor="email" error={f.errors.email}>
          <Input {...f.bind("email")} type="email" autoComplete="email" placeholder="you@company.com" readOnly={!!email && !!inviteToken} />
        </Field>
        {!inviteToken && (
          <Field label="Company or workspace name" htmlFor="workspaceName" error={f.errors.workspaceName} hint="You can rename it later.">
            <Input {...f.bind("workspaceName")} autoComplete="organization" placeholder="Acme Inc." />
          </Field>
        )}
        <Field label="Password" htmlFor="password" error={f.errors.password} hint="At least 8 characters with a letter and a number.">
          <Input {...f.bind("password")} type="password" autoComplete="new-password" />
        </Field>
        {f.values.password && (
          <div className="flex gap-1" aria-label={`Password strength ${s} of 4`}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`h-1 flex-1 rounded-full ${i < s ? (s <= 1 ? "bg-danger" : s === 2 ? "bg-warning" : "bg-success") : "bg-muted"}`} />
            ))}
          </div>
        )}
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <Checkbox className="mt-0.5" checked={f.values.acceptTerms} onCheckedChange={(v) => f.set("acceptTerms", v === true)} aria-label="Accept terms" />
          <span>
            I agree to the{" "}
            <Link href="/terms" className="text-primary hover:underline" target="_blank">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-primary hover:underline" target="_blank">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {f.errors.acceptTerms && <p className="text-xs text-danger">{f.errors.acceptTerms}</p>}
        <Button type="submit" className="w-full" size="lg" loading={f.submitting}>
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
