"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2 } from "lucide-react";

const CASES = [
  { key: "founders", label: "Startup founders", headline: "Marketing without a marketing hire", points: ["Nova builds your go-to-market plan in minutes", "Quill writes launch posts and landing pages", "Automations follow up with every signup"] },
  { key: "smb", label: "Small businesses", headline: "Consistent marketing, every week", points: ["A month of social posts planned in an hour", "Email newsletters written in your voice", "Simple dashboards that show what's working"] },
  { key: "teams", label: "Marketing teams", headline: "More output, same headcount", points: ["Approval workflows keep quality high", "Campaign plans with tasks and owners", "Roles and permissions for every teammate"] },
  { key: "agencies", label: "Agencies", headline: "One workspace per client", points: ["Separate Brand Kits, teams and billing", "Client-ready PDF performance reports", "Share links for fast client approvals"] },
  { key: "ecommerce", label: "E-commerce", headline: "Sell more with less busywork", points: ["Product descriptions at catalog scale", "Promotional email sequences", "Ad copy variations for every angle"] },
  { key: "saas", label: "SaaS companies", headline: "Pipeline, not vanity metrics", points: ["Lead scoring and pipeline stages", "Trial nurture sequences", "SEO briefs that target buying intent"] },
  { key: "creators", label: "Content creators", headline: "Create once, publish everywhere", points: ["Repurpose one idea into ten formats", "Captions and hashtags per platform", "A content calendar that fills itself"] },
];

export function UseCases() {
  return (
    <Tabs defaultValue="founders" className="mt-10">
      <div className="flex justify-center">
        <TabsList>
          {CASES.map((c) => (
            <TabsTrigger key={c.key} value={c.key}>
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {CASES.map((c) => (
        <TabsContent key={c.key} value={c.key}>
          <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-8 text-center card-shadow">
            <h3 className="text-xl font-semibold">{c.headline}</h3>
            <ul className="mt-5 inline-flex flex-col gap-2.5 text-left text-[15px]">
              {c.points.map((p) => (
                <li key={p} className="flex gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" /> {p}
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
