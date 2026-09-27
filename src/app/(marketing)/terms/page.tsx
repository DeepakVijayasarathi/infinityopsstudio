import type { Metadata } from "next";
import { LegalPage } from "../legal";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "Terms of Service", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="September 1, 2026"
      sections={[
        { h: "Agreement", p: [`These terms govern your use of ${siteConfig.name}, provided by ${siteConfig.company}. By creating an account you agree to them on behalf of yourself or the organization you represent.`] },
        { h: "Accounts", p: ["You are responsible for your account credentials and for activity in your workspaces. Enable two-factor authentication for stronger protection. Notify us promptly of any unauthorized access."] },
        { h: "Acceptable use", p: ["Do not use the service to send spam or unsolicited email, infringe intellectual property, generate unlawful or deceptive content, attempt to access other tenants' data, or disrupt the platform. You must comply with anti-spam laws and include a working unsubscribe link in marketing email."] },
        { h: "Your content", p: ["You own the content you create or upload, including AI-generated output produced for your workspace. You grant us a limited license to host and process it only to provide the service."] },
        { h: "AI output", p: ["AI-generated content can be inaccurate. You are responsible for reviewing output before publishing. Approval workflows are provided to help you do so."] },
        { h: "Plans and billing", p: ["Paid plans renew automatically each billing period until cancelled. Upgrades apply immediately; downgrades apply at the end of the current period. Usage beyond plan limits requires an upgrade. Fees are non-refundable except where required by law."] },
        { h: "Availability", p: ["We aim for high availability and perform maintenance with notice where possible. Enterprise customers may have a separate service-level agreement."] },
        { h: "Termination", p: ["You may cancel at any time. We may suspend accounts that violate these terms. Upon termination you can export your data for 30 days."] },
        { h: "Liability", p: ["To the extent permitted by law, the service is provided “as is” and our aggregate liability is limited to the fees you paid in the 12 months before the claim."] },
        { h: "Contact", p: [`Questions about these terms: ${siteConfig.supportEmail}.`] },
      ]}
    />
  );
}
