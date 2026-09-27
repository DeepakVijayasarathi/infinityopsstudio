import type { Metadata } from "next";
import { LegalPage } from "../legal";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "Privacy Policy", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="September 1, 2026"
      sections={[
        { h: "Who we are", p: [`${siteConfig.name} is operated by ${siteConfig.company} ("we", "us"). This policy explains how we collect, use and protect personal data when you use our website and platform.`] },
        { h: "Data we collect", p: ["Account data: name, email address, password hash, and optional profile photo.", "Workspace data you create: campaigns, content, leads, brand information, files and settings.", "Usage data: pages visited, features used, AI requests (tokens, model and cost), device and browser information and IP address.", "Billing data: plan, invoices and payment status. Card details are handled by our payment processors and never stored by us."] },
        { h: "How we use data", p: ["To provide and secure the service, including authentication, fraud prevention and audit logging.", "To process AI requests on your behalf with the AI providers configured by your workspace administrator.", "To send transactional emails (verification, password reset, notifications) and, with consent, product updates.", "To improve the product using aggregated, de-identified analytics."] },
        { h: "AI providers", p: ["Prompts and your Brand Kit context are sent to the AI provider selected for each request (for example Anthropic, OpenAI or Google) solely to generate output. We do not use your content to train our own models."] },
        { h: "Sharing", p: ["We share data only with sub-processors needed to run the service (hosting, email delivery, payments, AI providers), when required by law, or with your explicit instruction (for example integrations you connect)."] },
        { h: "Security", p: ["Workspaces are logically isolated. Integration credentials and two-factor secrets are encrypted with AES-256-GCM. Passwords are hashed with bcrypt. Sessions rotate automatically and can be revoked from your security settings."] },
        { h: "Retention", p: ["We retain data while your account is active. Deleted items are soft-deleted and permanently purged within 30 days; you can request full deletion of your account at any time from Settings."] },
        { h: "Your rights", p: [`You can access, correct, export or delete your personal data. Contact ${siteConfig.supportEmail} to exercise these rights. You may also lodge a complaint with your local data protection authority.`] },
        { h: "Contact", p: [`Questions about this policy: ${siteConfig.supportEmail}.`] },
      ]}
    />
  );
}
