"use client";

import * as React from "react";
import { toast } from "sonner";
import { Hash, Loader2, Sparkles, X } from "lucide-react";
import { api } from "@/lib/api-client";
import { PLATFORM_COLORS, PLATFORM_LABELS, PLATFORM_LIMITS, SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useAIStream } from "@/hooks/use-ai-stream";
import { useApp } from "@/components/app/app-context";

export type Account = { id: string; platform: SocialPlatform; handle: string; displayName: string | null; followers: number; hasToken: boolean; autoPublish: boolean; status: string };
export type Post = {
  id: string;
  platform: SocialPlatform;
  text: string;
  hashtags: string[];
  mediaUrls: string[];
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  error: string | null;
  externalUrl: string | null;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  socialAccount: { id: string; handle: string } | null;
  campaign: { id: string; name: string } | null;
};

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/** Post preview that mimics the platform's card layout. */
export function PostPreview({ platform, text, hashtags, handle, media }: { platform: SocialPlatform; text: string; hashtags: string[]; handle: string; media?: string }) {
  const { workspace } = useApp();
  const full = `${text}${hashtags.length ? `\n\n${hashtags.map((h) => `#${h}`).join(" ")}` : ""}`;
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-full text-xs font-bold text-white" style={{ background: PLATFORM_COLORS[platform] }}>
          {workspace.name.charAt(0)}
        </span>
        <div>
          <p className="font-semibold leading-tight">{workspace.name}</p>
          <p className="text-xs text-muted-foreground">
            @{handle || "your-handle"} · {PLATFORM_LABELS[platform]}
          </p>
        </div>
      </div>
      {platform === "INSTAGRAM" && (
        // eslint-disable-next-line @next/next/no-img-element
        <div className="mb-3 grid aspect-square place-items-center overflow-hidden rounded-lg bg-muted text-xs text-muted-foreground">{media ? <img src={media} alt="" className="size-full object-cover" /> : "Image required for Instagram"}</div>
      )}
      <p className="whitespace-pre-wrap break-words leading-relaxed">{full || <span className="text-muted-foreground">Your post preview appears here.</span>}</p>
      {platform !== "INSTAGRAM" && media && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media} alt="" className="mt-3 max-h-56 w-full rounded-lg object-cover" />
      )}
    </div>
  );
}

