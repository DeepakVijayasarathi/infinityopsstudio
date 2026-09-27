import type { Metadata } from "next";
import { listModels } from "@/server/ai/registry";
import { DEFAULT_AI_SETTINGS, DEFAULT_PLATFORM_SETTINGS, getSetting } from "@/server/settings";
import { env } from "@/server/env";
import { PageHeader } from "@/components/ui/page-header";
import { AdminSettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  const [ai, platform, models] = await Promise.all([getSetting("ai", DEFAULT_AI_SETTINGS), getSetting("platform", DEFAULT_PLATFORM_SETTINGS), listModels()]);
  const e = env();
  return (
    <>
      <PageHeader title="Platform settings" description="AI provider routing, model pricing and platform-wide switches." />
      <AdminSettingsForm
        ai={ai}
        platform={platform}
        models={models}
        runtime={{ emailProvider: e.EMAIL_PROVIDER, billingProvider: e.BILLING_PROVIDER, storageDriver: e.STORAGE_DRIVER, redis: !!e.REDIS_URL, googleOAuth: !!e.GOOGLE_CLIENT_ID, envDefaultProvider: e.AI_DEFAULT_PROVIDER }}
      />
    </>
  );
}
