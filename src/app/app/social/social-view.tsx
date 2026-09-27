"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import { BarChart3, CalendarDays, Check, ChevronLeft, ChevronRight, ExternalLink, Inbox, List, Plus, Send, Share2, Trash2, UserPlus, X } from "lucide-react";
import { api } from "@/lib/api-client";
import { PLATFORM_COLORS, PLATFORM_LABELS, SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/constants";
import { cn, formatCompact, formatPercent } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateText } from "@/components/ui/time";
import { useConfirm } from "@/components/ui/confirm";
import { SimpleBarChart } from "@/components/charts/charts";
import { Composer, type Account, type Post } from "./composer";

type Analytics = {
  byPlatform: { platform: SocialPlatform; posts: number; impressions: number | null; reach: number | null; engagements: number; engagementRate: number }[];
  top: { id: string; platform: SocialPlatform; text: string; likes: number; comments: number; shares: number; impressions: number }[];
  accounts: { platform: SocialPlatform; handle: string; followers: number }[];
};

type Perms = { write: boolean; publish: boolean; manage: boolean };

export function SocialView({ initialTab, accounts, posts, analytics, campaigns, perms }: { initialTab: string; accounts: Account[]; posts: Post[]; analytics: Analytics; campaigns: { id: string; name: string }[]; perms: Perms }) {
  const router = useRouter();
  const [composer, setComposer] = React.useState<{ open: boolean; post?: Post | null; date?: Date | null }>({ open: false });
  const approvals = posts.filter((p) => p.status === "PENDING_APPROVAL");
  const refresh = () => router.refresh();

  return (
    <>
      <Tabs defaultValue={initialTab}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="calendar">
              <CalendarDays /> Calendar
            </TabsTrigger>
            <TabsTrigger value="posts">
              <List /> Posts
            </TabsTrigger>
            <TabsTrigger value="approvals">
              <Inbox /> Approvals {approvals.length > 0 && <span className="rounded-full bg-warning/15 px-1.5 text-[11px] text-warning">{approvals.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="accounts">
              <UserPlus /> Accounts
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3 /> Analytics
            </TabsTrigger>
          </TabsList>
          {perms.write && (
            <Button onClick={() => setComposer({ open: true })}>
              <Plus /> Create post
            </Button>
          )}
        </div>

        <TabsContent value="calendar">
          <CalendarView onOpenPost={(p) => setComposer({ open: true, post: p })} onNewAt={(d) => perms.write && setComposer({ open: true, date: d })} />
        </TabsContent>
        <TabsContent value="posts">
          <PostList posts={posts} perms={perms} onEdit={(p) => setComposer({ open: true, post: p })} onChanged={refresh} />
        </TabsContent>
        <TabsContent value="approvals">
          {approvals.length === 0 ? <EmptyState icon={Check} title="No posts waiting for approval" description="Posts submitted by teammates appear here for review." /> : <PostList posts={approvals} perms={perms} onEdit={(p) => setComposer({ open: true, post: p })} onChanged={refresh} />}
        </TabsContent>
        <TabsContent value="accounts">
          <AccountsPanel accounts={accounts} canManage={perms.manage} onChanged={refresh} />
        </TabsContent>
        <TabsContent value="analytics">
          <AnalyticsPanel analytics={analytics} />
        </TabsContent>
      </Tabs>
      <Composer open={composer.open} onOpenChange={(o) => setComposer((c) => ({ ...c, open: o }))} post={composer.post} defaultDate={composer.date} accounts={accounts} campaigns={campaigns} canPublish={perms.publish} onSaved={refresh} />
    </>
  );
}

function CalendarView({ onOpenPost, onNewAt }: { onOpenPost: (p: Post) => void; onNewAt: (d: Date) => void }) {
  const [month, setMonth] = React.useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const start = new Date(month);
  start.setDate(1 - ((start.getDay() + 6) % 7)); // Monday-start grid
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const from = days[0]!;
  const to = new Date(days[41]!.getTime() + 86400000);
  const { data: posts, isLoading } = useSWR<Post[]>(`/api/v1/social/calendar?from=${from.toISOString()}&to=${to.toISOString()}`);
  const byDay = (d: Date) => (posts ?? []).filter((p) => new Date(p.scheduledAt ?? p.publishedAt ?? 0).toDateString() === d.toDateString());
  const today = new Date().toDateString();

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-semibold">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
            Today
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-border bg-surface text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className={cn("grid grid-cols-7", isLoading && "opacity-60")}>
        {days.map((d) => {
          const items = byDay(d);
          const inMonth = d.getMonth() === month.getMonth();
          return (
            <div key={d.toISOString()} className={cn("group min-h-[92px] border-b border-r border-border p-1.5 sm:min-h-[112px]", !inMonth && "bg-surface/60")}>
              <div className="flex items-center justify-between">
                <span className={cn("grid size-6 place-items-center rounded-full text-xs", d.toDateString() === today ? "bg-primary font-semibold text-primary-foreground" : inMonth ? "text-foreground" : "text-muted-foreground/60")}>{d.getDate()}</span>
                <button
                  onClick={() => {
                    const at = new Date(d);
                    at.setHours(10, 0, 0, 0);
                    onNewAt(at);
                  }}
                  className="hidden size-5 place-items-center rounded text-muted-foreground hover:bg-muted group-hover:grid"
                  aria-label={`New post on ${d.toDateString()}`}
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
              <ul className="mt-1 space-y-1">
                {items.slice(0, 3).map((p) => (
                  <li key={p.id}>
                    <button onClick={() => onOpenPost(p)} className="flex w-full items-center gap-1 truncate rounded-md border border-border bg-card px-1.5 py-0.5 text-left text-[11px] hover:border-primary/40" title={p.text}>
                      <span className="size-1.5 shrink-0 rounded-full" style={{ background: PLATFORM_COLORS[p.platform] }} />
                      <span className="hidden truncate sm:inline">{p.text}</span>
                      <span className="sm:hidden">{PLATFORM_LABELS[p.platform].slice(0, 2)}</span>
                    </button>
                  </li>
                ))}
                {items.length > 3 && <li className="px-1 text-[10px] text-muted-foreground">+{items.length - 3} more</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function PostList({ posts, perms, onEdit, onChanged }: { posts: Post[]; perms: Perms; onEdit: (p: Post) => void; onChanged: () => void }) {
  const confirm = useConfirm();
  const [manual, setManual] = React.useState<Post | null>(null);
  const [url, setUrl] = React.useState("");
  const [filter, setFilter] = React.useState<string>("");
  const shown = filter ? posts.filter((p) => p.platform === filter) : posts;

  async function act(p: Post, action: string, body: Record<string, unknown> = {}, msg = "Done") {
    try {
      await api.post(`social/posts/${p.id}/action`, { action, ...body });
      toast.success(msg);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!posts.length) return <EmptyState icon={Share2} title="No posts yet" description="Create your first post or let Pulse draft a content calendar." />;
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by platform" className="w-44">
          <option value="">All platforms</option>
          {SOCIAL_PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </option>
          ))}
        </Select>
      </div>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((p) => (
          <li key={p.id}>
            <Card className="flex h-full flex-col p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="size-2 rounded-full" style={{ background: PLATFORM_COLORS[p.platform] }} />
                  {PLATFORM_LABELS[p.platform]} {p.socialAccount && <span className="text-muted-foreground">@{p.socialAccount.handle}</span>}
                </span>
                <StatusBadge status={p.status} />
              </div>
              <p className="line-clamp-4 flex-1 whitespace-pre-wrap text-sm">{p.text}</p>
              {p.error && <p className="mt-2 rounded-md bg-danger/10 p-2 text-xs text-danger">{p.error}</p>}
              <div className="mt-3 text-xs text-muted-foreground">
                {p.status === "PUBLISHED" ? (
                  <span>
                    Published <DateText date={p.publishedAt} withTime /> · {formatCompact(p.impressions)} impressions · {p.likes + p.comments + p.shares} engagements
                  </span>
                ) : p.scheduledAt ? (
                  <span>
                    Scheduled for <DateText date={p.scheduledAt} withTime />
                  </span>
                ) : (
                  <span>Not scheduled</span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                {p.status === "PENDING_APPROVAL" && perms.publish && (
                  <>
                    <Button size="sm" onClick={() => act(p, "approve", {}, "Post approved")}>
                      <Check /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => act(p, "reject", {}, "Sent back to draft")}>
                      <X /> Reject
                    </Button>
                  </>
                )}
                {["DRAFT", "SCHEDULED", "FAILED", "PENDING_APPROVAL"].includes(p.status) && perms.write && (
                  <Button size="sm" variant="outline" onClick={() => onEdit(p)}>
                    Edit
                  </Button>
                )}
                {["DRAFT", "SCHEDULED", "FAILED"].includes(p.status) && perms.publish && p.socialAccount && (
                  <Button size="sm" variant="outline" onClick={() => act(p, "publish", {}, "Publishing…")}>
                    <Send /> Publish now
                  </Button>
                )}
                {["DRAFT", "SCHEDULED", "FAILED"].includes(p.status) && perms.publish && (
                  <Button size="sm" variant="ghost" onClick={() => setManual(p)}>
                    Mark published
                  </Button>
                )}
                {p.externalUrl && (
                  <Button size="sm" variant="ghost" asChild>
                    <a href={p.externalUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink /> View
                    </a>
                  </Button>
                )}
                {perms.write && p.status !== "PUBLISHING" && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="ml-auto text-danger"
                    aria-label="Delete post"
                    onClick={async () => {
                      if (!(await confirm({ title: "Delete this post?", destructive: true, confirmLabel: "Delete" }))) return;
                      try {
                        await api.del(`social/posts/${p.id}`);
                        toast.success("Post deleted");
                        onChanged();
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <Dialog open={!!manual} onOpenChange={(o) => !o && setManual(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Mark as published</DialogTitle>
            <DialogDescription>Use this when you posted manually on the platform. Add the live URL so the team can find it.</DialogDescription>
          </DialogHeader>
          <Field label="Post URL" htmlFor="purl" hint="Optional">
            <Input id="purl" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.linkedin.com/feed/update/…" />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManual(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (manual) await act(manual, "mark-published", url ? { externalUrl: url } : {}, "Marked as published");
                setManual(null);
                setUrl("");
              }}
            >
              Mark published
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AccountsPanel({ accounts, canManage, onChanged }: { accounts: Account[]; canManage: boolean; onChanged: () => void }) {
  const confirm = useConfirm();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ platform: "LINKEDIN" as SocialPlatform, handle: "", displayName: "", accessToken: "", externalId: "" });
  const [busy, setBusy] = React.useState(false);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("social/accounts", { ...form, accessToken: form.accessToken || undefined, externalId: form.externalId || undefined, displayName: form.displayName || undefined });
      toast.success(`Connected @${form.handle.replace(/^@/, "")}`);
      setOpen(false);
      setForm({ platform: "LINKEDIN", handle: "", displayName: "", accessToken: "", externalId: "" });
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const idLabel: Partial<Record<SocialPlatform, string>> = { LINKEDIN: "Author URN (urn:li:organization:…)", FACEBOOK: "Facebook Page ID", INSTAGRAM: "Instagram Business ID" };

  return (
    <>
      <div className="mb-4 flex justify-end">
        {canManage && (
          <Button onClick={() => setOpen(true)}>
            <Plus /> Connect account
          </Button>
        )}
      </div>
      {accounts.length === 0 ? (
        <EmptyState icon={UserPlus} title="No social accounts connected" description="Connect Instagram, Facebook, LinkedIn, X, YouTube or TikTok to plan and publish posts." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((a) => (
            <Card key={a.id} className="flex items-center gap-3 p-4">
              <span className="grid size-10 place-items-center rounded-xl text-xs font-bold text-white" style={{ background: PLATFORM_COLORS[a.platform] }}>
                {PLATFORM_LABELS[a.platform].slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">@{a.handle}</p>
                <p className="text-xs text-muted-foreground">
                  {PLATFORM_LABELS[a.platform]} · {formatCompact(a.followers)} followers
                </p>
                <Badge tone={a.autoPublish ? "success" : "neutral"} className="mt-1">
                  {a.autoPublish ? "Auto-publishing" : "Manual publishing"}
                </Badge>
              </div>
              {canManage && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Disconnect @${a.handle}`}
                  onClick={async () => {
                    if (!(await confirm({ title: `Disconnect @${a.handle}?`, description: "Scheduled posts for this account will need a new account before they can publish.", destructive: true, confirmLabel: "Disconnect" }))) return;
                    try {
                      await api.del(`social/accounts/${a.id}`);
                      toast.success("Account disconnected");
                      onChanged();
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={connect}>
            <DialogHeader>
              <DialogTitle>Connect a social account</DialogTitle>
              <DialogDescription>Add an API access token to publish automatically, or leave it empty to plan posts and publish manually.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Field label="Platform" htmlFor="c-platform">
                <Select id="c-platform" value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value as SocialPlatform }))}>
                  {SOCIAL_PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Handle" htmlFor="c-handle" required>
                <Input id="c-handle" value={form.handle} onChange={(e) => setForm((f) => ({ ...f, handle: e.target.value }))} placeholder="@yourbrand" required />
              </Field>
              <Field label="Access token" htmlFor="c-token" hint="Optional. Stored encrypted and never shown again.">
                <Input id="c-token" type="password" autoComplete="off" value={form.accessToken} onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))} />
              </Field>
              {idLabel[form.platform] && (
                <Field label={idLabel[form.platform]!} htmlFor="c-ext" hint="Required for auto-publishing on this platform.">
                  <Input id="c-ext" value={form.externalId} onChange={(e) => setForm((f) => ({ ...f, externalId: e.target.value }))} />
                </Field>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy} disabled={!form.handle.trim()}>
                Connect
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AnalyticsPanel({ analytics }: { analytics: Analytics }) {
  if (!analytics.byPlatform.length) return <EmptyState icon={BarChart3} title="No published posts in the last 30 days" description="Engagement analytics appear after your first posts go live." />;
  const rows = analytics.byPlatform.map((p) => ({ platform: PLATFORM_LABELS[p.platform], impressions: p.impressions ?? 0, engagements: p.engagements }));
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid gap-4 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-4">
        {analytics.byPlatform.map((p) => (
          <Card key={p.platform} className="p-4">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: PLATFORM_COLORS[p.platform] }} /> {PLATFORM_LABELS[p.platform]}
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{formatPercent(p.engagementRate, 2)}</p>
            <p className="text-xs text-muted-foreground">
              engagement rate · {p.posts} posts · {formatCompact(p.impressions ?? 0)} impressions
            </p>
          </Card>
        ))}
      </div>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Impressions by platform</CardTitle>
          <CardDescription>Published posts, last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <SimpleBarChart data={rows} xKey="platform" series={[{ key: "impressions", label: "Impressions" }]} height={240} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Top posts</CardTitle>
          <CardDescription>By likes</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {analytics.top.map((p, i) => (
              <li key={p.id} className="flex gap-3 text-sm">
                <span className="font-semibold text-muted-foreground">{i + 1}</span>
                <div className="min-w-0">
                  <p className="line-clamp-2">{p.text}</p>
                  <p className="text-xs text-muted-foreground">
                    {PLATFORM_LABELS[p.platform]} · {p.likes} likes · {p.comments} comments · {p.shares} shares
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
