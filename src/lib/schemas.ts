import { z } from "zod";
import {
  CAMPAIGN_OBJECTIVES,
  CAMPAIGN_STATUSES,
  CONTENT_STATUSES,
  CONTENT_TYPES,
  EMAIL_CAMPAIGN_TYPES,
  KEYWORD_STATUSES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  SOCIAL_PLATFORMS,
  TASK_STATUSES,
  WORKFLOW_NODE_TYPES,
  WORKFLOW_TRIGGERS,
} from "./constants";

// Shared (client + server) request schemas.

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
const dateish = z.union([z.string(), z.date()]).optional().nullable().transform((v, ctx) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date" });
    return z.NEVER;
  }
  return d;
});
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #4f46e5");
const tagList = z.array(trimmed(40).min(1)).max(30);

export const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/[a-zA-Z]/, "Password must contain a letter")
  .regex(/[0-9]/, "Password must contain a number");

// ─── Auth ───
export const signupSchema = z.object({
  name: trimmed(80).min(2, "Enter your name"),
  email,
  password,
  workspaceName: trimmed(80).optional(),
  inviteToken: z.string().max(200).optional(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "You must accept the terms" }) }),
});
export const loginSchema = z.object({ email, password: z.string().min(1, "Enter your password").max(128), rememberMe: z.boolean().optional().default(false) });
export const emailOnlySchema = z.object({ email });
export const tokenPasswordSchema = z.object({ token: z.string().min(10).max(200), password });
export const tokenSchema = z.object({ token: z.string().min(10).max(200) });
export const twoFactorCodeSchema = z.object({ code: z.string().trim().min(6).max(20) });
export const disable2faSchema = z.object({ password: z.string().max(128).optional().default(""), code: z.string().trim().min(6).max(20) });
export const changePasswordSchema = z.object({ currentPassword: z.string().max(128).optional().default(""), newPassword: password });

// ─── Users / workspaces ───
export const profileSchema = z.object({ name: trimmed(80).min(2).optional(), avatarUrl: z.string().url().max(500).optional().nullable() });
export const workspaceSchema = z.object({
  name: trimmed(80).min(2, "Workspace name is too short"),
  industry: optionalText(80),
  website: z.string().trim().url("Enter a valid URL").max(200).optional().nullable().or(z.literal("").transform(() => null)),
  timezone: trimmed(60).optional(),
});
export const inviteSchema = z.object({ email, roleId: z.string().min(1) });
export const roleChangeSchema = z.object({ roleId: z.string().min(1) });

