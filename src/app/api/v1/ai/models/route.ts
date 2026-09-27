import { route } from "@/server/api";
import { aiSettings, listModels } from "@/server/ai/registry";

export const GET = route({ auth: "user" }, async () => {
  const [models, settings] = await Promise.all([listModels(), aiSettings()]);
  return {
    allowSelection: settings.allowUserModelSelection,
    defaultModel: settings.defaultModel,
    models: models.filter((m) => m.enabled).map(({ inputPerMTok, outputPerMTok, ...m }) => ({ ...m, inputPerMTok, outputPerMTok })),
  };
});
