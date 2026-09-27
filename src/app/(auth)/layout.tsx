import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";

const points = ["8 specialized AI marketing workers", "Campaigns, content, social, SEO & email in one place", "Brand-safe output with approval workflows"];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <div className="flex flex-col">
        <header className="flex h-16 items-center justify-between px-4 sm:px-8">
          <Logo />
          <ThemeToggle />
        </header>
        <main id="main" className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-[400px] animate-slide-up">{children}</div>
        </main>
        <footer className="px-8 pb-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Infinity Uniquers ·{" "}
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
        </footer>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-border bg-surface lg:block" aria-hidden>
        <div className="bg-hero-glow absolute inset-0" />
        <div className="bg-grid absolute inset-0 opacity-60" />
        <div className="relative flex h-full flex-col justify-center p-12">
          <p className="text-sm font-medium text-primary">InfinityOps Studio</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">
            Your AI marketing <span className="text-gradient">operations team</span>
          </h2>
          <ul className="mt-8 space-y-3">
            {points.map((p) => (
              <li key={p} className="flex items-center gap-2.5 text-[15px] text-muted-foreground">
                <CheckCircle2 className="size-5 text-success" /> {p}
              </li>
            ))}
          </ul>
          <figure className="glass mt-12 rounded-2xl border border-border p-6 card-shadow">
            <blockquote className="text-[15px] leading-relaxed">
              “We ship three times more content with the same team — and every piece sounds like us. Approvals take minutes, not days.”
            </blockquote>
            <figcaption className="mt-4 text-sm">
              <span className="font-medium">Dana Whitfield</span> <span className="text-muted-foreground">· Head of Marketing, BluePeak Logistics</span>
            </figcaption>
          </figure>
        </div>
      </aside>
    </div>
  );
}
