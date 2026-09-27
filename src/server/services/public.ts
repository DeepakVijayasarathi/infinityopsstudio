import type { ContactType } from "@prisma/client";
import { db } from "../db";
import { sendEmail } from "../email";
import { layout, escapeHtml } from "../email/templates";
import { siteConfig } from "@/config/site";

export async function listBlogPosts(opts: { category?: string; q?: string; page?: number; pageSize?: number }) {
  const pageSize = opts.pageSize ?? 9;
  const page = Math.max(1, opts.page ?? 1);
  const where = {
    publishedAt: { lte: new Date() },
    ...(opts.category ? { category: opts.category } : {}),
    ...(opts.q ? { OR: [{ title: { contains: opts.q, mode: "insensitive" as const } }, { excerpt: { contains: opts.q, mode: "insensitive" as const } }, { tags: { has: opts.q.toLowerCase() } }] } : {}),
  };
  const [items, total, categories] = await Promise.all([
    db.blogPost.findMany({ where, orderBy: { publishedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: { slug: true, title: true, excerpt: true, category: true, authorName: true, publishedAt: true, readingMinutes: true, featured: true, coverImage: true } }),
    db.blogPost.count({ where }),
    db.blogPost.groupBy({ by: ["category"], where: { publishedAt: { lte: new Date() } }, _count: true }),
  ]);
  return { items, total, page, totalPages: Math.max(1, Math.ceil(total / pageSize)), categories: categories.map((c) => ({ name: c.category, count: c._count })) };
}

export async function featuredPosts() {
  return db.blogPost.findMany({ where: { featured: true, publishedAt: { lte: new Date() } }, orderBy: { publishedAt: "desc" }, take: 3 });
}

export async function getBlogPost(slug: string) {
  const post = await db.blogPost.findFirst({ where: { slug, publishedAt: { lte: new Date() } } });
  if (!post) return null;
  const related = await db.blogPost.findMany({
    where: { slug: { not: slug }, publishedAt: { lte: new Date() }, OR: [{ category: post.category }, { tags: { hasSome: post.tags } }] },
    orderBy: { publishedAt: "desc" },
    take: 3,
    select: { slug: true, title: true, excerpt: true, category: true, readingMinutes: true, publishedAt: true },
  });
  return { post, related };
}

export async function submitContact(input: { type: ContactType; name: string; email: string; company?: string; teamSize?: string; message: string }, ip: string) {
  const row = await db.contactSubmission.create({ data: { ...input, ip } });
  const to = input.type === "SALES" ? siteConfig.salesEmail : siteConfig.supportEmail;
  await sendEmail({
    to,
    subject: `[${input.type}] New enquiry from ${input.name}`,
    text: `${input.name} <${input.email}> (${input.company ?? "—"}, ${input.teamSize ?? "—"})\n\n${input.message}`,
    html: layout(`New ${input.type.toLowerCase()} enquiry`, `<p><strong>${escapeHtml(input.name)}</strong> &lt;${escapeHtml(input.email)}&gt;<br>${escapeHtml(input.company ?? "")} ${escapeHtml(input.teamSize ?? "")}</p><p>${escapeHtml(input.message).replace(/\n/g, "<br>")}</p>`),
  });
  await sendEmail({
    to: input.email,
    subject: "We received your message",
    text: `Hi ${input.name},\n\nThanks for reaching out to ${siteConfig.name}. Our team will reply within one business day.\n\n— ${siteConfig.company}`,
    html: layout("Thanks for reaching out", `<p>Hi ${escapeHtml(input.name)},</p><p>Thanks for contacting ${escapeHtml(siteConfig.name)}. Our team will get back to you within one business day.</p>`),
  });
  return { id: row.id };
}
