"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { Bot, Check, Copy, Globe, Inbox, Mail, MessageCircle, RotateCcw, Send, Settings2, Sparkles, UserPlus } from "lucide-react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { EmptyState } from "@/components/ui/states";
import { TimeAgo } from "@/components/ui/time";

type Channel = "WEBSITE" | "WHATSAPP" | "EMAIL";
type Lead = { id: string; firstName: string | null; lastName: string | null; score: number; email?: string | null; company?: string | null };
type Row = { id: string; channel: Channel; contactName: string | null; contactHandle: string | null; subject: string | null; status: "OPEN" | "CLOSED"; unread: number; aiEnabled: boolean; lastMessageAt: string; lead: Lead | null; last: { body: string; direction: "IN" | "OUT" } | null };
type Msg = { id: string; direction: "IN" | "OUT"; author: "CONTACT" | "AI" | "AGENT" | "SYSTEM"; body: string; createdAt: string; failed: boolean; error: string | null; user: { name: string } | null };
type Thread = Omit<Row, "last"> & { messages: Msg[] };
type Channels = { whatsappConnected: boolean; whatsappWebhook: string | null; emailWebhook: string | null; chatEnabled: boolean };

const CHANNEL: Record<Channel, { label: string; icon: typeof Globe }> = {
  WEBSITE: { label: "Website chat", icon: Globe },
  WHATSAPP: { label: "WhatsApp", icon: MessageCircle },
  EMAIL: { label: "Email", icon: Mail },
};

const who = (c: { contactName: string | null; contactHandle: string | null }) => c.contactName || c.contactHandle || "Website visitor";

function CopyLine({ value }: { value: string }) {
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      <Button size="sm" variant="outline" aria-label="Copy" onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("Copied"))}>
        <Copy />
      </Button>
    </div>
  );
}