// ─── Workers ───
export const workerUpdateSchema = z.object({
  customInstructions: optionalText(4000),
  model: z.string().max(80).optional().nullable(),
  temperature: z.coerce.number().min(0).max(1).optional(),
  requiresApproval: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export const taskCreateSchema = z.object({
  capability: z.string().min(1).max(60),
  instructions: trimmed(4000).min(5, "Describe the task in a bit more detail"),
  title: trimmed(160).optional(),
  campaignId: z.string().optional().nullable(),
  context: trimmed(8000).optional(),
});
export const taskReviewSchema = z.object({ decision: z.enum(["approve", "reject"]), note: trimmed(1000).optional(), output: z.string().max(100_000).optional() });
export const chatSchema = z.object({ message: trimmed(8000).min(1), conversationId: z.string().optional().nullable() });

// ─── Campaigns ───
export const campaignSchema = z.object({
  name: trimmed(120).min(2, "Campaign name is required"),
  description: optionalText(2000),
  objective: z.enum(CAMPAIGN_OBJECTIVES).optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  targetAudience: optionalText(1000),
  budgetCents: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  currency: z.string().length(3).optional(),
  startDate: dateish,
  endDate: dateish,
  channels: z.array(trimmed(40)).max(20).optional(),
  kpis: z.record(z.coerce.number()).optional().nullable(),
  ownerId: z.string().optional().nullable(),
});
export const campaignUpdateSchema = campaignSchema.partial();
export const campaignTaskSchema = z.object({ title: trimmed(200).min(2), description: optionalText(2000), dueDate: dateish, workerId: z.string().optional().nullable() });
export const campaignTaskUpdateSchema = z.object({ title: trimmed(200).min(2).optional(), description: optionalText(2000), status: z.enum(TASK_STATUSES).optional(), dueDate: dateish });

// ─── Content ───
export const contentCreateSchema = z.object({
  title: trimmed(200).min(1, "Title is required"),
  type: z.enum(CONTENT_TYPES),
  body: z.string().max(200_000).optional(),
  tone: optionalText(40),
  campaignId: z.string().optional().nullable(),
  keywords: tagList.optional(),
});
export const contentUpdateSchema = z.object({
  title: trimmed(200).min(1).optional(),
  body: z.string().max(200_000).optional(),
  tone: optionalText(40),
  campaignId: z.string().optional().nullable(),
  keywords: tagList.optional(),
  autosave: z.boolean().optional(),
  versionNote: trimmed(200).optional(),
});
export const contentStatusSchema = z.object({ status: z.enum(CONTENT_STATUSES) });
export const generateSchema = z.object({
  generator: z.enum(["blog", "social", "ad", "landing", "email", "product", "seo-meta"]),
  values: z.record(trimmed(2000)).default({}),
  tone: trimmed(40).optional(),
  model: z.string().max(80).optional().nullable(),
  save: z.object({ title: trimmed(200).min(1), campaignId: z.string().optional().nullable() }).optional(),
});
export const inlineActionSchema = z.object({
  action: z.enum(["rewrite", "summarize", "expand", "shorten", "tone", "repurpose", "improve"]),
  text: z.string().min(1).max(50_000),
  tone: trimmed(40).optional(),
  format: trimmed(200).optional(),
  model: z.string().max(80).optional().nullable(),
});

// ─── Social ───
export const socialAccountSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  handle: trimmed(80).min(1, "Handle is required"),
  displayName: trimmed(80).optional(),
  accessToken: z.string().trim().max(4000).optional(),
  externalId: trimmed(200).optional(),
});
export const socialPostSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  socialAccountId: z.string().optional().nullable(),
  text: z.string().trim().min(1, "Write something to post").max(63_206),
  mediaUrls: z.array(z.string().url()).max(10).optional(),
  hashtags: tagList.optional(),
  scheduledAt: dateish,
  campaignId: z.string().optional().nullable(),
  contentId: z.string().optional().nullable(),
  submit: z.enum(["draft", "approval", "schedule"]).optional(),
});
export const socialPostUpdateSchema = socialPostSchema.omit({ submit: true }).partial();
export const socialActionSchema = z.object({
  action: z.enum(["approve", "reject", "schedule", "publish", "mark-published"]),
  scheduledAt: dateish,
  externalUrl: z.string().url().optional(),
});
export const captionSchema = z.object({ platform: z.enum(SOCIAL_PLATFORMS), topic: trimmed(1000).min(3), tone: trimmed(40).optional(), model: z.string().optional().nullable() });
export const hashtagSchema = z.object({ platform: z.enum(SOCIAL_PLATFORMS), text: trimmed(5000).min(3) });

// ─── SEO ───
export const seoProjectSchema = z.object({ name: trimmed(80).min(2), domain: trimmed(200).min(3), competitors: z.array(trimmed(200)).max(10).optional() });
export const keywordSchema = z.object({
  term: trimmed(120).min(2),
  searchVolume: z.coerce.number().int().min(0).optional(),
  difficulty: z.coerce.number().int().min(0).max(100).optional(),
  cpcCents: z.coerce.number().int().min(0).optional(),
  intent: optionalText(40),
  position: z.coerce.number().int().min(1).max(1000).optional().nullable(),
  targetUrl: optionalText(500),
  status: z.enum(KEYWORD_STATUSES).optional(),
});
export const keywordsBulkSchema = z.object({ keywords: z.array(keywordSchema).min(1).max(500) });

// ─── Email ───
const segmentSchema = z.object({
  statuses: z.array(z.enum(LEAD_STATUSES)).optional(),
  sources: z.array(z.enum(LEAD_SOURCES)).optional(),
  tags: z.array(trimmed(40)).optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  campaignId: z.string().optional(),
});
export const emailTemplateSchema = z.object({ name: trimmed(120).min(2), category: trimmed(40).optional(), subject: trimmed(200).min(1), previewText: optionalText(200), body: z.string().min(1).max(100_000) });
export const emailCampaignSchema = z.object({
  name: trimmed(120).min(2, "Name is required"),
  type: z.enum(EMAIL_CAMPAIGN_TYPES).optional(),
  subject: trimmed(200).min(1, "Subject is required"),
  previewText: optionalText(200),
  body: z.string().min(1, "Email body is required").max(100_000),
  fromName: optionalText(80),
  segment: segmentSchema.optional().nullable(),
  steps: z.array(z.object({ delayDays: z.coerce.number().int().min(1).max(90), subject: trimmed(200).min(1), body: z.string().min(1).max(50_000) })).max(10).optional().nullable(),
  templateId: z.string().optional().nullable(),
  campaignId: z.string().optional().nullable(),
});
export const emailScheduleSchema = z.object({ scheduledAt: dateish });
export const segmentPreviewSchema = segmentSchema;
export const emailWriterSchema = z.object({ goal: trimmed(2000).min(3), audience: trimmed(500).optional(), tone: trimmed(40).optional(), kind: z.enum(["email", "subject-lines", "sequence"]) });

