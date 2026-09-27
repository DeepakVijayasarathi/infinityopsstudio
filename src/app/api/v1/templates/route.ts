import { route } from "@/server/api";
import { listTemplates } from "@/server/services/templates";

export const GET = route({}, async () => listTemplates());
