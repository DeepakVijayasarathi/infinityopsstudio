import { z } from "zod";
import { route } from "@/server/api";
import { paginationSchema } from "@/server/pagination";
import { AI_TASK_STATUSES } from "@/lib/constants";
import { listTasks } from "@/server/services/workers";

const q = paginationSchema.extend({ status: z.enum(AI_TASK_STATUSES).optional(), workerId: z.string().optional(), campaignId: z.string().optional() });
export const GET = route({ permission: "workers:read", query: q }, async ({ ctx, query }) => listTasks(ctx.workspace.id, query));
