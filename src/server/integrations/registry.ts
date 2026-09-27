import { createHmac } from "node:crypto";

export type IntegrationCategory = "Social Media" | "Messaging" | "Email" | "Analytics" | "CRM" | "Advertising" | "AI providers" | "Webhooks";

export type IntegrationField = {
  key: string;
  label: string;
  type: "text" | "password" | "url";
  required?: boolean;
  secret?: boolean;
  placeholder?: string;
  help?: string;
};

export type TestResult = { ok: boolean; message: string };

export type IntegrationDefinition = {
  key: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  logo: string; // short monogram rendered as a badge
  color: string;
  fields: IntegrationField[];
  capabilities: string[];
  docsUrl?: string;
  /**
   * "available" providers can be connected; "admin" ones are configured platform-wide;
   * "coming_soon" ones are listed on the roadmap and cannot be connected yet.
   */
  availability: "available" | "admin" | "coming_soon";
  test?: (config: Record<string, string>, credentials: Record<string, string>) => Promise<TestResult>;
};

async function probe(url: string, init: RequestInit, okMessage: string): Promise<TestResult> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    if (res.ok) return { ok: true, message: okMessage };
    return { ok: false, message: `Provider responded with HTTP ${res.status}. Check the credentials.` };
  } catch {
    return { ok: false, message: "Could not reach the provider. Check the URL and network access." };
  }
}

export function signWebhook(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export async function deliverWebhook(url: string, secret: string | undefined, payload: unknown): Promise<{ ok: boolean; status: number }> {
  const body = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000).toString();
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "InfinityOpsStudio-Webhook/1.0", "x-ios-timestamp": ts };
  if (secret) headers["x-ios-signature"] = `sha256=${signWebhook(secret, ts, body)}`;
  const res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(10_000) });
  return { ok: res.ok, status: res.status };
}

const tokenField = (label = "Access token", help?: string): IntegrationField => ({ key: "accessToken", label, type: "password", required: true, secret: true, help });

