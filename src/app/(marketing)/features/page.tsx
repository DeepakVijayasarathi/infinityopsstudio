import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, Bot, CalendarClock, FileText, Mail, Megaphone, Palette, Search, Users, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/marketing/section";
import { CtaBanner } from "@/components/marketing/cta";
import { WorkerIcon } from "@/components/marketing/worker-icon";
import { WORKER_TEMPLATES } from "@/config/workers";
import { INTEGRATION_CATEGORIES, INTEGRATIONS } from "@/server/integrations/registry";

export const metadata: Metadata = {
  title: "Features",
  description: "AI Content Studio, Campaign Manager, social automation, AI workers, SEO, email marketing, analytics, workflow automation, lead management and brand management in one platform.",
  alternates: { canonical: "/features" },
};

const FEATURES = [
  { id: "content", icon: FileText, title: "AI Content Studio", text: "Generate blogs, landing pages, ads, emails, product descriptions and SEO meta in eight tones. Edit in a rich text editor with Markdown support, inline AI actions (rewrite, summarize, expand, change tone, repurpose), autosave and version history. Export as Markdown, HTML or text, or share a read-only link.", bullets: ["7 purpose-built generators", "Inline AI actions on any selection", "Version history with one-click restore", "Share links and exports"] },
  { id: "campaigns", icon: Megaphone, title: "Campaign Manager", text: "Define objectives, audiences, budgets, timelines and channels. Generate a full strategy with the Marketing Strategist and turn its deliverables into tasks. Submit for approval, launch, pause and complete with a guided lifecycle.", bullets: ["AI-generated strategy", "Tasks assigned to people or AI workers", "Approval workflow", "Performance tracking per campaign"] },
  { id: "social", icon: CalendarClock, title: "Social Media Automation", text: "Connect Instagram, Facebook, LinkedIn, X, YouTube and TikTok. Plan on a calendar, write captions with AI, get hashtag suggestions, preview posts per platform and route them through approval before scheduling.", bullets: ["Content calendar", "AI captions & hashtags", "Approval before publishing", "Engagement analytics"] },
  { id: "workers", icon: Bot, title: "AI Marketing Workers", text: "Eight specialists, each with a role, capabilities, task history, custom instructions, model selection and usage tracking. Chat with a worker, assign tasks, and approve or reject output.", bullets: ["Configurable instructions & model", "Task and output history", "Approval workflow", "Cost and token tracking"] },
  { id: "seo", icon: Search, title: "SEO Automation", text: "Run on-page audits with an SEO score, track keywords and positions, find content opportunities, get internal-linking suggestions and research competitors.", bullets: ["18-point website audit", "Keyword tracking", "Content gap analysis", "Competitor research"] },
  { id: "email", icon: Mail, title: "Email Marketing", text: "Build segments, write emails with AI, send broadcasts or multi-step sequences, and track opens, clicks, conversions and unsubscribes — with List-Unsubscribe headers built in.", bullets: ["Audience segmentation", "Merge-tag personalization", "Sequences & scheduling", "Unsubscribe management"] },
  { id: "analytics", icon: BarChart3, title: "Analytics", text: "Overview, campaign, social, website, lead, email, AI-usage and conversion analytics with custom date ranges, CSV exports and PDF reports.", bullets: ["Custom date ranges", "Lead funnel", "AI cost tracking", "PDF reports"] },
  { id: "automation", icon: Workflow, title: "Workflow Automation", text: "Combine triggers (new lead, status change, content published, campaign completed, low engagement, schedule, webhook) with conditions, delays and actions — including AI actions and signed webhooks.", bullets: ["10 step types", "Delays up to a year", "Execution logs", "Inbound webhooks"] },
  { id: "leads", icon: Users, title: "Lead Management", text: "A full lead database with sources, statuses, scoring, tags, notes, tasks, activity history, a drag-free pipeline view and CSV import/export.", bullets: ["Automatic lead scoring", "Pipeline stages", "Notes, calls & tasks", "CSV import & export"] },
  { id: "brand", icon: Palette, title: "Brand Management", text: "Your logo, colors, typography, voice, audience, products, USPs, competitors and guidelines in one Brand Kit — injected into every AI request.", bullets: ["Voice & tone rules", "Do's and don'ts", "Brand colors & fonts", "Completeness score"] },
];

export default function FeaturesPage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="bg-hero-glow absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
          <p className="text-sm font-semibold text-primary">Features</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Every marketing operation, powered by AI</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">Ten connected modules that share one brand, one audience and one source of truth.</p>
          <nav className="mt-8 flex flex-wrap justify-center gap-2" aria-label="Features">
            {FEATURES.map((f) => (
              <a key={f.id} href={`#${f.id}`} className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
                {f.title}
              </a>
            ))}
          </nav>
        </div>
      </section>
      {FEATURES.map((f, i) => (
        <Section key={f.id} id={f.id} className={i % 2 === 0 ? "bg-surface" : ""}>
          <div className="grid items-start gap-10 lg:grid-cols-2">
            <div>
              <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="size-5" />
              </span>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">{f.title}</h2>
              <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">{f.text}</p>
            </div>
            {f.id === "workers" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {WORKER_TEMPLATES.map((w) => (
                  <div key={w.key} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 card-shadow">
                    <span className="grid size-9 place-items-center rounded-lg text-white" style={{ background: w.color }}>
                      <WorkerIcon name={w.icon} className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">{w.title}</p>
                      <p className="text-xs text-muted-foreground">{w.capabilities.length} capabilities</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {f.bullets.map((b) => (
                  <li key={b} className="rounded-xl border border-border bg-card p-4 text-sm font-medium card-shadow">
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>
      ))}
      <Section id="integrations">
        <SectionHeading eyebrow="Integrations" title="An integration layer, not a pile of plugins" description="Providers plug into a shared abstraction, so new channels are added without touching your workflows." />
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {INTEGRATION_CATEGORIES.map((cat) => (
            <div key={cat} className="rounded-2xl border border-border bg-card p-5 card-shadow">
              <h3 className="font-semibold">{cat}</h3>
              <ul className="mt-3 space-y-2">
                {INTEGRATIONS.filter((i) => i.category === cat).map((i) => (
                  <li key={i.key} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="grid size-6 place-items-center rounded-md text-[10px] font-bold text-white" style={{ background: i.color }}>
                      {i.logo}
                    </span>
                    {i.name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Button asChild size="lg">
            <Link href="/signup">
              Try every feature free <ArrowRight />
            </Link>
          </Button>
        </div>
      </Section>
      <CtaBanner />
    </>
  );
}
