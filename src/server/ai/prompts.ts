import type { ContentType } from "@prisma/client";

export const TONES = ["Professional", "Friendly", "Persuasive", "Casual", "Luxury", "Technical", "Minimal", "Creative"] as const;
export type Tone = (typeof TONES)[number];

export const CONTENT_SYSTEM_PROMPT =
  "You are the Infinity Ops Studio content engine: an expert marketing copywriter. Output only the requested content in clean Markdown — no preamble, no explanations, no surrounding quotes. Follow the brand context exactly.";

export type GeneratorKey =
  | "blog"
  | "social"
  | "ad"
  | "landing"
  | "email"
  | "product"
  | "seo-meta";

export const GENERATORS: Record<GeneratorKey, { label: string; description: string; type: ContentType; fields: string[]; template: string }> = {
  blog: {
    label: "Blog post",
    description: "Long-form article with SEO structure",
    type: "BLOG_POST",
    fields: ["topic", "keywords", "audience", "length"],
    template:
      "Write a blog post.\nTopic: {{topic}}\nTarget keywords: {{keywords}}\nAudience: {{audience}}\nLength: {{length}}\nInclude an engaging H1 title, an intro hook, H2/H3 sections, practical examples, a key-takeaways list and a CTA.",
  },
  social: {
    label: "Social post",
    description: "Platform-native captions with hashtags",
    type: "SOCIAL_POST",
    fields: ["topic", "platform", "audience"],
    template:
      "Write 3 social post variations for {{platform}}.\nTopic: {{topic}}\nAudience: {{audience}}\nEach should have a scroll-stopping hook, value in the body, a CTA and 3-5 relevant hashtags. Label them Variation 1-3.",
  },
  ad: {
    label: "Ad copy",
    description: "Headlines and primary text for paid ads",
    type: "AD_COPY",
    fields: ["topic", "platform", "audience"],
    template:
      "Write ad copy for {{platform}}.\nOffer / product: {{topic}}\nAudience: {{audience}}\nProvide 5 variations each with headline, primary text and CTA, and label the persuasion angle for each.",
  },
  landing: {
    label: "Landing page copy",
    description: "Hero, benefits, proof, FAQ and CTA",
    type: "LANDING_PAGE",
    fields: ["topic", "audience", "keywords"],
    template:
      "Write landing page copy.\nProduct / offer: {{topic}}\nAudience: {{audience}}\nKeywords: {{keywords}}\nSections: Hero (headline, subheadline, CTA), Problem, Solution, 3 Benefits, How it works (3 steps), Social proof, FAQ (5), Final CTA.",
  },
  email: {
    label: "Email",
    description: "Marketing email with subject lines",
    type: "EMAIL",
    fields: ["topic", "audience", "length"],
    template:
      "Write a marketing email.\nPurpose: {{topic}}\nAudience: {{audience}}\nLength: {{length}}\nProvide 3 subject lines, preview text and the email body with one clear CTA. Use {{first_name}} as a merge tag.",
  },
  product: {
    label: "Product description",
    description: "Conversion-focused product copy",
    type: "PRODUCT_DESCRIPTION",
    fields: ["topic", "audience", "keywords"],
    template:
      "Write a product description.\nProduct: {{topic}}\nAudience: {{audience}}\nKeywords: {{keywords}}\nInclude a headline, a 2-sentence summary, 5 benefit-led bullet points and a short closing line.",
  },
  "seo-meta": {
    label: "SEO meta",
    description: "Meta titles and descriptions",
    type: "SEO_META",
    fields: ["topic", "keywords"],
    template:
      "Write SEO metadata for the page below.\nPage: {{topic}}\nPrimary keyword: {{keywords}}\nProvide 5 meta title options (≤60 characters) and 5 meta description options (≤155 characters) as two Markdown tables with a character count column.",
  },
};

export type InlineAction = "rewrite" | "summarize" | "expand" | "shorten" | "tone" | "repurpose" | "improve";

export const INLINE_ACTIONS: Record<InlineAction, { label: string; instruction: (opts: { tone?: string; format?: string }) => string }> = {
  rewrite: { label: "Rewrite", instruction: () => "Rewrite the text below to be clearer and more compelling while keeping its meaning." },
  improve: { label: "Improve writing", instruction: () => "Improve the writing below: fix grammar, tighten sentences and strengthen the hook. Keep the structure." },
  summarize: { label: "Summarize", instruction: () => "Summarize the text below in a short paragraph followed by 3-5 key bullet points." },
  expand: { label: "Expand", instruction: () => "Expand the text below with more depth, examples and supporting detail while keeping the same voice." },
  shorten: { label: "Make concise", instruction: () => "Make the text below about half as long without losing the key message." },
  tone: { label: "Change tone", instruction: ({ tone }) => `Rewrite the text below with the tone: ${tone ?? "Professional"}. Keep the meaning.` },
  repurpose: {
    label: "Repurpose",
    instruction: ({ format }) => `Repurpose the content below into: ${format ?? "a LinkedIn post, an X thread and a short email"}. Adapt length and style to each format.`,
  },
};

export function fillTemplate(template: string, values: Record<string, string | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (key === "first_name" || key === "cta_url") return match;
    const v = values[key]?.trim();
    return v && v.length > 0 ? v : "not specified";
  });
}

export function buildGeneratorPrompt(key: GeneratorKey, values: Record<string, string | undefined>, tone?: string): string {
  const g = GENERATORS[key];
  return `${fillTemplate(g.template, values)}\nTone: ${tone ?? "Professional"}`;
}

export function buildInlinePrompt(action: InlineAction, text: string, opts: { tone?: string; format?: string } = {}): string {
  return `${INLINE_ACTIONS[action].instruction(opts)}\nTone: ${opts.tone ?? "Professional"}\n\n---\n${text}`;
}
