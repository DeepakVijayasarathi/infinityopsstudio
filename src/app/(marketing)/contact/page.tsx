import type { Metadata } from "next";
import { Headphones, Mail, MessageSquare } from "lucide-react";
import { Section } from "@/components/marketing/section";
import { siteConfig } from "@/config/site";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Contact", description: "Talk to sales, get support or send us a message.", alternates: { canonical: "/contact" } };

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const initial = type === "SALES" || type === "SUPPORT" ? type : "GENERAL";
  return (
    <Section>
      <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <p className="text-sm font-semibold text-primary">Contact</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Let&apos;s talk</h1>
          <p className="mt-4 text-lg text-muted-foreground">Questions about plans, a demo for your team, or help with your workspace — we reply within one business day.</p>
          <ul className="mt-8 space-y-5">
            <li className="flex gap-3">
              <MessageSquare className="mt-0.5 size-5 text-primary" />
              <div>
                <p className="font-medium">Sales</p>
                <a href={`mailto:${siteConfig.salesEmail}`} className="text-sm text-muted-foreground hover:text-foreground">
                  {siteConfig.salesEmail}
                </a>
              </div>
            </li>
            <li className="flex gap-3">
              <Headphones className="mt-0.5 size-5 text-primary" />
              <div>
                <p className="font-medium">Support</p>
                <a href={`mailto:${siteConfig.supportEmail}`} className="text-sm text-muted-foreground hover:text-foreground">
                  {siteConfig.supportEmail}
                </a>
              </div>
            </li>
            <li className="flex gap-3">
              <Mail className="mt-0.5 size-5 text-primary" />
              <div>
                <p className="font-medium">Company</p>
                <p className="text-sm text-muted-foreground">{siteConfig.company}</p>
              </div>
            </li>
          </ul>
        </div>
        <ContactForm initialType={initial} />
      </div>
    </Section>
  );
}
