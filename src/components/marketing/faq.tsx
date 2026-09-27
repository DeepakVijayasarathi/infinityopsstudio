import { ChevronDown } from "lucide-react";

export type FaqItem = { q: string; a: string };

export const FAQ: FaqItem[] = [
  { q: "What is an AI marketing worker?", a: "A specialized AI agent with a defined role (strategist, writer, SEO specialist and more), a menu of tested capabilities and access to your Brand Kit. You assign tasks; workers deliver drafts that go through your approval workflow." },
  { q: "Which AI models do you use?", a: "Infinity Ops Studio is model-agnostic. Administrators can route work to Anthropic Claude, OpenAI GPT or Google Gemini models, and you can choose a model per request where your admin allows it. Every request is tracked for tokens and cost." },
  { q: "Will AI publish anything without my approval?", a: "No. Workers submit output for review by default, and publishing social posts or sending email campaigns requires a Manager, Admin or Owner. You control approval rules per worker." },
  { q: "How do AI credits work?", a: "One credit covers roughly 1,000 tokens of AI input and output. Each plan includes a monthly allowance; you'll get an alert at 80% usage and can upgrade at any time." },
  { q: "Can I use Infinity Ops Studio for multiple brands or clients?", a: "Yes. Create a separate workspace per brand or client, each with its own Brand Kit, team, integrations and billing. Switch between them in one click." },
  { q: "Is my data secure?", a: "Workspaces are strictly isolated, credentials are encrypted at rest with AES-256-GCM, sessions rotate automatically, two-factor authentication is available and every sensitive action is written to an audit log." },
  { q: "Can I cancel anytime?", a: "Yes. Downgrades take effect at the end of your billing period, and you keep access to your content on the Free plan." },
];

/** Accessible FAQ using native <details> — no JavaScript required. */
export function Faq({ items = FAQ }: { items?: FaqItem[] }) {
  return (
    <div className="mx-auto max-w-3xl divide-y divide-border rounded-2xl border border-border bg-card card-shadow">
      {items.map((item) => (
        <details key={item.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-[15px] font-medium">
            {item.q}
            <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
