"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { loginSchema } from "@/lib/schemas";
import { useForm } from "@/hooks/use-form";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { Divider, FormAlert, GoogleButton } from "@/components/auth/form-alert";

export function LoginForm({ next, initialError }: { next: string; initialError: string | null }) {
  const router = useRouter();
  const f = useForm(loginSchema, { email: "", password: "", rememberMe: true });

  const onSubmit = f.submit(async (data) => {
    const res = await api.post<{ status: "ok" | "two_factor_required" }>("auth/login", data);
    if (res.status === "two_factor_required") router.push(`/two-factor?next=${encodeURIComponent(next)}`);
    else {
      router.push(next);
      router.refresh();
    }
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sign in to your Infinity Ops Studio workspace.</p>
      <div className="mt-6">
        <GoogleButton />
      </div>
      <Divider label="or sign in with email" />
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {(f.formError || initialError) && <FormAlert>{f.formError ?? initialError}</FormAlert>}
        <Field label="Work email" htmlFor="email" error={f.errors.email}>
          <Input {...f.bind("email")} type="email" autoComplete="email" placeholder="you@company.com" autoFocus />
        </Field>
        <Field label="Password" htmlFor="password" error={f.errors.password}>
          <Input {...f.bind("password")} type="password" autoComplete="current-password" />
        </Field>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={f.values.rememberMe} onCheckedChange={(v) => f.set("rememberMe", v === true)} aria-label="Remember me for 30 days" />
            Remember me
          </label>
          <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={f.submitting}>
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to Infinity Ops Studio?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
