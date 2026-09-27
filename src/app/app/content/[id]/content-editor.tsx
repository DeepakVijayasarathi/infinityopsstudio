"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import { ArrowLeft, Check, Cloud, CloudOff, Copy, Download, History, Link2, Loader2, MoreHorizontal, Save, Share2, Sparkles, Square, Trash2, Info, FileCode2, Type } from "lucide-react";
import { api } from "@/lib/api-client";
import { CONTENT_TRANSITIONS, CONTENT_TYPE_LABELS, humanize, type ContentStatus, type ContentType } from "@/lib/constants";
import { cn, formatDateTime, timeAgo, wordCount } from "@/lib/utils";
import { TimeAgo, DateText } from "@/components/ui/time";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/ui/markdown";
import { Switch } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ui/confirm";
import { RichEditor, type RichEditorHandle } from "@/components/app/rich-editor";
import { AIMeta } from "@/components/app/ai-meta";
import { useAIStream } from "@/hooks/use-ai-stream";

type Version = { id: string; version: number; title: string; note: string | null; createdAt: string };
type Content = {
  id: string;
  title: string;
  type: ContentType;
  status: ContentStatus;
  body: string;
  tone: string | null;
  keywords: string[];
  campaignId: string | null;
  shareToken: string | null;
  generatedByAI: boolean;
  createdAt: string;
  updatedAt: string;
  author: { name: string } | null;
  versions: Version[];
};

const TONES = ["Professional", "Friendly", "Persuasive", "Casual", "Luxury", "Technical", "Minimal", "Creative"];
const ACTIONS = [
  { key: "improve", label: "Improve writing" },
  { key: "rewrite", label: "Rewrite" },
  { key: "summarize", label: "Summarize" },
  { key: "expand", label: "Expand" },
  { key: "shorten", label: "Make concise" },
  { key: "tone", label: "Change tone" },
  { key: "repurpose", label: "Repurpose" },
] as const;

type SaveState = "saved" | "saving" | "unsaved" | "error";

