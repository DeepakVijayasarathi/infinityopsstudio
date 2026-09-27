import { z } from "zod";
import { route } from "@/server/api";
import { agentOverview, updateConfig } from "@/server/services/agent";

export const GET = route({ permission: "campaigns:read" }, async ({ ctx }) => agentOverview(ctx.workspace.id));

const schema = z.object({
  enabled: z.boolean().optional(),
  runHourUtc: z.coerce.number().int().min(0).max(23).optional(),
  autoDrafts: z.boolean().optional(),
  focus: z.string().trim().max(300).optional().nullable(),
});

export const PUT = route({ permission: "campaigns:write", body: schema }, async ({ ctx, body }) => updateConfig(ctx, { ...body, focus: body.focus === undefined ? undefined : body.focus || null }));
