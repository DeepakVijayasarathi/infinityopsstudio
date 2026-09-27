// Client-safe mirrors of Prisma enums (importing @prisma/client in the browser would bundle the engine).

export const CAMPAIGN_STATUSES = ["DRAFT", "PLANNING", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"] as const;
export const CAMPAIGN_OBJECTIVES = ["AWARENESS", "TRAFFIC", "ENGAGEMENT", "LEADS", "CONVERSIONS", "SALES", "RETENTION"] as const;
export const APPROVAL_STATUSES = ["NOT_REQUIRED", "PENDING", "APPROVED", "CHANGES_REQUESTED"] as const;
export const CAMPAIGN_CHANNELS = ["Email", "LinkedIn", "Instagram", "Facebook", "X", "YouTube", "TikTok", "Google Ads", "Meta Ads", "SEO", "Blog", "Webinar", "Events", "Partnerships"] as const;
export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const;

export const CONTENT_TYPES = ["BLOG_POST", "SOCIAL_POST", "AD_COPY", "LANDING_PAGE", "EMAIL", "PRODUCT_DESCRIPTION", "SEO_META", "OTHER"] as const;
export const CONTENT_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED", "ARCHIVED"] as const;

export const SOCIAL_PLATFORMS = ["INSTAGRAM", "FACEBOOK", "LINKEDIN", "X", "YOUTUBE", "TIKTOK"] as const;
export const SOCIAL_POST_STATUSES = ["DRAFT", "PENDING_APPROVAL", "SCHEDULED", "PUBLISHING", "PUBLISHED", "FAILED"] as const;

export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"] as const;
export const LEAD_SOURCES = ["WEBSITE", "SOCIAL", "EMAIL", "ADS", "REFERRAL", "EVENT", "IMPORT", "MANUAL", "API"] as const;

export const EMAIL_CAMPAIGN_STATUSES = ["DRAFT", "SCHEDULED", "SENDING", "SENT", "ACTIVE", "PAUSED", "CANCELLED", "FAILED"] as const;
export const EMAIL_CAMPAIGN_TYPES = ["BROADCAST", "SEQUENCE"] as const;

export const KEYWORD_STATUSES = ["TRACKING", "OPPORTUNITY", "ARCHIVED"] as const;

export const WORKFLOW_TRIGGERS = ["LEAD_CREATED", "LEAD_STATUS_CHANGED", "CONTENT_PUBLISHED", "CAMPAIGN_COMPLETED", "ENGAGEMENT_LOW", "SCHEDULE", "WEBHOOK", "MANUAL"] as const;
export const WORKFLOW_NODE_TYPES = ["CONDITION", "DELAY", "AI_ACTION", "SEND_EMAIL", "CREATE_SOCIAL_POST", "UPDATE_LEAD", "ASSIGN_WORKER", "WEBHOOK", "NOTIFY", "GENERATE_REPORT"] as const;

export const AI_TASK_STATUSES = ["QUEUED", "RUNNING", "AWAITING_APPROVAL", "APPROVED", "REJECTED", "COMPLETED", "FAILED", "CANCELLED"] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number];
export type ContentType = (typeof CONTENT_TYPES)[number];
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type LeadSource = (typeof LEAD_SOURCES)[number];
export type WorkflowTrigger = (typeof WORKFLOW_TRIGGERS)[number];
export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPES)[number];

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

/** Human label from an enum value: "IN_REVIEW" → "In review" */
const ACRONYMS = new Set(["seo", "ai", "api", "csv", "sms", "crm", "roas", "ctr"]);

export function humanize(value: string): string {
  const words = value.replace(/_/g, " ").toLowerCase().split(" ");
  const out = words.map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w)).join(" ");
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  LINKEDIN: "LinkedIn",
  X: "X",
  YOUTUBE: "YouTube",
  TIKTOK: "TikTok",
};

export const PLATFORM_LIMITS: Record<SocialPlatform, number> = {
  INSTAGRAM: 2200,
  FACEBOOK: 63206,
  LINKEDIN: 3000,
  X: 280,
  YOUTUBE: 5000,
  TIKTOK: 2200,
};