export function ContentEditor({ content, campaigns, shareBase, perms }: { content: Content; campaigns: { id: string; name: string }[]; shareBase: string; perms: { write: boolean; approve: boolean } }) {
  const router = useRouter();
  const confirm = useConfirm();
  const editorRef = React.useRef<RichEditorHandle>(null);
  const [title, setTitle] = React.useState(content.title);
  const [body, setBody] = React.useState(content.body);
  const [mode, setMode] = React.useState<"rich" | "markdown">("rich");
  const [saveState, setSaveState] = React.useState<SaveState>("saved");
  const [status, setStatus] = React.useState<ContentStatus>(content.status);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [shareToken, setShareToken] = React.useState(content.shareToken);
  const [versions, setVersions] = React.useState(content.versions);
  const latest = React.useRef({ title, body });
  latest.current = { title, body };
  const dirty = React.useRef(false);

  const persist = React.useCallback(
    async (opts: { autosave: boolean; note?: string }) => {
      setSaveState("saving");
      try {
        await api.patch(`content/${content.id}`, { title: latest.current.title || "Untitled", body: latest.current.body, autosave: opts.autosave, versionNote: opts.note });
        dirty.current = false;
        setSaveState("saved");
        if (!opts.autosave) {
          const fresh = await api.get<Content>(`content/${content.id}`);
          setVersions(fresh.versions);
        }
      } catch (e) {
        setSaveState("error");
        if (!opts.autosave) toast.error((e as Error).message);
      }
    },
    [content.id],
  );

  // Autosave 1.5s after the last keystroke.
  React.useEffect(() => {
    if (!dirty.current || !perms.write) return;
    setSaveState("unsaved");
    const t = setTimeout(() => void persist({ autosave: true }), 1500);
    return () => clearTimeout(t);
  }, [title, body, persist, perms.write]);

  // Warn before leaving with unsaved changes.
  React.useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const change = (next: { title?: string; body?: string }) => {
    dirty.current = true;
    if (next.title !== undefined) setTitle(next.title);
    if (next.body !== undefined) setBody(next.body);
  };

  async function changeStatus(s: ContentStatus) {
    try {
      if (dirty.current) await persist({ autosave: true });
      await api.post(`content/${content.id}/status`, { status: s });
      setStatus(s);
      toast.success(`Moved to ${humanize(s).toLowerCase()}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function toggleShare(enabled: boolean) {
    try {
      const r = await api.post<{ shareToken: string | null }>(`content/${content.id}/share`, { enabled });
      setShareToken(r.shareToken);
      toast.success(enabled ? "Share link created" : "Share link disabled");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const saveIndicator = {
    saved: { icon: <Cloud className="size-3.5" />, text: "All changes saved" },
    saving: { icon: <Loader2 className="size-3.5 animate-spin" />, text: "Saving…" },
    unsaved: { icon: <Cloud className="size-3.5" />, text: "Unsaved changes" },
    error: { icon: <CloudOff className="size-3.5 text-danger" />, text: "Save failed — retrying on next edit" },
  }[saveState];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/app/content" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Content library
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            {saveIndicator.icon} {saveIndicator.text}
          </span>
          <StatusBadge status={status} />
          {perms.write && (
            <Button variant="outline" size="sm" onClick={() => persist({ autosave: false, note: "Saved" }).then(() => toast.success("Version saved"))}>
              <Save /> Save version
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
            <Share2 /> Share
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              {perms.write && CONTENT_TRANSITIONS[status].length > 0 && <DropdownMenuLabel>Move to</DropdownMenuLabel>}
              {perms.write &&
                CONTENT_TRANSITIONS[status]
                  .filter((s) => perms.approve || (s !== "APPROVED" && s !== "PUBLISHED"))
                  .map((s) => (
                    <DropdownMenuItem key={s} onSelect={() => changeStatus(s)}>
                      <Check /> {s === "IN_REVIEW" ? "Submit for review" : humanize(s)}
                    </DropdownMenuItem>
                  ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigator.clipboard.writeText(body).then(() => toast.success("Markdown copied"))}>
                <Copy /> Copy as Markdown
              </DropdownMenuItem>
              {(["md", "html", "txt"] as const).map((f) => (
                <DropdownMenuItem key={f} asChild>
                  <a href={`/api/v1/content/${content.id}/export?format=${f}`} download>
                    <Download /> Export .{f}
                  </a>
                </DropdownMenuItem>
              ))}
              {perms.write && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    destructive
                    onSelect={async () => {
                      if (await confirm({ title: "Delete this content?", description: "It will be removed from the library and any share link will stop working.", confirmLabel: "Delete", destructive: true })) {
                        try {
                          await api.del(`content/${content.id}`);
                          dirty.current = false;
                          toast.success("Content deleted");
                          router.push("/app/content");
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }
                    }}
                  >
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-3">
          <input
            value={title}
            onChange={(e) => change({ title: e.target.value })}
            readOnly={!perms.write}
            aria-label="Title"
            className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground sm:text-3xl"
            placeholder="Untitled"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {CONTENT_TYPE_LABELS[content.type]} · {wordCount(body).toLocaleString()} words · {Math.max(1, Math.round(wordCount(body) / 230))} min read
            </span>
            <div className="flex rounded-lg border border-border p-0.5" role="radiogroup" aria-label="Editor mode">
              {[
                { v: "rich" as const, icon: <Type className="size-3.5" />, label: "Rich text" },
                { v: "markdown" as const, icon: <FileCode2 className="size-3.5" />, label: "Markdown" },
              ].map((m) => (
                <button
                  key={m.v}
                  role="radio"
                  aria-checked={mode === m.v}
                  onClick={() => {
                    if (m.v === "rich" && mode === "markdown") editorRef.current?.setMarkdown(body);
                    setMode(m.v);
                  }}
                  className={cn("flex items-center gap-1 rounded-md px-2 py-1", mode === m.v ? "bg-muted text-foreground" : "")}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className={mode === "rich" ? "" : "hidden"}>
            <RichEditor ref={editorRef} value={content.body} onChange={(md) => change({ body: md })} editable={perms.write} />
          </div>
          {mode === "markdown" && <Textarea value={body} onChange={(e) => change({ body: e.target.value })} readOnly={!perms.write} className="min-h-[520px] font-mono text-[13px] leading-6" aria-label="Markdown source" />}
        </div>

        <aside className="xl:sticky xl:top-20 xl:h-fit">
          <Tabs defaultValue="ai">
            <TabsList className="w-full">
              <TabsTrigger value="ai" className="flex-1">
                <Sparkles /> AI assist
              </TabsTrigger>
              <TabsTrigger value="versions" className="flex-1">
                <History /> Versions
              </TabsTrigger>
              <TabsTrigger value="details" className="flex-1">
                <Info /> Details
              </TabsTrigger>
            </TabsList>
            <TabsContent value="ai" className="mt-3">
              <AIAssist editorRef={editorRef} body={body} canWrite={perms.write} onApplyMarkdown={(md) => change({ body: md })} mode={mode} />
            </TabsContent>
            <TabsContent value="versions" className="mt-3">
              <VersionsPanel contentId={content.id} versions={versions} canWrite={perms.write} onRestored={() => router.refresh()} />
            </TabsContent>
            <TabsContent value="details" className="mt-3">
              <DetailsPanel content={content} campaigns={campaigns} canWrite={perms.write} />
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Share “{title}”</DialogTitle>
            <DialogDescription>Anyone with the link can view a read-only copy. Disable it at any time.</DialogDescription>
          </DialogHeader>
          <label className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
            Public link
            <Switch checked={!!shareToken} onCheckedChange={toggleShare} disabled={!perms.write} aria-label="Enable public link" />
          </label>
          {shareToken && (
            <div className="mt-3 flex gap-2">
              <Input readOnly value={`${shareBase}${shareToken}`} aria-label="Share URL" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" size="icon" aria-label="Copy link" onClick={() => navigator.clipboard.writeText(`${shareBase}${shareToken}`).then(() => toast.success("Link copied"))}>
                <Link2 />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AIAssist({ editorRef, body, canWrite, onApplyMarkdown, mode }: { editorRef: React.RefObject<RichEditorHandle | null>; body: string; canWrite: boolean; onApplyMarkdown: (md: string) => void; mode: "rich" | "markdown" }) {
  const ai = useAIStream();
  const [tone, setTone] = React.useState("Friendly");
  const [format, setFormat] = React.useState("a LinkedIn post, an X thread and a short email");
  const [scope, setScope] = React.useState<"selection" | "document">("document");

  async function run(action: string) {
    const selection = mode === "rich" ? (editorRef.current?.getSelectionText() ?? "") : "";
    const useSelection = selection.trim().length > 20;
    setScope(useSelection ? "selection" : "document");
    const text = useSelection ? selection : body;
    if (!text.trim()) {
      toast.error("Write or generate some content first");
      return;
    }
    await ai.start("content/inline", { action, text, tone, format });
  }

  const replace = () => {
    if (scope === "selection" && mode === "rich") editorRef.current?.replaceSelection(ai.text);
    else {
      editorRef.current?.setMarkdown(ai.text);
      onApplyMarkdown(ai.text);
    }
    ai.setText("");
    toast.success("Applied");
  };
  const append = () => {
    if (mode === "rich") editorRef.current?.insertAtEnd(ai.text);
    else onApplyMarkdown(`${body}\n\n${ai.text}`);
    ai.setText("");
  };

  return (
    <Card className="space-y-3 p-4">
      <p className="text-xs text-muted-foreground">Select text in the editor to transform just that passage, or run an action on the whole document.</p>
      <div className="grid grid-cols-2 gap-1.5">
        {ACTIONS.map((a) => (
          <Button key={a.key} variant="outline" size="sm" onClick={() => run(a.key)} disabled={!canWrite || ai.streaming} className="justify-start">
            {a.label}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Tone" htmlFor="ai-tone">
          <Select id="ai-tone" value={tone} onChange={(e) => setTone(e.target.value)}>
            {TONES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Repurpose into" htmlFor="ai-format">
          <Input id="ai-format" value={format} onChange={(e) => setFormat(e.target.value)} />
        </Field>
      </div>
      {(ai.streaming || ai.text || ai.error) && (
        <div className="rounded-lg border border-border bg-surface">
          <div className="max-h-72 overflow-y-auto p-3 scrollbar-thin">{ai.error ? <p className="text-sm text-danger">{ai.error}</p> : <Markdown content={ai.text || "…"} className="text-sm" />}</div>
          <div className="flex flex-wrap gap-1.5 border-t border-border p-2">
            {ai.streaming ? (
              <Button size="sm" variant="outline" onClick={ai.stop}>
                <Square /> Stop
              </Button>
            ) : (
              ai.text && (
                <>
                  <Button size="sm" onClick={replace}>
                    Replace {scope}
                  </Button>
                  <Button size="sm" variant="outline" onClick={append}>
                    Insert at end
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(ai.text).then(() => toast.success("Copied"))}>
                    Copy
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => ai.setText("")}>
                    Discard
                  </Button>
                </>
              )
            )}
          </div>
        </div>
      )}
      <AIMeta meta={ai.meta} usage={ai.usage} streaming={ai.streaming} />
    </Card>
  );
}

function VersionsPanel({ contentId, versions, canWrite, onRestored }: { contentId: string; versions: Version[]; canWrite: boolean; onRestored: () => void }) {
  const [preview, setPreview] = React.useState<string | null>(null);
  const { data } = useSWR<{ title: string; body: string; version: number }>(preview ? `/api/v1/content/${contentId}/versions/${preview}` : null);
  const confirm = useConfirm();
  return (
    <Card className="p-2">
      {versions.length === 0 && <p className="p-3 text-sm text-muted-foreground">Versions are created when you save and periodically while editing.</p>}
      <ul className="max-h-[60dvh] divide-y divide-border overflow-y-auto scrollbar-thin">
        {versions.map((v) => (
          <li key={v.id} className="flex items-center gap-2 px-2 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Version {v.version}</p>
              <p className="truncate text-xs text-muted-foreground">
                {v.note ?? "Saved"} · <TimeAgo date={v.createdAt} />
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setPreview(v.id)}>
              View
            </Button>
          </li>
        ))}
      </ul>
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{data ? `Version ${data.version}: ${data.title}` : "Loading…"}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[55dvh] overflow-y-auto rounded-lg border border-border p-4 scrollbar-thin">{data ? <Markdown content={data.body} /> : <Loader2 className="size-5 animate-spin" />}</div>
          {canWrite && data && (
            <div className="mt-4 flex justify-end">
              <Button
                onClick={async () => {
                  if (!(await confirm({ title: `Restore version ${data.version}?`, description: "The current text is kept as a version, so you can switch back later.", confirmLabel: "Restore" }))) return;
                  try {
                    await api.post(`content/${contentId}/versions/${preview}/restore`);
                    toast.success(`Restored version ${data.version}`);
                    setPreview(null);
                    onRestored();
                    window.location.reload();
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Restore this version
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DetailsPanel({ content, campaigns, canWrite }: { content: Content; campaigns: { id: string; name: string }[]; canWrite: boolean }) {
  const [campaignId, setCampaignId] = React.useState(content.campaignId ?? "");
  const [tone, setTone] = React.useState(content.tone ?? "");
  const [keywords, setKeywords] = React.useState(content.keywords.join(", "));
  const [busy, setBusy] = React.useState(false);
  const { data: links } = useSWR<{ id: string; title: string; anchors: string[] }[]>(`/api/v1/content/${content.id}/links`);

  async function save() {
    setBusy(true);
    try {
      await api.patch(`content/${content.id}`, { campaignId: campaignId || null, tone: tone || null, keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean), autosave: true });
      toast.success("Details saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Card className="space-y-3 p-4">
        <Field label="Campaign" htmlFor="d-campaign">
          <Select id="d-campaign" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} disabled={!canWrite}>
            <option value="">None</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tone" htmlFor="d-tone">
          <Select id="d-tone" value={tone} onChange={(e) => setTone(e.target.value)} disabled={!canWrite}>
            <option value="">Not set</option>
            {TONES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="SEO keywords" htmlFor="d-kw" hint="Comma separated">
          <Input id="d-kw" value={keywords} onChange={(e) => setKeywords(e.target.value)} disabled={!canWrite} />
        </Field>
        {canWrite && (
          <Button size="sm" onClick={save} loading={busy}>
            Save details
          </Button>
        )}
        <dl className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <dt>Author</dt>
            <dd>{content.author?.name ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Created</dt>
            <dd><DateText date={content.createdAt} withTime /></dd>
          </div>
          <div className="flex justify-between">
            <dt>Source</dt>
            <dd>{content.generatedByAI ? "AI generated" : "Manual"}</dd>
          </div>
        </dl>
      </Card>
      <Card className="p-4">
        <h3 className="text-sm font-semibold">Internal link suggestions</h3>
        <p className="mb-2 text-xs text-muted-foreground">Related articles to link from this piece.</p>
        {!links ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : links.length === 0 ? (
          <p className="text-xs text-muted-foreground">No strong matches yet — add keywords or publish more articles.</p>
        ) : (
          <ul className="space-y-2">
            {links.map((l) => (
              <li key={l.id} className="text-sm">
                <Link href={`/app/content/${l.id}`} className="font-medium text-primary hover:underline">
                  {l.title}
                </Link>
                <p className="text-xs text-muted-foreground">Anchor ideas: {l.anchors.join(", ")}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
