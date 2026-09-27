import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  FileText,
  GitBranch,
  Mail,
  Megaphone,
  PenLine,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, SectionHeading } from "@/components/marketing/section";
import { PricingTable } from "@/components/marketing/pricing-table";
import { Faq, FAQ } from "@/components/marketing/faq";
import { CtaBanner } from "@/components/marketing/cta";
import { WorkerIcon } from "@/components/marketing/worker-icon";
import { WORKER_TEMPLATES } from "@/config/workers";
import { INTEGRATIONS } from "@/server/integrations/registry";
import { siteConfig } from "@/config/site";
import { UseCases } from "./use-cases";

export const metadata: Metadata = {
  title: { absolute: `${siteConfig.name} — ${siteConfig.tagline}` },
  description: siteConfig.description,
  alternates: { canonical: "/" },
};

const CAPABILITIES = [
  { icon: Sparkles, title: "AI Content Studio", text: "Blogs, landing pages, ads, emails and social posts in your brand voice — with a rich editor, versions and inline AI actions." },
  { icon: Megaphone, title: "Campaign Manager", text: "Objectives, audiences, budgets, timelines and channels, with an AI-generated strategy and task plan for every campaign." },
  { icon: CalendarClock, title: "Social Media Automation", text: "Plan a content calendar, write captions, suggest hashtags, route posts for approval and schedule them across six networks." },
  { icon: Search, title: "SEO Automation", text: "Website audits, keyword tracking, content opportunities, internal-link suggestions and competitor research." },
  { icon: Mail, title: "Email Marketing", text: "Segments, templates, broadcasts and multi-step sequences with open, click and unsubscribe tracking." },
  { icon: Users, title: "Lead Management", text: "Pipeline, scoring, notes, tasks, activity history and CSV import/export for every lead." },
  { icon: Workflow, title: "Workflow Automation", text: "Triggers, conditions, delays and AI actions that connect every module — no code required." },
  { icon: BarChart3, title: "Analytics", text: "Campaign, channel, lead, email and AI-usage analytics with custom date ranges and PDF reports." },
];

const TESTIMONIALS = [
  { quote: "We replaced three freelancers and a content calendar spreadsheet. Our output tripled and approvals take minutes.", name: "Dana Whitfield", role: "Head of Marketing, BluePeak Logistics" },
  { quote: "The Brand Kit is the magic. Every draft from Quill sounds like us on the first try — our editor mostly adds customer names now.", name: "Marco Bellini", role: "Founder, Verde Home Goods" },
  { quote: "As an agency, separate workspaces per client with their own brand context and billing was the deciding feature.", name: "Priya Nandakumar", role: "Managing Director, Northlight Agency" },
];

