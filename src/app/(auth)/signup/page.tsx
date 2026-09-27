import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your account", description: "Start free with Infinity Ops Studio — your AI marketing operations team." };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ invite?: string; email?: string; plan?: string }> }) {
  if (await getSession()) redirect("/app");
  const sp = await searchParams;
  return <SignupForm inviteToken={sp.invite} email={sp.email} plan={sp.plan} />;
}
