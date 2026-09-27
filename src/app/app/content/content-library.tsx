"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FilePlus2, FileText, Sparkles } from "lucide-react";
import { api } from "@/lib/api-client";
import { CONTENT_STATUSES, CONTENT_TYPE_LABELS, CONTENT_TYPES, humanize, type ContentType } from "@/lib/constants";

import { TimeAgo } from "@/components/ui/time";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { ListToolbar, UrlPagination } from "@/components/app/list-toolbar";

type Row = { id: string; title: string; type: ContentType; status: string; excerpt: string | null; wordCount: number; generatedByAI: boolean; updatedAt: string; author: { name: string } | null; campaign: { id: string; name: string } | null };

export function ContentLibrary({ data, canWrite }: { data: { items: Row[]; meta: { page: number; totalPages: number; total: number } }; canWrite: boolean }) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);

  async function blank() {
    setCreating(true);
    try {
      const c = await api.post<{ id: string }>("content", { title: "Untitled document", type: "OTHER", body: "" });
      router.push(`/app/content/${c.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setCreating(false);
    }
  }

  return (
    <>
      <ListToolbar
        placeholder="Search titles and text"
        filters={[
          { key: "type", label: "All types", options: CONTENT_TYPES.map((t) => ({ value: t, label: CONTENT_TYPE_LABELS[t] })) },
          { key: "status", label: "All statuses", options: CONTENT_STATUSES.map((s) => ({ value: s, label: humanize(s) })) },
        ]}
      >
        {canWrite && (
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="outline" onClick={blank} loading={creating}>
              <FilePlus2 /> Blank document
            </Button>
            <Button asChild>
              <Link href="/app/content/new">
                <Sparkles /> Generate with AI
              </Link>
            </Button>
          </div>
        )}
      </ListToolbar>
      <DataTable
        rows={data.items}
        rowKey={(r) => r.id}
        onRowClick={(r) => router.push(`/app/content/${r.id}`)}
        empty={
          <EmptyState
            icon={FileText}
            title="No content yet"
            description="Generate your first blog post, email or social caption in seconds."
            action={
              canWrite && (
                <Button asChild>
                  <Link href="/app/content/new">
                    <Sparkles /> Generate with AI
                  </Link>
                </Button>
              )
            }
          />
        }
        columns={[
          {
            key: "title",
            header: "Title",
            cell: (r) => (
              <div className="min-w-0 max-w-md">
                <p className="truncate font-medium">{r.title}</p>
                {r.excerpt && <p className="truncate text-xs text-muted-foreground">{r.excerpt}</p>}
              </div>
            ),
          },
          { key: "type", header: "Type", cell: (r) => <Badge>{CONTENT_TYPE_LABELS[r.type]}</Badge> },
          { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
          { key: "ai", header: "Source", cell: (r) => (r.generatedByAI ? <Badge tone="brand"><Sparkles className="size-3" /> AI</Badge> : <span className="text-xs text-muted-foreground">Manual</span>), hideOnMobile: true },
          { key: "words", header: "Words", cell: (r) => <span className="tabular-nums text-muted-foreground">{r.wordCount.toLocaleString()}</span>, className: "text-right", hideOnMobile: true },
          { key: "campaign", header: "Campaign", cell: (r) => <span className="text-sm text-muted-foreground">{r.campaign?.name ?? "—"}</span>, hideOnMobile: true },
          { key: "updated", header: "Updated", cell: (r) => <span className="text-xs text-muted-foreground whitespace-nowrap"><TimeAgo date={r.updatedAt} /></span> },
        ]}
      />
      <UrlPagination {...data.meta} />
    </>
  );
}