function HeroMock() {
  const bars = [38, 52, 45, 61, 58, 72, 69, 84, 78, 92, 88, 97];
  return (
    <div className="relative mx-auto mt-16 max-w-5xl" aria-hidden>
      <div className="absolute -inset-4 rounded-[28px] bg-gradient-to-tr from-indigo-500/20 via-violet-500/10 to-sky-500/20 blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center gap-1.5 border-b border-border bg-surface px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-xs text-muted-foreground">app.infinityops.studio / overview</span>
        </div>
        <div className="grid gap-4 p-4 sm:p-6 md:grid-cols-[1.6fr_1fr]">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                ["Leads", "1,284", "+18.2%"],
                ["Conversion", "4.9%", "+0.6pt"],
                ["Content", "326", "+42"],
              ].map(([l, v, d]) => (
                <div key={l} className="rounded-xl border border-border p-3">
                  <p className="text-[11px] text-muted-foreground">{l}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{v}</p>
                  <p className="text-[11px] font-medium text-success">{d}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-border p-4">
              <p className="text-xs font-medium text-muted-foreground">Campaign performance</p>
              <div className="mt-3 flex h-32 items-end gap-1.5">
                {bars.map((h, i) => (
                  <div key={i} className="flex-1 rounded-t-[4px]" style={{ height: `${h}%`, background: "var(--series-1)", opacity: 0.55 + i * 0.035 }} />
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-2.5 rounded-xl border border-border p-4">
            <p className="text-xs font-medium text-muted-foreground">AI workers</p>
            {WORKER_TEMPLATES.slice(0, 4).map((w, i) => (
              <div key={w.key} className="flex items-center gap-2.5 rounded-lg bg-surface p-2.5">
                <span className="grid size-8 place-items-center rounded-lg text-white" style={{ background: w.color }}>
                  <WorkerIcon name={w.icon} className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{w.name} · {w.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{["Planning Q4 launch strategy", "Writing: 5 signs your routes cost you", "Scheduling 12 posts", "Keyword brief: fleet software"][i]}</p>
                </div>
                <span className={`size-2 rounded-full ${i === 1 ? "animate-pulse bg-warning" : "bg-success"}`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  const orgLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: siteConfig.description,
    offers: { "@type": "AggregateOffer", lowPrice: "0", highPrice: "199", priceCurrency: "USD" },
    publisher: { "@type": "Organization", name: siteConfig.company, url: siteConfig.url },
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="bg-hero-glow absolute inset-0" aria-hidden />
        <div className="bg-grid absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
          <Link href="/features#workers" className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm hover:text-foreground">
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">New</span> 8 specialized AI marketing workers <ArrowRight className="size-3" />
          </Link>
          <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-semibold tracking-tight sm:text-6xl sm:leading-[1.05]">
            Your AI marketing <span className="text-gradient">operations team</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Plan campaigns, generate on-brand content, automate workflows, manage social media and measure what works — with AI workers that know your brand.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/signup">
                Start free <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/contact?type=SALES">Book a demo</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Free plan · No credit card · Set up in 5 minutes</p>
          <HeroMock />
        </div>
      </section>

      {/* AI workers */}
      <Section id="workers" className="bg-surface">
        <SectionHeading eyebrow="AI marketing workers" title="Eight specialists. One brand voice." description="Each worker has a role, a menu of proven capabilities and your Brand Kit. Assign a task, review the output, ship it." />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WORKER_TEMPLATES.map((w) => (
            <div key={w.key} className="group rounded-2xl border border-border bg-card p-5 card-shadow transition hover:-translate-y-0.5 hover:border-primary/40">
              <span className="grid size-10 place-items-center rounded-xl text-white" style={{ background: w.color }}>
                <WorkerIcon name={w.icon} className="size-5" />
              </span>
              <h3 className="mt-4 font-semibold">{w.title}</h3>
              <p className="text-xs text-muted-foreground">Meet {w.name}</p>
              <p className="mt-2 text-sm text-muted-foreground">{w.description}</p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {w.capabilities.map((c) => (
                  <li key={c.key} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {c.label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <Section>
        <SectionHeading eyebrow="How it works" title="From brief to results in three steps" />
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            { icon: ShieldCheck, title: "Teach it your brand", text: "Add your voice, audience, products and rules to the Brand Kit once. Every worker uses it on every request." },
            { icon: Zap, title: "Assign work to AI workers", text: "Launch a campaign strategy, a month of social posts or an email sequence. Workers draft; your team reviews and approves." },
            { icon: BarChart3, title: "Automate and measure", text: "Connect triggers to actions, schedule publishing and track leads, conversions and cost per result in one dashboard." },
          ].map((s, i) => (
            <li key={s.title} className="relative rounded-2xl border border-border bg-card p-6 card-shadow">
              <span className="text-sm font-semibold text-primary">Step {i + 1}</span>
              <s.icon className="mt-3 size-6 text-primary" />
              <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Capabilities */}
      <Section className="bg-surface">
        <SectionHeading eyebrow="Capabilities" title="Everything marketing operations needs" description="One platform instead of eight disconnected tools — with AI built into every module." />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((c) => (
            <div key={c.title} className="rounded-2xl border border-border bg-card p-5 card-shadow">
              <c.icon className="size-5 text-primary" />
              <h3 className="mt-3 font-semibold">{c.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{c.text}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Campaign automation */}
      <Section>
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading align="left" eyebrow="Campaign automation" title="Workflows that run while you sleep" description="Connect every module with triggers, conditions, delays and AI actions. When a lead arrives, a blog goes live or a campaign ends, the right work starts automatically." />
            <ul className="mt-6 space-y-3 text-[15px]">
              {["New lead → qualify → welcome email → assign an AI worker", "New blog post → social posts → scheduled for approval", "Campaign completed → executive performance report", "Low engagement → AI optimization recommendations"].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6 card-shadow" aria-label="Example workflow">
            {[
              { icon: Users, label: "Trigger", text: "New lead created" },
              { icon: GitBranch, label: "Condition", text: "Lead score ≥ 30" },
              { icon: Mail, label: "Action", text: "Send personalized welcome email" },
              { icon: Sparkles, label: "AI action", text: "Nova drafts an account plan" },
            ].map((s, i, arr) => (
              <div key={s.text}>
                <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5">
                  <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                    <s.icon className="size-4" />
                  </span>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
                    <p className="text-sm font-medium">{s.text}</p>
                  </div>
                </div>
                {i < arr.length - 1 && <div className="ml-7 h-5 w-px bg-border" />}
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Content generation */}
      <Section className="bg-surface">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="order-2 rounded-2xl border border-border bg-card p-6 card-shadow lg:order-1" aria-label="Content editor preview">
            <div className="flex flex-wrap gap-1.5">
              {["Rewrite", "Summarize", "Expand", "Change tone", "Repurpose"].map((a) => (
                <span key={a} className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                  {a}
                </span>
              ))}
            </div>
            <h3 className="mt-5 text-xl font-semibold">How Coastal Freight cut fuel costs 16% in 90 days</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Every morning, Coastal Freight&apos;s dispatchers spent three hours building routes by hand. After switching to automated planning, the same work takes four minutes — and the savings started in week one…
            </p>
            <div className="mt-5 flex items-center justify-between rounded-lg bg-primary/5 px-3 py-2 text-xs">
              <span className="flex items-center gap-1.5 text-primary">
                <PenLine className="size-3.5" /> Quill · Content Writer
              </span>
              <span className="text-muted-foreground">Version 4 · Autosaved</span>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <SectionHeading align="left" eyebrow="Content generation" title="On-brand content at the speed of a prompt" description="Generators for every format, eight tones, a rich editor with inline AI actions, version history and one-click export or share links." />
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
              {["Blog posts", "Landing pages", "Ad copy", "Social captions", "Emails", "Product descriptions", "SEO meta", "Repurposing"].map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <FileText className="size-4 text-primary" /> {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Analytics */}
      <Section>
        <SectionHeading eyebrow="Analytics" title="Know what's working — and what it costs" description="Campaign, channel, lead-funnel, email and AI-usage analytics with custom date ranges, CSV export and branded PDF reports." />
        <div className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Qualified leads", "2,318", "+22% vs last quarter"],
            ["Cost per lead", "$38", "−14% vs last quarter"],
            ["Pipeline influenced", "$2.4M", "+31% vs last quarter"],
            ["AI cost per asset", "$0.09", "across 1,120 assets"],
          ].map(([l, v, d]) => (
            <div key={l} className="rounded-2xl border border-border bg-card p-5 text-center card-shadow">
              <p className="text-sm text-muted-foreground">{l}</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">{v}</p>
              <p className="mt-1 text-xs text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">Illustrative figures from a Growth-plan workspace.</p>
      </Section>

      {/* Integrations */}
      <Section id="integrations" className="bg-surface">
        <SectionHeading eyebrow="Integrations" title="Connects to the tools you already use" description="Social networks, email, analytics, CRM, ad platforms, AI providers and signed webhooks — through one integration layer." />
        <div className="mx-auto mt-12 grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {INTEGRATIONS.map((i) => (
            <div key={i.key} className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-3 card-shadow">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-white" style={{ background: i.color }}>
                {i.logo}
              </span>
              <span className="truncate text-sm font-medium">{i.name}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Use cases */}
      <Section>
        <SectionHeading eyebrow="Use cases" title="Built for every kind of marketing team" />
        <UseCases />
      </Section>

      {/* Testimonials */}
      <Section className="bg-surface">
        <SectionHeading eyebrow="Customers" title="Teams ship more with the same headcount" />
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} className="flex flex-col rounded-2xl border border-border bg-card p-6 card-shadow">
              <blockquote className="flex-1 text-[15px] leading-relaxed">“{t.quote}”</blockquote>
              <figcaption className="mt-5 text-sm">
                <p className="font-semibold">{t.name}</p>
                <p className="text-muted-foreground">{t.role}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </Section>

      {/* Pricing */}
      <Section id="pricing">
        <SectionHeading eyebrow="Pricing" title="Start free. Scale when you're ready." description="Every plan includes the Brand Kit, approval workflows and enterprise-grade security." />
        <div className="mt-12">
          <PricingTable />
        </div>
      </Section>

      {/* FAQ */}
      <Section className="bg-surface">
        <SectionHeading eyebrow="FAQ" title="Questions, answered" />
        <div className="mt-12">
          <Faq />
        </div>
      </Section>

      <CtaBanner />
    </>
  );
}
