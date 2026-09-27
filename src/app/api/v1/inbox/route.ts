import { z } from "zod";
import { route } from "@/server/api";
import { paginationSchema } from "@/server/pagination";
import { listConversations } from "@/server/services/inbox";

const query = paginationSchema.extend({
  status: z.enum(["OPEN", "CLOSED"]).optional(),
  channel: z.enum(["WEBSITE", "WHATSAPP", "EMAIL"]).optional(),
});

export const GET = route({ permission: "leads:read", query }, async ({ ctx, query }) => listConversations(ctx.workspace.id, query));
