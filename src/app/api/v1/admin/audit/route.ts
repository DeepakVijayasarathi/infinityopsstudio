import { z } from "zod";
import { route } from "@/server/api";
import { paginationSchema } from "@/server/pagination";
import { auditLogs } from "@/server/services/admin";

export const GET = route({ auth: "admin", query: paginationSchema.extend({ action: z.string().max(60).optional(), workspaceId: z.string().optional() }) }, async ({ query }) => auditLogs(query));