export function Composer({ open, onOpenChange, accounts, campaigns, post, defaultDate, canPublish, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; accounts: Account[]; campaigns: { id: string; name: string }[]; post?: Post | null; defaultDate?: Date | null; canPublish: boolean; onSaved: () => void }) {
  const [platform, setPlatform] = React.useState<SocialPlatform>(post?.platform ?? accounts[0]?.platform ?? "LINKEDIN");
  const [accountId, setAccountId] = React.useState(post?.socialAccount?.id ?? "");
  const [text, setText] = React.useState(post?.text ?? "");
  const [hashtags, setHashtags] = React.useState<string[]>(post?.hashtags ?? []);
  const [tagInput, setTagInput] = React.useState("");
  const [media, setMedia] = React.useState(post?.mediaUrls[0] ?? "");
  const [campaignId, setCampaignId] = React.useState(post?.campaign?.id ?? "");
  const [when, setWhen] = React.useState(post?.scheduledAt ? toLocalInput(new Date(post.scheduledAt)) : defaultDate ? toLocalInput(defaultDate) : "");
  const [topic, setTopic] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const ai = useAIStream();

  React.useEffect(() => {
    if (!open) return;
    setPlatform(post?.platform ?? accounts[0]?.platform ?? "LINKEDIN");
    setAccountId(post?.socialAccount?.id ?? "");
    setText(post?.text ?? "");
    setHashtags(post?.hashtags ?? []);
    setMedia(post?.mediaUrls[0] ?? "");
    setCampaignId(post?.campaign?.id ?? "");
    setWhen(post?.scheduledAt ? toLocalInput(new Date(post.scheduledAt)) : defaultDate ? toLocalInput(defaultDate) : "");
    setTopic("");
  }, [open, post, defaultDate, accounts]);

  React.useEffect(() => {
    if (ai.streaming) setText(ai.text);
  }, [ai.text, ai.streaming]);

  const platformAccounts = accounts.filter((a) => a.platform === platform);
  React.useEffect(() => {
    if (!platformAccounts.some((a) => a.id === accountId)) setAccountId(platformAccounts[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);

  const length = text.length + (hashtags.length ? hashtags.map((h) => h.length + 2).reduce((a, b) => a + b, 1) : 0);
  const limit = PLATFORM_LIMITS[platform];

  async function suggestTags() {
    if (text.trim().length < 3) return toast.error("Write the post first");
    setBusy("tags");
    try {
      const r = await api.post<{ hashtags: string[] }>("social/hashtags", { platform, text });
      setHashtags((h) => [...new Set([...h, ...r.hashtags])].slice(0, 15));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function save(submit: "draft" | "approval" | "schedule") {
    setBusy(submit);
    const payload = {
      platform,
      socialAccountId: accountId || null,
      text,
      hashtags,
      mediaUrls: media ? [media] : [],
      campaignId: campaignId || null,
      scheduledAt: when ? new Date(when).toISOString() : null,
    };
    try {
      if (post) {
        await api.patch(`social/posts/${post.id}`, payload);
        if (submit === "schedule" && when) await api.post(`social/posts/${post.id}/action`, { action: "schedule", scheduledAt: new Date(when).toISOString() });
      } else {
        await api.post("social/posts", { ...payload, submit });
      }
      toast.success(submit === "schedule" ? (canPublish ? "Post scheduled" : "Sent for approval before scheduling") : submit === "approval" ? "Sent for approval" : "Draft saved");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{post ? "Edit post" : "Create post"}</DialogTitle>
          <DialogDescription>Write once, preview per platform, then schedule or send for approval.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <div role="radiogroup" aria-label="Platform" className="flex flex-wrap gap-1.5">
              {SOCIAL_PLATFORMS.map((p) => (
                <button key={p} type="button" role="radio" aria-checked={platform === p} onClick={() => setPlatform(p)} className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition", platform === p ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                  <span className="size-2 rounded-full" style={{ background: PLATFORM_COLORS[p] }} />
                  {PLATFORM_LABELS[p]}
                </button>
              ))}
            </div>
            <Field label="Account" htmlFor="acct" hint={platformAccounts.length === 0 ? "No connected account for this platform — connect one in the Accounts tab." : undefined}>
              <Select id="acct" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {platformAccounts.length === 0 && <option value="">No account</option>}
                {platformAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    @{a.handle}
                    {a.autoPublish ? "" : " (manual publishing)"}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What should the post be about?" aria-label="Caption topic" className="flex-1 bg-card" />
                <Button type="button" variant="outline" onClick={() => (ai.streaming ? ai.stop() : topic.trim().length >= 3 ? ai.start("social/caption", { platform, topic }) : toast.error("Describe the topic"))} className="bg-card">
                  {ai.streaming ? <Loader2 className="animate-spin" /> : <Sparkles />} {ai.streaming ? "Stop" : "AI caption"}
                </Button>
              </div>
              {ai.error && <p className="mt-2 text-xs text-danger">{ai.error}</p>}
            </div>
            <Field label="Post text" htmlFor="text" hint={<span className={cn(length > limit && "text-danger")}>{length.toLocaleString()} / {limit.toLocaleString()} characters</span>}>
              <Textarea id="text" value={text} onChange={(e) => setText(e.target.value)} rows={7} aria-invalid={length > limit || undefined} />
            </Field>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px] font-medium">Hashtags</span>
                <Button type="button" size="sm" variant="ghost" onClick={suggestTags} loading={busy === "tags"}>
                  <Hash /> Suggest
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card p-2">
                {hashtags.map((h) => (
                  <span key={h} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                    #{h}
                    <button type="button" onClick={() => setHashtags((t) => t.filter((x) => x !== h))} aria-label={`Remove #${h}`}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
                      e.preventDefault();
                      setHashtags((t) => [...new Set([...t, tagInput.trim().replace(/^#/, "")])]);
                      setTagInput("");
                    }
                  }}
                  placeholder="Add tag + Enter"
                  aria-label="Add hashtag"
                  className="min-w-24 flex-1 bg-transparent text-sm outline-none"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Image URL" htmlFor="media" hint="Optional (required for Instagram)">
                <Input id="media" type="url" value={media} onChange={(e) => setMedia(e.target.value)} placeholder="https://…" />
              </Field>
              <Field label="Publish at" htmlFor="when">
                <Input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} min={toLocalInput(new Date())} />
              </Field>
              <Field label="Campaign" htmlFor="pc">
                <Select id="pc" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                  <option value="">None</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-[13px] font-medium">Preview</p>
            <PostPreview platform={platform} text={text} hashtags={hashtags} handle={platformAccounts.find((a) => a.id === accountId)?.handle ?? ""} media={media || undefined} />
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => save("draft")} loading={busy === "draft"} disabled={!text.trim() || length > limit}>
            Save draft
          </Button>
          {!canPublish && (
            <Button variant="outline" onClick={() => save("approval")} loading={busy === "approval"} disabled={!text.trim() || length > limit}>
              Send for approval
            </Button>
          )}
          <Button onClick={() => save("schedule")} loading={busy === "schedule"} disabled={!text.trim() || !when || length > limit}>
            {canPublish ? "Schedule" : "Request scheduling"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
