import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSharedContent, renderMarkdown } from "@/server/services/content";
import { Logo } from "@/components/app/logo";
import { CONTENT_TYPE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Shared content", robots: { index: false, follow: false } };

export default async function SharedContentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const content = await getSharedContent(token);
  if (!content) notFound();
  return (
    <div className="min-h-dvh bg-surface">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Logo />
          <span className="text-xs text-muted-foreground">Shared by {content.workspace.name}</span>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-10">
        <article className="rounded-2xl border border-border bg-card p-6 card-shadow sm:p-10">
          <p className="text-xs font-medium text-primary">{CONTENT_TYPE_LABELS[content.type]}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{content.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Updated {formatDate(content.updatedAt)}</p>
          <div className="prose-ios mt-8" dangerouslySetInnerHTML={{ __html: renderMarkdown(content.body) }} />
        </article>
      </main>
    </div>
  );
}
