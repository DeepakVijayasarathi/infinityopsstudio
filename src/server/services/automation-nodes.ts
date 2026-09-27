import { z } from "zod";
import type { WorkflowNodeType } from "@prisma/client";
import { LEAD_STATUSES, SOCIAL_PLATFORMS } from "@/lib/constants";

/** Config schema per node type — validated whenever a workflow is saved. */
export const NODE_CONFIG_SCHEMAS: Record<WorkflowNodeType, z.ZodTypeAny> = {
  CONDITION: z.object({
    field: z.string().min(1).max(100),
    operator: z.enum(["equals", "not_equals", "contains", "gt", "gte", "lt", "lte", "exists", "not_exists"]),
    value: z.string().max(200).optional().default(""),
  }),
  DELAY: z.object({ amount: z.coerce.number().int().min(1).max(365), unit: z.enum(["minutes", "hours", "days"]) }),
  AI_ACTION: z.object({ workerKey: z.string().min(1), capability: z.string().min(1), instructions: z.string().min(3).max(4000), saveAsContent: z.boolean().optional().default(false) }),
  SEND_EMAIL: z.object({ to: z.enum(["lead", "owner", "custom"]), email: z.string().email().optional().or(z.literal("")), subject: z.string().min(1).max(200), body: z.string().min(1).max(10000) }),
  CREATE_SOCIAL_POST: z.object({ platform: z.enum(SOCIAL_PLATFORMS), text: z.string().min(1).max(5000), scheduleInHours: z.coerce.number().int().min(0).max(720).optional().default(0) }),
  UPDATE_LEAD: z.object({ status: z.enum(LEAD_STATUSES).optional(), addTag: z.string().max(40).optional(), scoreDelta: z.coerce.number().int().min(-100).max(100).optional() }),
  ASSIGN_WORKER: z.object({ workerKey: z.string().min(1), capability: z.string().min(1), instructions: z.string().min(3).max(4000) }),
  WEBHOOK: z.object({ url: z.string().url().optional().or(z.literal("")), useIntegration: z.boolean().optional().default(false) }),
  NOTIFY: z.object({ title: z.string().min(1).max(200), body: z.string().max(1000).optional().default("") }),
  GENERATE_REPORT: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }),
};

export function parseNodeConfig(type: WorkflowNodeType, config: unknown) {
  return NODE_CONFIG_SCHEMAS[type].parse(config ?? {});
}

export const DELAY_MS = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 } as const;
