import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { getWorkspaceContext } from "@/server/tenant";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your workspace", robots: { index: false } };

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (await getWorkspaceContext(session.user)) redirect("/app");
  return <OnboardingForm name={session.user.name} />;
}