// ─── Leads ───
export const leadSchema = z.object({
  firstName: trimmed(80).min(1, "First name is required"),
  lastName: optionalText(80),
  email: email.optional().nullable().or(z.literal("").transform(() => null)),
  phone: optionalText(40),
  company: optionalText(120),
  jobTitle: optionalText(120),
  website: optionalText(200),
  source: z.enum(LEAD_SOURCES).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  tags: tagList.optional(),
  valueCents: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  ownerId: z.string().optional().nullable(),
  campaignId: z.string().optional().nullable(),
});
export const leadUpdateSchema = leadSchema.partial();
export const leadBulkSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  action: z.enum(["update", "delete"]),
  status: z.enum(LEAD_STATUSES).optional(),
  addTag: trimmed(40).optional(),
  ownerId: z.string().optional(),
});
export const leadNoteSchema = z.object({ content: trimmed(5000).min(1), type: z.enum(["NOTE", "CALL", "MEETING"]).optional() });
export const leadTaskSchema = z.object({ title: trimmed(200).min(1), dueDate: dateish });

// ─── Automations ───
export const workflowSchema = z.object({
  name: trimmed(120).min(2, "Name is required"),
  description: optionalText(1000),
  trigger: z.enum(WORKFLOW_TRIGGERS),
  triggerConfig: z.record(z.unknown()).optional().nullable(),
  nodes: z.array(z.object({ type: z.enum(WORKFLOW_NODE_TYPES), label: trimmed(120).optional(), config: z.record(z.unknown()) })).max(25),
});
export const workflowUpdateSchema = workflowSchema.partial();

// ─── Brand ───
export const brandKitSchema = z.object({
  companyName: trimmed(120).min(1),
  tagline: optionalText(200),
  logoUrl: optionalText(500),
  website: optionalText(200),
  industry: optionalText(80),
  primaryColor: hex,
  secondaryColor: hex,
  accentColor: hex,
  headingFont: trimmed(60),
  bodyFont: trimmed(60),
  voice: optionalText(2000),
  voiceAttributes: tagList,
  targetAudience: optionalText(2000),
  productsServices: optionalText(4000),
  usps: z.array(trimmed(300)).max(20),
  competitors: z.array(trimmed(120)).max(20),
  guidelines: optionalText(10_000),
  dos: z.array(trimmed(300)).max(20),
  donts: z.array(trimmed(300)).max(20),
}).partial();

// ─── Billing ───
export const changePlanSchema = z.object({ plan: z.enum(["FREE", "STARTER", "GROWTH", "SCALE", "ENTERPRISE"]), interval: z.enum(["MONTHLY", "YEARLY"]).default("MONTHLY") });

// ─── Public ───
export const contactSchema = z.object({
  type: z.enum(["SALES", "SUPPORT", "GENERAL"]),
  name: trimmed(80).min(2, "Enter your name"),
  email,
  company: trimmed(120).optional(),
  teamSize: trimmed(40).optional(),
  message: trimmed(5000).min(10, "Please add a few more details"),
  website: z.string().max(0, "Spam detected").optional(), // honeypot
});

// ─── Admin ───
export const flagSchema = z.object({ key: z.string().regex(/^[a-z0-9_.-]{2,60}$/), description: optionalText(300), enabled: z.boolean(), rolloutPercent: z.coerce.number().int().min(0).max(100).optional(), workspaceIds: z.array(z.string()).optional() });
export const aiSettingsSchema = z.object({
  defaultModel: z.string().max(80).nullable(),
  enabledModels: z.array(z.string().max(80)).nullable(),
  allowUserModelSelection: z.boolean(),
  pricingOverrides: z.record(z.object({ inputPerMTok: z.coerce.number().min(0), outputPerMTok: z.coerce.number().min(0) })),
});
export const platformSettingsSchema = z.object({ signupsEnabled: z.boolean(), maintenanceMessage: z.string().max(500).nullable(), requireEmailVerification: z.boolean() });
