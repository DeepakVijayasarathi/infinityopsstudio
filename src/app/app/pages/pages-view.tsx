"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, PanelsTopLeft, Plus, Sparkles } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatNumber, formatPercent } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { TimeAgo } from "@/components/ui/time";

type Row = { id: string; title: string; slug: string; status: "DRAFT" | "PUBLISHED"; views: number; conversions: number; updatedAt: string; campaign: { id: string; name: string } | null };

export function NewPageDialog({ open, onOpenChange, campaigns }: { open: boolean; onOpenChange: (o: boolean) => void; campaigns: { id: string; name: string }[] }) {
  const router = useRouter();
  const [f, setF] = React.useState({ offer: "", audience: "", goal: "", campaignId: "" });
  const [busy, setBusy] = React.useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const page = await api.post<{ id: string }>("pages", { ...f, campaignId: f.campaignId || null });
      toast.success("Page drafted — review and publish");
      router.push(`/app/pages/${page.id}`);
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={create} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New landing page</DialogTitle>
            <DialogDescription>AI writes the page from your brand kit. You can edit every word before publishing.</DialogDescription>
          </DialogHeader>
          <Field label="What are you offering?" htmlFor="lp-offer" required>
            <Textarea id="lp-offer" rows={2} required minLength={3} value={f.offer} onChange={(e) => setF({ ...f, offer: e.target.value })} placeholder="e.g. Free 30-minute marketing audit for dental clinics" />
          </Field>
          <Field label="Who is it for?" htmlFor="lp-aud" hint="Optional — defaults to your brand kit audience">
            <Input id="lp-aud" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })} placeholder="Clinic owners in Chennai" />
          </Field>
          <Field label="Goal" htmlFor="lp-goal">
            <Input id="lp-goal" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} placeholder="Book demo calls" />
          </Field>
          {campaigns.length > 0 && (
            <Field label="Campaign" htmlFor="lp-camp">
              <Select id="lp-camp" value={f.campaignId} onChange={(e) => setF({ ...f, campaignId: e.target.value })}>
                <option value="">None</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || f.offer.trim().length < 3}>
              <Sparkles /> {busy ? "Writing page…" : "Generate page"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PagesView({ pages, campaigns, canWrite }: { pages: Row[]; campaigns: { id: string; name: string }[]; canWrite: boolean }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <Button onClick={() => setOpen(true)}>
            <Plus /> New page
          </Button>
        </div>
      )}
      {pages.length === 0 ? (
        <EmptyState
          icon={PanelsTopLeft}
          title="No landing pages yet"
          description="Describe an offer and AI builds a page with a lead form in seconds. Publish it and share the link in ads, emails and social posts."
          action={canWrite ? <Button onClick={() => setOpen(true)}><Sparkles /> Create your first page</Button> : undefined}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pages.map((p) => (
            <Card key={p.id} className="transition-shadow hover:shadow-md">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start gap-2">
                  <Link href={`/app/pages/${p.id}`} className="line-clamp-2 flex-1 font-semibold hover:underline">
                    {p.title}
                  </Link>
                  <Badge tone={p.status === "PUBLISHED" ? "success" : "neutral"}>{p.status === "PUBLISHED" ? "Live" : "Draft"}</Badge>
                </div>
                <p className="truncate font-mono text-xs text-muted-foreground">/p/{p.slug}</p>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted/60 p-2">
                    <dt className="text-[11px] text-muted-foreground">Views</dt>
                    <dd className="font-semibold">{formatNumber(p.views)}</dd>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-2">
                    <dt className="text-[11px] text-muted-foreground">Leads</dt>
                    <dd className="font-semibold">{formatNumber(p.conversions)}</dd>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-2">
                    <dt className="text-[11px] text-muted-foreground">Conv. rate</dt>
                    <dd className="font-semibold">{p.views ? formatPercent(p.conversions / p.views) : "—"}</dd>
                  </div>
                </dl>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {p.campaign ? `${p.campaign.name} · ` : ""}Updated <TimeAgo date={p.updatedAt} />
                  </span>
                  {p.status === "PUBLISHED" && (
                    <a href={`/p/${p.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      Open <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <NewPageDialog open={open} onOpenChange={setOpen} campaigns={campaigns} />
    </div>
  );
}
