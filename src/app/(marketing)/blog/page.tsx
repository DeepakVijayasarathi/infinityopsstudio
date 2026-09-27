import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { listBlogPosts, featuredPosts } from "@/server/services/public";
import { Section } from "@/components/marketing/section";
import { cn, formatDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Blog",
  description: "Practical guides on AI marketing, automation, SEO, email, social media and analytics from the Infinity Ops Studio team.",
  alternates: { canonical: "/blog" },
};

type SP = Promise<{ category?: string; q?: string; page?: string }>;

export default async function BlogPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [data, featured] = await Promise.all([listBlogPosts({ category: sp.category, q: sp.q, page }), sp.category || sp.q || page > 1 ? Promise.resolve([]) : featuredPosts()]);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { category: sp.category, q: sp.q, ...patch };
    Object.entries(merged).forEach(([k, v]) => v && p.set(k, v));
    const s = p.toString();
    return s ? `/blog?${s}` : "/blog";
  };
  return (
    <Section>
      <div className="max-w-2xl">
        <p className="text-sm font-semibold text-primary">Blog</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Playbooks for AI-powered marketing</h1>
        <p className="mt-4 text-lg text-muted-foreground">Practical, tested advice from our product and marketing team.</p>
      </div>

      <div className="mt-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <nav className="flex flex-wrap gap-2" aria-label="Categories">
          <Link href="/blog" className={cn("rounded-full border px-3 py-1.5 text-sm", !sp.category ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
            All
          </Link>
          {data.categories.map((c) => (
            <Link key={c.name} href={qs({ category: c.name, page: undefined })} className={cn("rounded-full border px-3 py-1.5 text-sm", sp.category === c.name ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
              {c.name} <span className="text-xs opacity-70">{c.count}</span>
            </Link>
          ))}
        </nav>
        <form action="/blog" className="relative w-full lg:w-72" role="search">
          {sp.category && <input type="hidden" name="category" value={sp.category} />}
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input name="q" defaultValue={sp.q} placeholder="Search articles" aria-label="Search articles" className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
        </form>
      </div>

      {featured.length > 0 && (
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {featured.map((p, i) => (
            <Link key={p.slug} href={`/blog/${p.slug}`} className={cn("group rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-6 card-shadow transition hover:border-primary/40", i === 0 && "lg:col-span-2")}>
              <span className="text-xs font-semibold uppercase tracking-wide text-primary">Featured · {p.category}</span>
              <h2 className={cn("mt-3 font-semibold tracking-tight group-hover:text-primary", i === 0 ? "text-2xl" : "text-lg")}>{p.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{p.excerpt}</p>
              <p className="mt-4 text-xs text-muted-foreground">
                {p.authorName} · {formatDate(p.publishedAt)} · {p.readingMinutes} min read
              </p>
            </Link>
          ))}
        </div>
      )}

      {data.items.length === 0 ? (
        <p className="mt-16 text-center text-muted-foreground">No articles match your search. <Link href="/blog" className="text-primary hover:underline">View all articles</Link></p>
      ) : (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((p) => (
            <article key={p.slug} className="group flex flex-col rounded-2xl border border-border bg-card p-6 card-shadow transition hover:border-primary/40">
              <span className="text-xs font-medium text-primary">{p.category}</span>
              <h2 className="mt-2 text-lg font-semibold leading-snug group-hover:text-primary">
                <Link href={`/blog/${p.slug}`}>{p.title}</Link>
              </h2>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{p.excerpt}</p>
              <p className="mt-4 text-xs text-muted-foreground">
                {formatDate(p.publishedAt)} · {p.readingMinutes} min read
              </p>
            </article>
          ))}
        </div>
      )}

      {data.totalPages > 1 && (
        <nav className="mt-10 flex justify-center gap-2" aria-label="Pagination">
          {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((n) => (
            <Link key={n} href={qs({ page: n === 1 ? undefined : String(n) })} aria-current={n === page ? "page" : undefined} className={cn("grid size-9 place-items-center rounded-lg border text-sm", n === page ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>
              {n}
            </Link>
          ))}
        </nav>
      )}
    </Section>
  );
}