function ChannelSetup({ channels }: { channels: Channels }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect channels</CardTitle>
        <CardDescription>Messages from every connected channel land here.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 font-medium">
            <Globe className="size-4" /> Website chat {channels.chatEnabled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}
          </div>
          <p className="text-muted-foreground">
            Add the snippet from <Link className="text-primary underline" href="/app/website">Website</Link> to your site. Visitors chat with AI, and you can take over anytime.
          </p>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 font-medium">
            <MessageCircle className="size-4" /> WhatsApp {channels.whatsappConnected ? <Badge tone="success">Connected</Badge> : <Badge>Not connected</Badge>}
          </div>
          <p className="text-muted-foreground">
            Connect <Link className="text-primary underline" href="/app/integrations">WhatsApp Business</Link> (phone number ID, access token, app secret, verify token), then set this as the webhook callback URL in your Meta app and subscribe to <code>messages</code>:
          </p>
          {channels.whatsappWebhook ? <CopyLine value={channels.whatsappWebhook} /> : <p className="text-xs text-muted-foreground">Ask a workspace admin for the webhook URL.</p>}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 font-medium">
            <Mail className="size-4" /> Email
          </div>
          <p className="text-muted-foreground">Point your inbound email provider (Postmark, SendGrid Inbound Parse, Mailgun routes) at this URL. Keep it private — it works without a password.</p>
          {channels.emailWebhook ? <CopyLine value={channels.emailWebhook} /> : <p className="text-xs text-muted-foreground">Ask a workspace admin for the inbound URL.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function ThreadView({ id, canWrite, onChange }: { id: string; canWrite: boolean; onChange: () => void }) {
  const { data: t, mutate } = useSWR<Thread>(`/api/v1/inbox/${id}`, { refreshInterval: 8000 });
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState<null | "send" | "suggest" | "lead">(null);
  const bottom = React.useRef<HTMLDivElement>(null);
  const count = t?.messages.length ?? 0;

  React.useEffect(() => setDraft(""), [id]);
  React.useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [count, id]);

  if (!t) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  const Icon = CHANNEL[t.channel].icon;

  async function run<T>(kind: NonNullable<typeof busy>, fn: () => Promise<T>) {
    setBusy(kind);
    try {
      return await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      void mutate();
      onChange();
    }
  }

  const send = () =>
    run("send", async () => {
      await api.post(`inbox/${id}/reply`, { body: draft });
      setDraft("");
    });
  const suggest = () => run("suggest", async () => setDraft((await api.post<{ text: string }>(`inbox/${id}/suggest`)).text));
  const patch = (body: { status?: "OPEN" | "CLOSED"; aiEnabled?: boolean }) => run("send", () => api.patch(`inbox/${id}`, body));
  const link = () => run("lead", () => api.post(`inbox/${id}/lead`).then(() => toast.success("Lead saved")));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-medium">
            <Icon className="size-4 text-muted-foreground" /> <span className="truncate">{who(t)}</span>
            {t.status === "CLOSED" && <Badge>Closed</Badge>}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {CHANNEL[t.channel].label}
            {t.contactHandle && t.contactHandle !== who(t) ? ` · ${t.contactHandle}` : ""}
            {t.subject ? ` · ${t.subject}` : ""}
          </div>
        </div>
        {t.lead ? (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/app/leads/${t.lead.id}`}>Lead · score {t.lead.score}</Link>
          </Button>
        ) : (
          canWrite && (
            <Button size="sm" variant="outline" onClick={link} disabled={!!busy}>
              <UserPlus /> Save as lead
            </Button>
          )
        )}
        {canWrite && (
          <>
            <label className="flex items-center gap-2 text-xs text-muted-foreground" title="AI answers new messages automatically">
              <Bot className="size-4" /> AI auto-reply
              <Switch checked={t.aiEnabled} onCheckedChange={(v) => patch({ aiEnabled: v })} aria-label="AI auto-reply" />
            </label>
            <Button size="sm" variant="ghost" onClick={() => patch({ status: t.status === "OPEN" ? "CLOSED" : "OPEN" })} disabled={!!busy}>
              {t.status === "OPEN" ? <Check /> : <RotateCcw />} {t.status === "OPEN" ? "Close" : "Reopen"}
            </Button>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/30 p-4" aria-live="polite">
        {t.messages.map((m) => (
          <div key={m.id} className={cn("flex", m.direction === "OUT" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm", m.direction === "OUT" ? "bg-primary text-primary-foreground" : "bg-card", m.failed && "ring-2 ring-destructive")}>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <div className={cn("mt-1 flex items-center gap-1 text-[11px]", m.direction === "OUT" ? "text-primary-foreground/75" : "text-muted-foreground")}>
                {m.author === "AI" && <Sparkles className="size-3" />}
                {m.author === "AI" ? "AI" : m.author === "AGENT" ? (m.user?.name ?? "Team") : m.author === "SYSTEM" ? "System" : who(t)} · <TimeAgo date={m.createdAt} />
                {m.failed && <span className="font-medium"> · not delivered{m.error ? `: ${m.error}` : ""}</span>}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {canWrite && (
        <div className="space-y-2 border-t p-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder={`Reply on ${CHANNEL[t.channel].label}…`}
            aria-label="Reply"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim()) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <Button size="sm" variant="outline" onClick={suggest} disabled={!!busy}>
              <Sparkles /> {busy === "suggest" ? "Drafting…" : "AI suggest"}
            </Button>
            <Button size="sm" onClick={send} disabled={!!busy || !draft.trim()}>
              <Send /> {busy === "send" ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function InboxView({ initialId, canWrite, channels }: { initialId: string | null; canWrite: boolean; channels: Channels }) {
  const [status, setStatus] = React.useState<"OPEN" | "CLOSED">("OPEN");
  const [channel, setChannel] = React.useState<"" | Channel>("");
  const [q, setQ] = React.useState("");
  const [selected, setSelected] = React.useState<string | null>(initialId);
  const [setup, setSetup] = React.useState(false);
  const params = new URLSearchParams({ status, pageSize: "50", ...(channel ? { channel } : {}), ...(q.trim() ? { q: q.trim() } : {}) });
  const { data, mutate } = useSWR<{ items: Row[]; unread: number }>(`/api/v1/inbox?${params}`, { refreshInterval: 10_000 });
  const items = data?.items ?? [];

  const firstId = data?.items[0]?.id;
  React.useEffect(() => {
    if (!selected && firstId && window.innerWidth >= 1024) setSelected(firstId);
  }, [firstId, selected]);

  function open(id: string) {
    setSelected(id);
    setSetup(false);
    window.history.replaceState(null, "", `/app/inbox?c=${id}`);
  }

  if (data && !items.length && !q && !channel && status === "OPEN" && !selected) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <EmptyState icon={Inbox} title="No conversations yet" description="When visitors chat on your website, or customers message you on WhatsApp or email, conversations appear here." />
        <ChannelSetup channels={channels} />
      </div>
    );
  }

  return (
    <div className="grid h-[calc(100dvh-17rem)] min-h-[440px] overflow-hidden rounded-xl border bg-card lg:grid-cols-[340px_1fr]">
      <div className={cn("flex min-h-0 flex-col border-r", selected || setup ? "hidden lg:flex" : "flex")}>
        <div className="space-y-2 border-b p-3">
          <div className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone…" aria-label="Search conversations" />
            <Button size="sm" variant="ghost" aria-label="Channel setup" onClick={() => setSetup(true)}>
              <Settings2 />
            </Button>
          </div>
          <div className="flex gap-2">
            <Select value={status} onChange={(e) => setStatus(e.target.value as "OPEN" | "CLOSED")} aria-label="Status">
              <option value="OPEN">Open{data?.unread ? ` (${data.unread} unread)` : ""}</option>
              <option value="CLOSED">Closed</option>
            </Select>
            <Select value={channel} onChange={(e) => setChannel(e.target.value as "" | Channel)} aria-label="Channel">
              <option value="">All channels</option>
              <option value="WEBSITE">Website chat</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="EMAIL">Email</option>
            </Select>
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {items.map((c) => {
            const Icon = CHANNEL[c.channel].icon;
            return (
              <li key={c.id}>
                <button onClick={() => open(c.id)} className={cn("flex w-full gap-3 border-b px-3 py-3 text-left hover:bg-muted/60", selected === c.id && "bg-muted")}>
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={cn("truncate text-sm", c.unread ? "font-semibold" : "font-medium")}>{who(c)}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                        <TimeAgo date={c.lastMessageAt} />
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="truncate text-xs text-muted-foreground">
                        {c.last ? `${c.last.direction === "OUT" ? "You: " : ""}${c.last.body}` : c.subject}
                      </span>
                      {c.unread > 0 && <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{c.unread}</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {data && !items.length && <li className="p-6 text-center text-sm text-muted-foreground">No conversations match.</li>}
        </ul>
      </div>
      <div className={cn("min-h-0 flex-col", selected || setup ? "flex" : "hidden lg:flex")}>
        {(selected || setup) && (
          <div className="border-b px-3 py-2 lg:hidden">
            <Button size="sm" variant="ghost" onClick={() => (setSetup(false), setSelected(null))}>
              ← All conversations
            </Button>
          </div>
        )}
        {setup ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <ChannelSetup channels={channels} />
          </div>
        ) : selected ? (
          <div className="min-h-0 flex-1">
            <ThreadView id={selected} canWrite={canWrite} onChange={() => void mutate()} />
          </div>
        ) : (
          <div className="grid flex-1 place-items-center p-8 text-sm text-muted-foreground">Select a conversation</div>
        )}
      </div>
    </div>
  );
}
