import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { Section, SectionHeading } from "@/components/marketing/section";
import { PricingTable } from "@/components/marketing/pricing-table";
import { Faq } from "@/components/marketing/faq";
import { CtaBanner } from "@/components/marketing/cta";
import { PLANS } from "@/config/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple plans for every stage: Free, Starter, Growth, Scale and Enterprise. Start free with two AI workers and 100 AI credits.",
  alternates: { canonical: "/pricing" },
};

const fmt = (n: number) => (n < 0 ? "Unlimited" : n.toLocaleString());
const ROWS: { label: string; get: (p: (typeof PLANS)[number]) => string | boolean }[] = [
  { label: "AI credits / month", get: (p) => fmt(p.limits.aiCredits) },
  { label: "Team seats", get: (p) => fmt(p.limits.seats) },
  { label: "Active AI workers", get: (p) => String(p.limits.activeWorkers) },
  { label: "Campaigns", get: (p) => fmt(p.limits.campaigns) },
  { label: "Social accounts", get: (p) => fmt(p.limits.socialAccounts) },
  { label: "Emails / month", get: (p) => fmt(p.limits.emailsPerMonth) },
  { label: "Contacts", get: (p) => fmt(p.limits.contacts) },
  { label: "Active automations", get: (p) => fmt(p.limits.automations) },
  { label: "Brand Kit & approvals", get: () => true },
  { label: "PDF reports", get: (p) => p.key !== "FREE" && p.key !== "STARTER" },
  { label: "Custom roles", get: (p) => p.key === "SCALE" || p.key === "ENTERPRISE" },
  { label: "SSO & audit exports", get: (p) => p.key === "ENTERPRISE" },
];

export default function PricingPage() {
  return (
    <>
      <Section>
        <div className="text-center">
          <p className="text-sm font-semibold text-primary">Pricing</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Plans that grow with your team</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">Start free. Upgrade, downgrade or cancel anytime.</p>
        </div>
        <div className="mt-12">
          <PricingTable />
        </div>
      </Section>
      <Section className="bg-surface">
        <SectionHeading title="Compare plans" />
        <div className="mt-10 overflow-x-auto rounded-2xl border border-border bg-card card-shadow">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Plan comparison</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-5 py-4 text-left font-medium text-muted-foreground">
                  Feature
                </th>
                {PLANS.map((p) => (
                  <th key={p.key} scope="col" className="px-5 py-4 text-center font-semibold">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ROWS.map((r) => (
                <tr key={r.label}>
                  <th scope="row" className="px-5 py-3 text-left font-normal text-muted-foreground">
                    {r.label}
                  </th>
                  {PLANS.map((p) => {
                    const v = r.get(p);
                    return (
                      <td key={p.key} className="px-5 py-3 text-center tabular-nums">
                        {v === true ? <Check className="mx-auto size-4 text-success" aria-label="Included" /> : v === false ? <Minus className="mx-auto size-4 text-muted-foreground" aria-label="Not included" /> : v}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section>
        <SectionHeading title="Pricing FAQ" />
        <div className="mt-10">
          <Faq />
        </div>
      </Section>
      <CtaBanner />
    </>
  );
}
