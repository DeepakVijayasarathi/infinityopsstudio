import type { Metadata } from "next";
import { Section, SectionHeading } from "@/components/marketing/section";
import { CtaBanner } from "@/components/marketing/cta";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "About",
  description: `${siteConfig.name} is built by ${siteConfig.company} to give every business an AI marketing operations team.`,
  alternates: { canonical: "/about" },
};

const VALUES = [
  { title: "Humans stay in charge", text: "AI drafts; people decide. Approval workflows, audit logs and clear permissions are built into every module." },
  { title: "Brand first", text: "Generic AI copy is noise. Every worker is grounded in your Brand Kit so output sounds like you from the first draft." },
  { title: "Measured, not magic", text: "We track the tokens, cost and results of every AI request so you can prove ROI — and cut what doesn't work." },
  { title: "Secure by default", text: "Tenant isolation, encrypted credentials, rotating sessions and two-factor authentication are standard, not add-ons." },
];

export default function AboutPage() {
  return (
    <>
      <Section>
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold text-primary">About us</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Marketing teams deserve leverage, not more tools</h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            {siteConfig.name} is built by {siteConfig.company}. We watched talented marketers spend most of their week moving work between spreadsheets, docs and a dozen disconnected apps. So we built one platform where specialized AI workers do the repetitive parts — and your team does the thinking.
          </p>
        </div>
      </Section>
      <Section className="bg-surface">
        <SectionHeading title="What we believe" />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {VALUES.map((v) => (
            <div key={v.title} className="rounded-2xl border border-border bg-card p-6 card-shadow">
              <h2 className="text-lg font-semibold">{v.title}</h2>
              <p className="mt-2 leading-relaxed text-muted-foreground">{v.text}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section>
        <div className="mx-auto grid max-w-4xl gap-6 text-center sm:grid-cols-3">
          {[
            ["8", "specialized AI workers"],
            ["10", "connected marketing modules"],
            ["3", "AI providers supported"],
          ].map(([n, l]) => (
            <div key={l}>
              <p className="text-4xl font-semibold tracking-tight text-gradient">{n}</p>
              <p className="mt-1 text-muted-foreground">{l}</p>
            </div>
          ))}
        </div>
      </Section>
      <CtaBanner />
    </>
  );
}