export const INTEGRATIONS: IntegrationDefinition[] = [
  // Social
  {
    key: "linkedin", name: "LinkedIn", category: "Social Media", logo: "in", color: "#0a66c2", availability: "available",
    description: "Publish posts to LinkedIn profiles and company pages.",
    fields: [tokenField("OAuth access token", "Token with w_member_social scope."), { key: "authorUrn", label: "Author URN", type: "text", required: true, placeholder: "urn:li:organization:123456" }],
    capabilities: ["publish"],
    docsUrl: "https://learn.microsoft.com/linkedin/marketing/",
    test: (_c, cr) => probe("https://api.linkedin.com/v2/userinfo", { headers: { authorization: `Bearer ${cr.accessToken}` } }, "LinkedIn token is valid"),
  },
  {
    key: "meta", name: "Meta (Facebook & Instagram)", category: "Social Media", logo: "f", color: "#1877f2", availability: "available",
    description: "Publish to Facebook Pages and Instagram Business accounts.",
    fields: [tokenField("Page access token"), { key: "pageId", label: "Facebook Page ID", type: "text", required: true }, { key: "instagramId", label: "Instagram Business ID", type: "text" }],
    capabilities: ["publish"],
    docsUrl: "https://developers.facebook.com/docs/graph-api/",
    test: (c, cr) => probe(`https://graph.facebook.com/v19.0/${encodeURIComponent(c.pageId ?? "me")}?fields=id,name`, { headers: { authorization: `Bearer ${cr.accessToken}` } }, "Meta page token is valid"),
  },
  {
    key: "x", name: "X (Twitter)", category: "Social Media", logo: "X", color: "#111827", availability: "available",
    description: "Publish posts and threads to X.",
    fields: [tokenField("OAuth 2.0 user token", "Token with tweet.write scope.")],
    capabilities: ["publish"],
    docsUrl: "https://developer.x.com/en/docs/x-api",
    test: (_c, cr) => probe("https://api.x.com/2/users/me", { headers: { authorization: `Bearer ${cr.accessToken}` } }, "X token is valid"),
  },
  {
    key: "youtube", name: "YouTube", category: "Social Media", logo: "▶", color: "#ff0000", availability: "available",
    description: "Sync your channel's subscriber count daily. Video uploads are prepared here and published from YouTube Studio.",
    fields: [{ key: "apiKey", label: "YouTube Data API key", type: "password", required: true, secret: true }, { key: "channelId", label: "Channel ID", type: "text", required: true }],
    capabilities: ["analytics"],
    test: (c, cr) => probe(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(c.channelId ?? "")}&key=${encodeURIComponent(cr.apiKey ?? "")}`, {}, "YouTube API key is valid"),
  },
  {
    key: "tiktok", name: "TikTok", category: "Social Media", logo: "♪", color: "#00c2b8", availability: "coming_soon",
    description: "Track TikTok performance alongside your other channels.",
    fields: [tokenField("Access token")],
    capabilities: ["analytics"],
    test: (_c, cr) => probe("https://open.tiktokapis.com/v2/user/info/?fields=display_name", { headers: { authorization: `Bearer ${cr.accessToken}` } }, "TikTok token is valid"),
  },
  // Email
  {
    key: "whatsapp", name: "WhatsApp Business", category: "Messaging", logo: "WA", color: "#25d366", availability: "available",
    description: "Receive and reply to WhatsApp messages in the Inbox (WhatsApp Cloud API). Webhook details are on the Inbox page.",
    fields: [
      { key: "phoneNumberId", label: "Phone number ID", type: "text", required: true, help: "Meta Business → WhatsApp → API setup." },
      tokenField("Permanent access token", "System-user token with whatsapp_business_messaging."),
      { key: "appSecret", label: "App secret", type: "password", required: true, secret: true, help: "Used to verify that webhooks really come from Meta." },
      { key: "verifyToken", label: "Webhook verify token", type: "text", required: true, placeholder: "any-long-random-text", help: "Enter the same value in Meta's webhook settings." },
    ],
    capabilities: ["messaging"],
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
    test: (c, cr) => probe(`https://graph.facebook.com/v19.0/${encodeURIComponent(c.phoneNumberId ?? "")}?fields=display_phone_number`, { headers: { authorization: `Bearer ${cr.accessToken}` } }, "WhatsApp number is reachable"),
  },
  {
    key: "smtp", name: "SMTP", category: "Email", logo: "@", color: "#475569", availability: "available",
    description: "Send campaigns through your own SMTP server or provider (SES, Postmark, SendGrid SMTP).",
    fields: [
      { key: "host", label: "Host", type: "text", required: true, placeholder: "smtp.postmarkapp.com" },
      { key: "port", label: "Port", type: "text", required: true, placeholder: "587" },
      { key: "username", label: "Username", type: "text" },
      { key: "password", label: "Password", type: "password", secret: true },
      { key: "fromEmail", label: "From email", type: "text", required: true, placeholder: "marketing@yourcompany.com" },
    ],
    capabilities: ["send"],
  },
  {
    key: "mailchimp", name: "Mailchimp", category: "Email", logo: "M", color: "#ffe01b", availability: "coming_soon",
    description: "Sync audiences and subscriber status with Mailchimp.",
    fields: [{ key: "apiKey", label: "API key", type: "password", required: true, secret: true, placeholder: "xxxx-us21" }],
    capabilities: ["contacts-sync"],
    test: async (_c, cr) => {
      const dc = cr.apiKey?.split("-")[1];
      if (!dc) return { ok: false, message: "API key must include the data-center suffix (e.g. -us21)" };
      return probe(`https://${dc}.api.mailchimp.com/3.0/ping`, { headers: { authorization: `Basic ${Buffer.from(`any:${cr.apiKey}`).toString("base64")}` } }, "Mailchimp key is valid");
    },
  },
  // Analytics
  {
    key: "google-analytics", name: "Google Analytics 4", category: "Analytics", logo: "GA", color: "#f9ab00", availability: "coming_soon",
    description: "Import sessions, conversions and traffic sources into Analytics.",
    fields: [{ key: "propertyId", label: "GA4 property ID", type: "text", required: true }, { key: "serviceAccountJson", label: "Service account JSON", type: "password", required: true, secret: true }],
    capabilities: ["analytics"],
  },
  {
    key: "plausible", name: "Plausible", category: "Analytics", logo: "P", color: "#5850ec", availability: "coming_soon",
    description: "Privacy-friendly website analytics.",
    fields: [{ key: "siteId", label: "Site domain", type: "text", required: true }, { key: "apiKey", label: "API key", type: "password", required: true, secret: true }],
    capabilities: ["analytics"],
    test: (c, cr) => probe(`https://plausible.io/api/v1/stats/aggregate?site_id=${encodeURIComponent(c.siteId ?? "")}&period=day`, { headers: { authorization: `Bearer ${cr.apiKey}` } }, "Plausible key is valid"),
  },
  // CRM
  {
    key: "hubspot", name: "HubSpot", category: "CRM", logo: "H", color: "#ff7a59", availability: "coming_soon",
    description: "Two-way lead sync with HubSpot contacts.",
    fields: [tokenField("Private app token")],
    capabilities: ["contacts-sync"],
    test: (_c, cr) => probe("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", { headers: { authorization: `Bearer ${cr.accessToken}` } }, "HubSpot token is valid"),
  },
  {
    key: "salesforce", name: "Salesforce", category: "CRM", logo: "SF", color: "#00a1e0", availability: "coming_soon",
    description: "Push qualified leads to Salesforce.",
    fields: [{ key: "instanceUrl", label: "Instance URL", type: "url", required: true, placeholder: "https://yourorg.my.salesforce.com" }, tokenField()],
    capabilities: ["contacts-sync"],
    test: (c, cr) => probe(`${(c.instanceUrl ?? "").replace(/\/$/, "")}/services/data/v60.0/limits`, { headers: { authorization: `Bearer ${cr.accessToken}` } }, "Salesforce token is valid"),
  },
  // Advertising
  {
    key: "google-ads", name: "Google Ads", category: "Advertising", logo: "G", color: "#4285f4", availability: "coming_soon",
    description: "Import campaign spend, clicks and conversions.",
    fields: [{ key: "customerId", label: "Customer ID", type: "text", required: true }, { key: "developerToken", label: "Developer token", type: "password", required: true, secret: true }, tokenField("OAuth access token")],
    capabilities: ["analytics"],
  },
  {
    key: "meta-ads", name: "Meta Ads", category: "Advertising", logo: "∞", color: "#0668e1", availability: "coming_soon",
    description: "Import Facebook & Instagram ad performance.",
    fields: [{ key: "adAccountId", label: "Ad account ID", type: "text", required: true, placeholder: "act_123" }, tokenField()],
    capabilities: ["analytics"],
    test: (c, cr) => probe(`https://graph.facebook.com/v19.0/${encodeURIComponent(c.adAccountId ?? "")}?fields=name`, { headers: { authorization: `Bearer ${cr.accessToken}` } }, "Meta Ads token is valid"),
  },
  {
    key: "linkedin-ads", name: "LinkedIn Ads", category: "Advertising", logo: "in", color: "#0a66c2", availability: "coming_soon",
    description: "Import LinkedIn campaign performance.",
    fields: [{ key: "accountId", label: "Ad account ID", type: "text", required: true }, tokenField()],
    capabilities: ["analytics"],
  },
  // AI providers — configured platform-wide by administrators (keys never reach the browser).
  { key: "anthropic", name: "Anthropic Claude", category: "AI providers", logo: "A", color: "#d97757", availability: "admin", description: "Claude models for strategy and long-form content.", fields: [], capabilities: ["ai"] },
  { key: "openai", name: "OpenAI", category: "AI providers", logo: "O", color: "#10a37f", availability: "admin", description: "GPT models for content generation.", fields: [], capabilities: ["ai"] },
  { key: "claude-code", name: "Claude Code (local)", category: "AI providers", logo: "CC", color: "#c96442", availability: "admin", description: "Claude through the Claude Code CLI signed in on the server machine. No API key.", fields: [], capabilities: ["ai"] },
  { key: "google-ai", name: "Google Gemini", category: "AI providers", logo: "G", color: "#4285f4", availability: "admin", description: "Gemini models for fast generation.", fields: [], capabilities: ["ai"] },
  // Webhooks
  {
    key: "webhook", name: "Outgoing webhook", category: "Webhooks", logo: "{}", color: "#7c3aed", availability: "available",
    description: "Send signed JSON events (HMAC-SHA256) to your own endpoint. Also usable as a workflow action.",
    fields: [{ key: "url", label: "Endpoint URL", type: "url", required: true, placeholder: "https://example.com/hooks/infinity" }, { key: "secret", label: "Signing secret", type: "password", secret: true, help: "Used to sign the x-ios-signature header." }],
    capabilities: ["events"],
    test: async (c, cr) => {
      try {
        const r = await deliverWebhook(c.url!, cr.secret, { type: "ping", sentAt: new Date().toISOString() });
        return r.ok ? { ok: true, message: "Test event delivered" } : { ok: false, message: `Endpoint responded with HTTP ${r.status}` };
      } catch {
        return { ok: false, message: "Could not reach the endpoint" };
      }
    },
  },
];

export function getIntegration(key: string): IntegrationDefinition | undefined {
  return INTEGRATIONS.find((i) => i.key === key);
}

export const INTEGRATION_CATEGORIES: IntegrationCategory[] = ["Social Media", "Email", "Analytics", "CRM", "Advertising", "AI providers", "Webhooks"];
