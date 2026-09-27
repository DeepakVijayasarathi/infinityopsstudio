import type { MetadataRoute } from "next";
import { db } from "@/server/db";
import { siteConfig } from "@/config/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url;
  const staticPages = ["", "/features", "/pricing", "/about", "/contact", "/blog", "/privacy", "/terms"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: p === "" || p === "/blog" ? ("weekly" as const) : ("monthly" as const),
    priority: p === "" ? 1 : p === "/pricing" || p === "/features" ? 0.9 : 0.6,
  }));
  const posts = await db.blogPost.findMany({ where: { publishedAt: { lte: new Date() } }, select: { slug: true, updatedAt: true } }).catch(() => []);
  return [...staticPages, ...posts.map((p) => ({ url: `${base}/blog/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "monthly" as const, priority: 0.7 }))];
}
