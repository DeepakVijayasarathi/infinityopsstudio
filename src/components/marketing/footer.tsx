import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { siteConfig } from "@/config/site";

const COLUMNS = [
  { title: "Product", links: [["Features", "/features"], ["AI Workers", "/features#workers"], ["Pricing", "/pricing"], ["Integrations", "/features#integrations"]] },
  { title: "Resources", links: [["Blog", "/blog"], ["Brand voice guide", "/blog/brand-voice-for-ai-content"], ["Automation playbook", "/blog/marketing-automation-workflows-that-pay-off"]] },
  { title: "Company", links: [["About", "/about"], ["Contact sales", "/contact?type=SALES"], ["Support", "/contact?type=SUPPORT"]] },
  { title: "Legal", links: [["Privacy Policy", "/privacy"], ["Terms of Service", "/terms"]] },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">{siteConfig.tagline}. Plan, create, automate and measure marketing with specialized AI workers.</p>
          <p className="text-sm text-muted-foreground">
            <a href={`mailto:${siteConfig.supportEmail}`} className="hover:text-foreground">
              {siteConfig.supportEmail}
            </a>
          </p>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <h3 className="text-sm font-semibold">{c.title}</h3>
            <ul className="mt-3 space-y-2">
              {c.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href!} className="text-sm text-muted-foreground hover:text-foreground">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>
            © {new Date().getFullYear()} {siteConfig.company}. All rights reserved.
          </p>
          <div className="flex gap-4">
            <a href={siteConfig.social.linkedin} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
              LinkedIn
            </a>
            <a href={siteConfig.social.x} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
              X
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
