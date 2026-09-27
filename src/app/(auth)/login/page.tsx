import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const ERRORS: Record<string, string> = {
  google_not_configured: "Google sign-in isn't configured on this server yet. Use email and password.",
  oauth_failed: "Google sign-in failed. Please try again.",
  oauth_state: "Your sign-in session expired. Please try again.",
  oauth_forbidden: "This Google account can't be used to sign in.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = sp.next?.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/app";
  if (await getSession()) redirect(next);
  return <LoginForm next={next} initialError={sp.error ? (ERRORS[sp.error] ?? "Sign-in failed.") : null} />;
}
