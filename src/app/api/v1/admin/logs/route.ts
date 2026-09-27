import { z } from "zod";
import { route } from "@/server/api";
import { paginationSchema } from "@/server/pagination";
import { systemLogs } from "@/server/services/admin";

export const GET = route({ auth: "admin", query: paginationSchema.extend({ level: z.enum(["info", "warn", "error"]).optional() }) }, async ({ query }) => systemLogs(query));
