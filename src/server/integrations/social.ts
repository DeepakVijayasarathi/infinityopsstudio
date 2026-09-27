import type { SocialPlatform } from "@prisma/client";

export type PublishInput = { text: string; mediaUrls: string[]; accessToken: string; externalId?: string | null };
export type PublishResult = { externalPostId: string; externalUrl?: string };

export class PublishError extends Error {
  constructor(message: string, readonly retryable = false) {
    super(message);
  }
}

async function postJson(url: string, token: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...extraHeaders },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new PublishError("Could not reach the social network", true);
  }
  const text = await res.text();
  if (!res.ok) throw new PublishError(`Publishing failed (HTTP ${res.status}): ${text.slice(0, 200)}`, res.status >= 500 || res.status === 429);
  return { json: text ? (JSON.parse(text) as Record<string, unknown>) : {}, headers: res.headers };
}

/**
 * Publisher implementations per platform. Platforms without a public publishing API
 * (YouTube video uploads, TikTok without Content Posting approval) return null and use
 * the manual-publishing flow in the UI.
 */
export const PUBLISHERS: Partial<Record<SocialPlatform, (input: PublishInput) => Promise<PublishResult>>> = {
  async LINKEDIN(input) {
    if (!input.externalId) throw new PublishError("LinkedIn author URN is missing on the connected account");
    const { headers } = await postJson(
      "https://api.linkedin.com/rest/posts",
      input.accessToken,
      { author: input.externalId, commentary: input.text, visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED" }, lifecycleState: "PUBLISHED" },
      { "linkedin-version": "202405", "x-restli-protocol-version": "2.0.0" },
    );
    const id = headers.get("x-restli-id") ?? "";
    return { externalPostId: id, externalUrl: id ? `https://www.linkedin.com/feed/update/${id}` : undefined };
  },
  async X(input) {
    const { json } = await postJson("https://api.x.com/2/tweets", input.accessToken, { text: input.text });
    const id = (json.data as { id?: string } | undefined)?.id ?? "";
    return { externalPostId: id, externalUrl: id ? `https://x.com/i/web/status/${id}` : undefined };
  },
  async FACEBOOK(input) {
    if (!input.externalId) throw new PublishError("Facebook Page ID is missing on the connected account");
    const { json } = await postJson(`https://graph.facebook.com/v19.0/${encodeURIComponent(input.externalId)}/feed`, input.accessToken, {
      message: input.text,
      ...(input.mediaUrls[0] ? { link: input.mediaUrls[0] } : {}),
    });
    const id = String(json.id ?? "");
    return { externalPostId: id, externalUrl: id ? `https://www.facebook.com/${id}` : undefined };
  },
  async INSTAGRAM(input) {
    if (!input.externalId) throw new PublishError("Instagram Business ID is missing on the connected account");
    if (!input.mediaUrls[0]) throw new PublishError("Instagram posts require an image URL");
    const container = await postJson(`https://graph.facebook.com/v19.0/${encodeURIComponent(input.externalId)}/media`, input.accessToken, { image_url: input.mediaUrls[0], caption: input.text });
    const { json } = await postJson(`https://graph.facebook.com/v19.0/${encodeURIComponent(input.externalId)}/media_publish`, input.accessToken, { creation_id: container.json.id });
    return { externalPostId: String(json.id ?? "") };
  },
};

export function canAutoPublish(platform: SocialPlatform): boolean {
  return !!PUBLISHERS[platform];
}
