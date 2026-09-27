import { z } from "zod";
import { route } from "@/server/api";
import { aiSettingsSchema, platformSettingsSchema } from "@/lib/schemas";
import { DEFAULT_AI_SETTINGS, DEFAULT_PLATFORM_SETTINGS, getSetting } from "@/server/settings";
import { listModels } from "@/server/ai/registry";
import { updateSettings } from "@/server/services/admin";

export const GET = route({ auth: "admin" }, async () => ({
  ai: await getSetting("ai", DEFAULT_AI_SETTINGS),
  platform: await getSetting("platform", DEFAULT_PLATFORM_SETTINGS),
  models: await listModels(),
}));

const body = z.discriminatedUnion("key", [z.object({ key: z.literal("ai"), value: aiSettingsSchema }), z.object({ key: z.literal("platform"), value: platformSettingsSchema })]);
export const PUT = route({ auth: "admin", body }, async ({ user, body }) => {
  await updateSettings(user.id, body.key, body.value);
  return { ok: true };
});
