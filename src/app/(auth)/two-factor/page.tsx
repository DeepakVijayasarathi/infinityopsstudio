import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPendingTwoFactorSession } from "@/server/auth/session";
import { TwoFactorForm } from "./two-factor-form";

export const metadata: Metadata = { title: "Two-factor authentication", robots: { index: false } };

export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const pending = await getPendingTwoFactorSession();
  if (!pending) redirect("/login");
  const sp = await searchParams;
  const next = sp.next?.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/app";
  return <TwoFactorForm next={next} email={pending.user.email} />;
}
