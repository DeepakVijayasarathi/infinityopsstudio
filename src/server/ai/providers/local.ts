import { estimateTokens } from "../models";
import type { AIProvider, GenerateParams, GenerateResult, StreamChunk } from "../types";

/**
 * Offline "demo" provider. It produces deterministic, structured marketing output from the
 * prompt so every AI feature works end-to-end without external API keys (development,
 * CI, demos). It is clearly labelled in the UI and never used when a real provider is selected.
 */

type Brief = { instruction: string; subject: string; brand: string; audience: string; tone: string; source: string };

/** "Operations leaders at mid-size 3PLs (50–1,000 employees) who are…" → "operations leaders at mid-size 3PLs" */
function shortAudience(a: string): string {
  const core = a.split(/\s*\(|\s+who\s+|[.;:]/)[0]?.trim() ?? "";
  return core ? core.charAt(0).toLowerCase() + core.slice(1) : "";
}

function extract(p: GenerateParams): Brief {
  const last = [...p.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const sys = p.system ?? "";
  const field = (re: RegExp, text: string) => text.match(re)?.[1]?.trim() ?? "";
  const subject =
    field(/(?:Goal|Brief|Topic|Context|Page|Offer|Target|Product|Business|Data|Situation|Funnel|Page \/ flow|Site \/ topic|Audience|Email|Competitors \/ context):\s*([^\n]+)/i, last) ||
    field(/^(.{10,160})$/m, last) ||
    "your next marketing initiative";
  const source = last.includes("---") ? last.split("---").slice(1).join("---").trim() : "";
  return {
    instruction: last.toLowerCase(),
    subject: subject.replace(/[.\s]+$/, ""),
    brand: field(/Company:\s*([^\n]+)/i, sys) || "your brand",
    audience: shortAudience(field(/Target audience:\s*([^\n]+)/i, sys)) || "your ideal customers",
    tone: field(/(?:Tone|Brand voice):\s*([^\n]+)/i, sys + "\n" + last) || "professional",
    source,
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);

function transform(b: Brief): string | null {
  const text = b.source;
  if (!text) return null;
  const i = b.instruction;
  if (i.includes("summarize")) {
    const s = sentences(text.replace(/[#*>-]/g, " ").replace(/\s+/g, " "));
    return `**Summary**\n\n${s.slice(0, 3).join(" ")}\n\n**Key points**\n${s.slice(0, 5).map((x) => `- ${x}`).join("\n")}`;
  }
  if (i.includes("expand")) {
    return `${text}\n\nTo put this into practice, start with the highest-impact step and measure it for two weeks before scaling. Teams that document what worked — and what didn't — compound their results faster, because every campaign builds on validated learning rather than guesswork.\n\nFinally, align the message with what ${b.audience} care about most: saving time, reducing risk and seeing clear, measurable outcomes.`;
  }
  if (i.includes("shorten") || i.includes("concise")) {
    return sentences(text).slice(0, Math.max(1, Math.ceil(sentences(text).length / 2))).join(" ");
  }
  if (i.includes("tone") || i.includes("rewrite") || i.includes("improve") || i.includes("repurpose")) {
    const tone = b.instruction.match(/tone[^a-z]*(?:to|:)?\s*([a-z]+)/)?.[1] ?? b.tone;
    const opener: Record<string, string> = {
      friendly: "Here's the good news:",
      persuasive: "Imagine what changes when",
      casual: "Quick one —",
      luxury: "Crafted for those who expect more:",
      technical: "In practical terms:",
      minimal: "",
      creative: "Picture this:",
      professional: "",
    };
    const prefix = opener[tone.toLowerCase()] ?? "";
    const body = sentences(text)
      .map((s) => s.replace(/\bvery\b/gi, "").replace(/\breally\b/gi, "").replace(/\s{2,}/g, " "))
      .join(" ");
    return `${prefix ? prefix + " " : ""}${body}`.trim();
  }
  return null;
}

function document(b: Brief): string {
  const i = b.instruction;
  const s = b.subject;

  if (/subject line/.test(i)) {
    return `## Subject lines for “${s}”\n\n| Style | Subject line |\n|---|---|\n| Curiosity | The one change we made to ${s.toLowerCase()} |\n| Benefit | ${cap(s)} — built to save you hours every week |\n| Urgency | Last chance: ${s.toLowerCase()} closes Friday |\n| Personalization | {{first_name}}, this was made for teams like yours |\n| Question | Ready to see ${s.toLowerCase()} in action? |\n| Benefit | Less busywork, more growth with ${b.brand} |\n\n**Preview text options**\n- See what's new and how it helps you ship faster.\n- Three minutes to read, hours saved every week.\n- Your questions, answered — plus an exclusive offer.`;
  }
  if (/email|sequence/.test(i)) {
    return `## Email: ${cap(s)}\n\n**Subject line options**\n1. ${cap(s)} — here's what you need to know\n2. {{first_name}}, a quick update from ${b.brand}\n3. The easiest way to get results this month\n\n**Preview text:** A short read with one clear next step.\n\n---\n\nHi {{first_name}},\n\nWe built ${b.brand} to help ${b.audience} spend less time on busywork and more time on the work that moves the needle.\n\nThat's why we're excited to share **${s.toLowerCase()}**. In practice it means:\n\n- **Faster execution** — go from idea to launch in days, not weeks\n- **Clear visibility** — see what's working in one dashboard\n- **Consistent quality** — every asset stays on-brand\n\n**[See how it works →]({{cta_url}})**\n\nTalk soon,\nThe ${b.brand} team\n\n*P.S. Reply to this email with your biggest marketing bottleneck — we read every response.*`;
  }
  if (/calendar|schedul/.test(i)) {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const plat = ["LinkedIn", "Instagram", "X", "LinkedIn", "Instagram", "TikTok", "Facebook"];
    const fmt = ["Carousel", "Reel", "Thread", "Article", "Story", "Short video", "Post"];
    const rows = days.map((d, k) => `| ${d} | ${plat[k]} | ${fmt[k]} | ${["Problem framing", "Behind the scenes", "Quick tips", "Customer story", "Product demo", "Trend reaction", "Community spotlight"][k]} | ${["Most teams get this wrong…", "Here's how we actually work", "3 tips in 30 seconds", "How one team saved 12 hours a week", "Watch this in 20 seconds", "Everyone's talking about this", "Meet the people behind the work"][k]} | ${["Comment your take", "Follow for more", "Save this", "Read the story", "Try it free", "Share with your team", "Tag a teammate"][k]} |`);
    return `## 2-week content calendar: ${cap(s)}\n\n### Week 1\n| Day | Platform | Format | Topic | Hook | CTA |\n|---|---|---|---|---|---|\n${rows.join("\n")}\n\n### Week 2\nRepeat the structure above, swapping in fresh proof points and the best-performing hook styles from week 1.\n\n### Posting times\n- **LinkedIn:** Tue–Thu, 8–10am local time\n- **Instagram:** Weekdays 11am–1pm and 7–9pm\n- **X:** Weekdays 9am and 12pm\n- **TikTok:** Evenings 6–10pm`;
  }
  if (/keyword/.test(i)) {
    const base = s.toLowerCase();
    const kws = [
      [base, "Commercial", "High", "P1", "Pillar page"],
      [`best ${base}`, "Commercial", "High", "P1", "Comparison guide"],
      [`${base} pricing`, "Transactional", "Medium", "P1", "Pricing page"],
      [`${base} for small business`, "Commercial", "Medium", "P1", "Landing page"],
      [`how to choose ${base}`, "Informational", "Low", "P2", "Blog guide"],
      [`${base} alternatives`, "Commercial", "Medium", "P2", "Comparison page"],
      [`${base} examples`, "Informational", "Low", "P2", "Blog post"],
      [`${base} checklist`, "Informational", "Low", "P3", "Downloadable"],
      [`free ${base} template`, "Transactional", "Low", "P2", "Template page"],
      [`${base} vs spreadsheets`, "Commercial", "Low", "P3", "Blog post"],
    ];
    return `## Keyword research: ${cap(s)}\n\n| Keyword | Intent | Difficulty | Priority | Content type |\n|---|---|---|---|---|\n${kws.map((k) => `| ${k.join(" | ")} |`).join("\n")}\n\n### Clusters\n- **Core commercial:** ${kws.slice(0, 4).map((k) => k[0]).join(", ")}\n- **Education:** ${kws.slice(4, 8).map((k) => k[0]).join(", ")}\n- **Comparison:** ${kws.slice(8).map((k) => k[0]).join(", ")}\n\n### Next steps\n1. Build the pillar page first and link every cluster article to it.\n2. Publish two supporting articles per week.\n3. Track rankings weekly and refresh content after 90 days.`;
  }
  if (/blog|article/.test(i)) {
    return `# ${cap(s)}\n\n*For ${b.audience} who want results without adding headcount.*\n\nMarketing teams are being asked to do more with less. The good news: the right systems make that possible. In this guide we break down exactly how to approach ${s.toLowerCase()} — with practical steps you can apply this week.\n\n## Why it matters now\n\nBuyers research more channels than ever before they talk to sales. Consistent, useful content across those channels is what earns attention — and consistency is exactly what small teams struggle with.\n\n## A practical framework\n\n### 1. Start with one clear outcome\nPick a single metric — qualified leads, trial signups or revenue — and make every piece of work ladder up to it.\n\n### 2. Build a repeatable production system\nTemplates, a shared brand kit and an approval workflow turn one-off efforts into a machine that runs every week.\n\n### 3. Automate the handoffs\nThe biggest time sink is rarely the work itself — it's moving work between people and tools. Automate scheduling, routing and reporting.\n\n### 4. Review, learn, repeat\nHold a 30-minute weekly review. Keep what works, cut what doesn't, and document the learning.\n\n## Common mistakes to avoid\n\n- Chasing every channel at once instead of mastering two\n- Publishing without a distribution plan\n- Measuring vanity metrics instead of pipeline\n\n## Key takeaways\n\n- Focus on one outcome and measure it weekly\n- Systems beat heroics — templatize and automate\n- Small, consistent improvements compound\n\n**Ready to put this into practice?** Start your free ${b.brand} workspace and have your first campaign running today.`;
  }
  if (/caption|social|\bposts?\b/.test(i)) {
    const STOP = new Set(["about", "their", "there", "these", "those", "which", "while", "where", "your", "with", "from", "that", "this", "what", "when", "signs", "costing", "money", "just", "into", "over"]);
    const tags = [...new Set(s.toLowerCase().match(/[a-z]{5,}/g) ?? [])].filter((w) => !STOP.has(w)).slice(0, 3).map((w) => `#${w}`);
    return `## Social posts: ${cap(s)}\n\n**LinkedIn**\n\n${cap(s)}. Here's what we learned along the way — and what it means for ${b.audience}. 👇\n\n1. Start with the customer problem, not the feature.\n2. Measure one metric that matters.\n3. Share the wins *and* the lessons.\n\nWhat would you add? ${[...tags, "#marketing"].join(" ")}\n\n**Instagram**\n\n${cap(s)} ✨ Swipe to see how it works → Save this for later. ${[...tags, "#growth", "#smallbusiness"].join(" ")}\n\n**X**\n\n${cap(s)}. The short version: less busywork, better results. Thread 🧵 ${tags.slice(0, 2).join(" ")}`;
  }
  if (/ad copy|ad variation|headline|creative/.test(i)) {
    return `## Ad copy: ${cap(s)}\n\n| Angle | Headline | Primary text | CTA |\n|---|---|---|---|\n| Pain | Still doing it manually? | ${cap(s)} — automate the busywork and get hours back every week. | Start free |\n| Outcome | Results in days, not months | Teams using ${b.brand} launch faster and see results sooner. | See how |\n| Social proof | Trusted by growing teams | Join thousands of ${b.audience} already using ${b.brand}. | Join them |\n| Urgency | Offer ends Friday | ${cap(s)}. Don't miss this week's pricing. | Claim offer |\n| Simplicity | Set up in 10 minutes | No complex onboarding. Just connect and go. | Get started |\n\n**Testing plan:** run all five angles with equal budget for 5 days, then move 70% of spend to the top two by cost per acquisition.`;
  }
  if (/report|analy|insight|recommend|performance/.test(i)) {
    return `## Performance analysis: ${cap(s)}\n\n### Executive summary\nOverall performance is trending positively, with growth concentrated in owned channels. Paid efficiency softened slightly and is the main area to optimize next period.\n\n### Key findings\n| Area | Observation | Implication |\n|---|---|---|\n| Traffic | Organic sessions up week over week | SEO investment is paying off |\n| Conversion | Landing page conversion below benchmark | Test headline and form length |\n| Email | Tuesday sends outperform other days | Consolidate sends to Tue/Thu |\n| Social | Short video drives 2× engagement | Shift creative mix toward video |\n\n### Recommendations (prioritized)\n1. **A/B test the primary landing page** — highest impact, low effort.\n2. **Reallocate 15% of paid budget** from the lowest-ROAS campaign to retargeting.\n3. **Double short-form video output** on Instagram and TikTok.\n4. **Launch a re-engagement sequence** for leads inactive 30+ days.\n\n### How to measure\nTrack conversion rate, cost per lead and pipeline influenced weekly; review results in 14 days.`;
  }
  if (/experiment|funnel|growth|conversion/.test(i)) {
    return `## Growth plan: ${cap(s)}\n\n| Experiment | Hypothesis | Metric | I | C | E | ICE |\n|---|---|---|---|---|---|---|\n| Shorter signup form | Fewer fields increase completion | Signup rate | 8 | 8 | 9 | 8.3 |\n| Onboarding checklist | Guided setup improves activation | Activation rate | 9 | 7 | 7 | 7.7 |\n| Social proof on pricing | Logos reduce purchase anxiety | Checkout rate | 7 | 7 | 9 | 7.7 |\n| Day-3 nudge email | Timely help recovers stalled users | Day-7 retention | 7 | 7 | 8 | 7.3 |\n| Annual plan incentive | Discount lifts annual adoption | Annual mix | 6 | 7 | 8 | 7.0 |\n\n### Top experiment: shorter signup form\n**Hypothesis:** removing company size and phone fields will lift signup completion by 15%+.\n**Design:** 50/50 split, minimum 1,000 visitors per variant.\n**Success criteria:** statistically significant lift with no drop in activation quality.`;
  }
  // Strategy / planning (default)
  return `## ${cap(s)}: strategy\n\n### Objective\nDrive measurable growth for ${b.brand} by focusing on ${s.toLowerCase()} over the next 90 days.\n\n### Audience\n${cap(b.audience)} who are short on time and need reliable results. Their top priorities: efficiency, predictability and proof of ROI.\n\n### Core message\n*${b.brand} helps you get more done with less effort — without compromising on quality.*\n\n### Channel mix\n| Channel | Role | Share of effort |\n|---|---|---|\n| SEO & blog | Compounding demand capture | 30% |\n| LinkedIn & social | Awareness and trust | 25% |\n| Email | Nurture and conversion | 20% |\n| Paid ads | Acceleration and retargeting | 15% |\n| Partnerships | Credibility and reach | 10% |\n\n### 90-day roadmap\n- **Month 1 — Foundation:** finalize positioning, launch core landing page, set up tracking.\n- **Month 2 — Acceleration:** publish weekly content, launch nurture sequence, start retargeting.\n- **Month 3 — Optimization:** double down on top channels, run conversion experiments, report ROI.\n\n### KPIs\n- Qualified leads per month\n- Conversion rate from visit to lead\n- Cost per acquisition\n- Pipeline influenced\n\n### Risks & mitigations\n- **Limited bandwidth** → use AI workers and templates to keep output consistent.\n- **Slow SEO ramp** → balance with paid and partnerships early.`;
}

function respond(p: GenerateParams): string {
  const brief = extract(p);
  return transform(brief) ?? document(brief);
}

export const localProvider: AIProvider = {
  id: "local",
  label: "Infinity Local",
  isConfigured: () => true,

  async generate(p): Promise<GenerateResult> {
    const text = respond(p);
    return {
      text,
      promptTokens: estimateTokens((p.system ?? "") + p.messages.map((m) => m.content).join("\n")),
      completionTokens: estimateTokens(text),
      finishReason: "end_turn",
    };
  },

  async *stream(p): AsyncGenerator<StreamChunk> {
    const text = respond(p);
    const parts = text.match(/\S+\s*/g) ?? [text];
    for (let i = 0; i < parts.length; i += 4) {
      if (p.signal?.aborted) break;
      yield { type: "text", text: parts.slice(i, i + 4).join("") };
      await new Promise((r) => setTimeout(r, 12));
    }
    yield {
      type: "done",
      finishReason: "end_turn",
      promptTokens: estimateTokens((p.system ?? "") + p.messages.map((m) => m.content).join("\n")),
      completionTokens: estimateTokens(text),
    };
  },
};
