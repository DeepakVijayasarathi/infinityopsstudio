import { route } from "@/server/api";
import { listIntegrations } from "@/server/services/integrations";

export const GET = route({}, async ({ ctx }) => listIntegrations(ctx.workspace.id));