export const PLATFORM_COLORS: Record<SocialPlatform, string> = {
  INSTAGRAM: "#e1306c",
  FACEBOOK: "#1877f2",
  LINKEDIN: "#0a66c2",
  X: "#111827",
  YOUTUBE: "#ff0000",
  TIKTOK: "#00c2b8",
};

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  BLOG_POST: "Blog post",
  SOCIAL_POST: "Social post",
  AD_COPY: "Ad copy",
  LANDING_PAGE: "Landing page",
  EMAIL: "Email",
  PRODUCT_DESCRIPTION: "Product description",
  SEO_META: "SEO meta",
  OTHER: "Other",
};

export const STATUS_TONES: Record<string, Tone> = {
  DRAFT: "neutral",
  PLANNING: "info",
  ACTIVE: "success",
  PAUSED: "warning",
  COMPLETED: "brand",
  ARCHIVED: "neutral",
  IN_REVIEW: "warning",
  APPROVED: "success",
  PUBLISHED: "brand",
  PENDING_APPROVAL: "warning",
  PENDING: "warning",
  CHANGES_REQUESTED: "danger",
  SCHEDULED: "info",
  PUBLISHING: "info",
  FAILED: "danger",
  SENDING: "info",
  SENT: "success",
  CANCELLED: "neutral",
  NEW: "info",
  CONTACTED: "brand",
  QUALIFIED: "success",
  PROPOSAL: "warning",
  WON: "success",
  LOST: "danger",
  QUEUED: "neutral",
  RUNNING: "info",
  AWAITING_APPROVAL: "warning",
  REJECTED: "danger",
  CONNECTED: "success",
  DISCONNECTED: "neutral",
  ERROR: "danger",
  WAITING: "info",
  STOPPED: "neutral",
  TRACKING: "info",
  OPPORTUNITY: "success",
  TODO: "neutral",
  IN_PROGRESS: "info",
  DONE: "success",
  TRIALING: "info",
  PAST_DUE: "danger",
  CANCELED: "neutral",
  OPEN: "warning",
  PAID: "success",
  VOID: "neutral",
};

export const TRIGGER_LABELS: Record<WorkflowTrigger, { label: string; description: string }> = {
  LEAD_CREATED: { label: "New lead", description: "When a lead is created in any way" },
  LEAD_STATUS_CHANGED: { label: "Lead status changed", description: "When a lead moves to a pipeline stage" },
  CONTENT_PUBLISHED: { label: "Content published", description: "When a content item is published" },
  CAMPAIGN_COMPLETED: { label: "Campaign completed", description: "When a campaign is marked completed" },
  ENGAGEMENT_LOW: { label: "Low engagement", description: "When social engagement drops below a threshold" },
  SCHEDULE: { label: "Schedule", description: "Runs on a recurring schedule" },
  WEBHOOK: { label: "Incoming webhook", description: "When an external system calls the workflow URL" },
  MANUAL: { label: "Manual", description: "Run on demand" },
};

export const NODE_LABELS: Record<WorkflowNodeType, { label: string; description: string }> = {
  CONDITION: { label: "Condition", description: "Continue only if a field matches" },
  DELAY: { label: "Delay", description: "Wait before the next step" },
  AI_ACTION: { label: "AI action", description: "Generate text with an AI worker" },
  SEND_EMAIL: { label: "Send email", description: "Send an email to the lead or a teammate" },
  CREATE_SOCIAL_POST: { label: "Create social post", description: "Draft or schedule a social post" },
  UPDATE_LEAD: { label: "Update lead", description: "Change status, score or tags" },
  ASSIGN_WORKER: { label: "Assign AI worker", description: "Create a task for an AI worker" },
  WEBHOOK: { label: "Webhook", description: "POST data to an external URL" },
  NOTIFY: { label: "Notify team", description: "Send an in-app notification" },
  GENERATE_REPORT: { label: "Generate report", description: "Create a performance report" },
};

/** Allowed lifecycle transitions (shared by API validation and UI menus). */
export const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ["PLANNING", "ACTIVE", "ARCHIVED"],
  PLANNING: ["DRAFT", "ACTIVE", "ARCHIVED"],
  ACTIVE: ["PAUSED", "COMPLETED"],
  PAUSED: ["ACTIVE", "COMPLETED", "ARCHIVED"],
  COMPLETED: ["ARCHIVED", "ACTIVE"],
  ARCHIVED: ["DRAFT"],
};

export const CONTENT_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  DRAFT: ["IN_REVIEW", "APPROVED", "ARCHIVED"],
  IN_REVIEW: ["DRAFT", "APPROVED"],
  APPROVED: ["DRAFT", "PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["DRAFT", "ARCHIVED"],
  ARCHIVED: ["DRAFT"],
};
