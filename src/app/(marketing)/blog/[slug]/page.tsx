import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getBlogPost } from "@/server/services/public";
import { renderMarkdown } from "@/server/services/content";
import { siteConfig } from "@/config/site";
import { formatDate } from "@/lib/utils";
import { CtaBanner } from "@/components/marketing/cta";
import { ShareButtons } from "./share-buttons";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getBlogPost(slug);
  if (!data) return { title: "Article not found" };
  const { post } = data;
  return {
    title: post.seoTitle ?? post.title,
    description: post.seoDescription ?? post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: { type: "article", title: post.title, description: post.excerpt, publishedTime: post.publishedAt?.toISOString(), authors: [post.authorName], tags: post.tags, url: `/blog/${post.slug}`, images: [{ url: `/og?title=${encodeURIComponent(post.title)}` }] },
    twitter: { card: "summary_large_image", title: post.title, description: post.excerpt, images: [`/og?title=${encodeURIComponent(post.title)}`] },
  };
}

export default async function BlogPostPage({ params }: { params: Params }) {
  const { slug } = await params;
  const data = await getBlogPost(slug);
  if (!data) notFound();
  const { post, related } = data;
  const url = `${siteConfig.url}/blog/${post.slug}`;
  const ld = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt?.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: { "@type": "Person", name: post.authorName },
    publisher: { "@type": "Organization", name: siteConfig.company },
    mainEntityOfPage: url,
    keywords: post.tags.join(", "),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <Link href="/blog" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> All articles
        </Link>
        <p className="mt-8 text-sm font-semibold text-primary">{post.category}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{post.title}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{post.excerpt}</p>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-y border-border py-4">
          <p className="text-sm">
            <span className="font-medium">{post.authorName}</span>
            {post.authorRole && <span className="text-muted-foreground"> · {post.authorRole}</span>}
            <span className="text-muted-foreground">
              {" "}
              · {formatDate(post.publishedAt)} · {post.readingMinutes} min read
            </span>
          </p>
          <ShareButtons url={url} title={post.title} />
        </div>
        <div className="prose-ios mt-8 text-[17px] leading-8" dangerouslySetInnerHTML={{ __html: renderMarkdown(post.body) }} />
        <ul className="mt-10 flex flex-wrap gap-2">
          {post.tags.map((t) => (
            <li key={t}>
              <Link href={`/blog?q=${encodeURIComponent(t)}`} className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground hover:text-foreground">
                #{t}
              </Link>
            </li>
          ))}
        </ul>
      </article>
      {related.length > 0 && (
        <section className="border-t border-border bg-surface px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-xl font-semibold">Related articles</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {related.map((r) => (
                <Link key={r.slug} href={`/blog/${r.slug}`} className="rounded-2xl border border-border bg-card p-5 card-shadow transition hover:border-primary/40">
                  <p className="text-xs font-medium text-primary">{r.category}</p>
                  <h3 className="mt-2 font-semibold leading-snug">{r.title}</h3>
                  <p className="mt-2 text-xs text-muted-foreground">{r.readingMinutes} min read</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
      <CtaBanner />
    </>
  );
}
