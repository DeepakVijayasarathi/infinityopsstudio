"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Globe, Lightbulb, Minus, Plus, RefreshCw, Search, Sparkles, Square, Swords, Trash2, XCircle } from "lucide-react";
import { api } from "@/lib/api-client";
import { cn, formatCompact } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { Markdown } from "@/components/ui/markdown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateText } from "@/components/ui/time";
import { useConfirm } from "@/components/ui/confirm";
import { AIMeta } from "@/components/app/ai-meta";
import { useAIStream } from "@/hooks/use-ai-stream";

type Check = { id: string; label: string; status: "pass" | "warn" | "fail"; detail: string };
type Project = { id: string; name: string; domain: string; score: number | null; lastAuditAt: string | null; competitors: string[]; auditResult: { url: string; score: number; checks: Check[]; stats: Record<string, string | number | null> } | null; _count?: { keywords: number } };
type Keyword = { id: string; term: string; searchVolume: number; difficulty: number; cpcCents: number; intent: string | null; position: number | null; previousPosition: number | null; status: string; targetUrl: string | null };
type Report = { keywords: { total: number; top3: number; top10: number; improved: number; declined: number; avgPosition: number | null; totalVolume: number } };

function ScoreRing({ score }: { score: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? "hsl(var(--success))" : score >= 60 ? "hsl(var(--warning))" : "hsl(var(--danger))";
  return (
    <div className="relative size-28" role="img" aria-label={`SEO score ${score} out of 100`}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-2xl font-semibold tabular-nums">{score}</span>
      </div>
    </div>
  );
}

export function SeoView({ projects, project, keywords, opportunities, report, canWrite }: { projects: Project[]; project: Project | null; keywords: Keyword[]; opportunities: { id: string; term: string; searchVolume: number; difficulty: number; intent: string | null; opportunity: number }[]; report: Report | null; canWrite: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [newOpen, setNewOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", domain: "", competitors: "" });
  const [busy, setBusy] = React.useState<string | null>(null);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create");
    try {
      const p = await api.post<{ id: string }>("seo/projects", { name: form.name || form.domain, domain: form.domain, competitors: form.competitors.split(",").map((c) => c.trim()).filter(Boolean) });
      toast.success("Project created");
      setNewOpen(false);
      router.push(`/app/seo?project=${p.id}`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function audit() {
    if (!project) return;
    setBusy("audit");
    try {
      const r = await api.post<{ score: number }>(`seo/projects/${project.id}/audit`, {});
      toast.success(`Audit complete — score ${r.score}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const newDialog = (
    <Dialog open={newOpen} onOpenChange={setNewOpen}>
      <DialogContent size="sm">
        <form onSubmit={createProject}>
          <DialogHeader>
            <DialogTitle>New SEO project</DialogTitle>
            <DialogDescription>Track one website and its keywords.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Domain" htmlFor="p-domain" required>
              <Input id="p-domain" value={form.domain} onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))} placeholder="example.com" required />
            </Field>
            <Field label="Project name" htmlFor="p-name">
              <Input id="p-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Main website" />
            </Field>
            <Field label="Competitors" htmlFor="p-comp" hint="Comma-separated domains">
              <Input id="p-comp" value={form.competitors} onChange={(e) => setForm((f) => ({ ...f, competitors: e.target.value }))} placeholder="competitor.com, rival.io" />
            </Field>
          </div>
          <DialogFooter>
            <Button type="submit" loading={busy === "create"}>
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  if (!project) {
    return (
      <>
        <EmptyState icon={Globe} title="Add your first website" description="Run an 18-point on-page audit, track keyword positions and discover content gaps." action={canWrite && <Button onClick={() => setNewOpen(true)}><Plus /> New project</Button>} />
        {newDialog}
      </>
    );
  }

  const audit_ = project.auditResult;
  const counts = audit_ ? { pass: audit_.checks.filter((c) => c.status === "pass").length, warn: audit_.checks.filter((c) => c.status === "warn").length, fail: audit_.checks.filter((c) => c.status === "fail").length } : null;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Select value={project.id} onChange={(e) => router.push(`/app/seo?project=${e.target.value}`)} aria-label="Project" className="w-auto min-w-56">
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.domain})
            </option>
          ))}
        </Select>
        {canWrite && (
          <>
            <Button variant="outline" onClick={() => setNewOpen(true)}>
              <Plus /> New project
            </Button>
            <Button
              variant="ghost"
              className="text-danger"
              onClick={async () => {
                if (!(await confirm({ title: `Delete ${project.name}?`, description: "Keywords and audit history for this project will be removed.", destructive: true, confirmLabel: "Delete project" }))) return;
                try {
                  await api.del(`seo/projects/${project.id}`);
                  toast.success("Project deleted");
                  router.push("/app/seo");
                  router.refresh();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <Trash2 /> Delete
            </Button>
          </>
        )}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-4">
        <Card className="flex items-center gap-5 p-5 lg:col-span-2">
          {project.score !== null ? <ScoreRing score={project.score} /> : <div className="grid size-28 place-items-center rounded-full border-8 border-muted text-xs text-muted-foreground">No audit</div>}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">SEO score for</p>
            <p className="truncate text-lg font-semibold">{project.domain}</p>
            <p className="text-xs text-muted-foreground">{project.lastAuditAt ? <>Last audit <DateText date={project.lastAuditAt} withTime /></> : "Run an audit to get your score"}</p>
            {counts && (
              <div className="mt-2 flex gap-3 text-xs">
                <span className="text-success">{counts.pass} passed</span>
                <span className="text-warning">{counts.warn} warnings</span>
                <span className="text-danger">{counts.fail} failed</span>
              </div>
            )}
            {canWrite && (
              <Button size="sm" className="mt-3" onClick={audit} loading={busy === "audit"}>
                <RefreshCw /> {project.score !== null ? "Re-run audit" : "Run audit"}
              </Button>
            )}
          </div>
        </Card>
        {report && (
          <>
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">Keywords in top 10</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {report.keywords.top10} <span className="text-sm font-normal text-muted-foreground">/ {report.keywords.total}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{report.keywords.top3} in the top 3 · avg position {report.keywords.avgPosition ?? "—"}</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-muted-foreground">Ranking movement</p>
              <p className="mt-2 flex items-center gap-3 text-2xl font-semibold tabular-nums">
                <span className="flex items-center text-success">
                  <ArrowUp className="size-5" />
                  {report.keywords.improved}
                </span>
                <span className="flex items-center text-danger">
                  <ArrowDown className="size-5" />
                  {report.keywords.declined}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{formatCompact(report.keywords.totalVolume)} monthly searches tracked</p>
            </Card>
          </>
        )}
      </div>

      <Tabs defaultValue="keywords">
        <TabsList>
          <TabsTrigger value="keywords">
            <Search /> Keywords
          </TabsTrigger>
          <TabsTrigger value="audit">
            <CheckCircle2 /> Audit
          </TabsTrigger>
          <TabsTrigger value="opportunities">
            <Lightbulb /> Opportunities
          </TabsTrigger>
          <TabsTrigger value="competitors">
            <Swords /> Competitors
          </TabsTrigger>
        </TabsList>
        <TabsContent value="keywords">
          <KeywordsPanel project={project} keywords={keywords} canWrite={canWrite} onChanged={() => router.refresh()} />
        </TabsContent>
        <TabsContent value="audit">
          {!audit_ ? (
            <EmptyState icon={CheckCircle2} title="No audit yet" description={`Audit ${project.domain} for titles, meta, headings, mobile, schema, speed and more.`} action={canWrite && <Button onClick={audit} loading={busy === "audit"}>Run audit</Button>} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>On-page audit</CardTitle>
                <CardDescription>{audit_.url}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {[...audit_.checks].sort((a, b) => ["fail", "warn", "pass"].indexOf(a.status) - ["fail", "warn", "pass"].indexOf(b.status)).map((c) => (
                    <li key={c.id} className="flex items-start gap-3 py-3">
                      {c.status === "pass" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" /> : c.status === "warn" ? <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-danger" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{c.label}</p>
                        <p className="break-words text-xs text-muted-foreground">{c.detail}</p>
                      </div>
                      <span className="sr-only">{c.status}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="opportunities">
          {opportunities.length === 0 ? (
            <EmptyState icon={Lightbulb} title="No content gaps found" description="Every tracked keyword is covered by your content library. Add more keywords to find new opportunities." />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Content opportunities</CardTitle>
                <CardDescription>Tracked keywords with no matching content — ranked by volume ÷ difficulty.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {opportunities.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{o.term}</p>
                        <p className="text-xs text-muted-foreground">
                          {o.searchVolume.toLocaleString()} searches/mo · difficulty {o.difficulty} · {o.intent ?? "intent unknown"}
                        </p>
                      </div>
                      <Badge tone="success">Score {o.opportunity}</Badge>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/app/content/new?generator=blog`}>
                          <Sparkles /> Write article
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="competitors">
          <CompetitorsPanel project={project} canWrite={canWrite} onChanged={() => router.refresh()} />
        </TabsContent>
      </Tabs>
      {newDialog}
    </>
  );
}

function Movement({ k }: { k: Keyword }) {
  if (k.position === null || k.previousPosition === null || k.position === k.previousPosition) return <Minus className="size-3.5 text-muted-foreground" aria-label="No change" />;
  const up = k.position < k.previousPosition;
  return (
    <span className={cn("inline-flex items-center text-xs font-medium", up ? "text-success" : "text-danger")} aria-label={up ? "Improved" : "Declined"}>
      {up ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
      {Math.abs(k.position - k.previousPosition)}
    </span>
  );
}

function KeywordsPanel({ project, keywords, canWrite, onChanged }: { project: Project; keywords: Keyword[]; canWrite: boolean; onChanged: () => void }) {
  const [adding, setAdding] = React.useState("");
  const [seed, setSeed] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<{ term: string; intent: string | null; difficulty: number; exists: boolean }[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Keyword | null>(null);

  async function add(terms: { term: string; intent?: string | null; difficulty?: number }[]) {
    setBusy("add");
    try {
      const r = await api.post<{ created: number; skipped: number }>(`seo/projects/${project.id}/keywords`, { keywords: terms });
      toast.success(`${r.created} keyword${r.created === 1 ? "" : "s"} added${r.skipped ? ` (${r.skipped} already tracked)` : ""}`);
      setAdding("");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function suggest() {
    setBusy("suggest");
    try {
      setSuggestions(await api.post(`seo/projects/${project.id}/keywords/suggest`, { seed }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const terms = adding.split(/[\n,]/).map((t) => t.trim()).filter(Boolean).map((term) => ({ term }));
                if (terms.length) void add(terms);
              }}
              className="space-y-2"
            >
              <Field label="Track keywords" htmlFor="kw-add" hint="One per line or comma-separated">
                <Textarea id="kw-add" value={adding} onChange={(e) => setAdding(e.target.value)} rows={2} placeholder="route planning software, fleet fuel savings" />
              </Field>
              <Button type="submit" size="sm" loading={busy === "add"} disabled={!adding.trim()}>
                <Plus /> Add keywords
              </Button>
            </form>
          </Card>
          <Card className="p-4">
            <div className="space-y-2">
              <Field label="AI keyword suggestions" htmlFor="kw-seed" hint="Atlas suggests related terms with intent and difficulty.">
                <div className="flex gap-2">
                  <Input id="kw-seed" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="delivery route optimization" />
                  <Button type="button" variant="outline" onClick={suggest} loading={busy === "suggest"} disabled={seed.trim().length < 2}>
                    <Sparkles /> Suggest
                  </Button>
                </div>
              </Field>
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s) => (
                    <button key={s.term} disabled={s.exists} onClick={() => add([{ term: s.term, intent: s.intent, difficulty: s.difficulty }])} className="rounded-full border border-border px-2.5 py-1 text-xs transition hover:border-primary hover:text-primary disabled:opacity-50" title={s.exists ? "Already tracked" : `Add “${s.term}”`}>
                      {s.exists ? "✓ " : "+ "}
                      {s.term}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
      {keywords.length === 0 ? (
        <EmptyState icon={Search} title="No keywords tracked" description="Add the search terms you want to rank for." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Keyword</th>
                <th className="px-4 py-3 text-right">Volume</th>
                <th className="px-4 py-3 text-right">Difficulty</th>
                <th className="px-4 py-3">Intent</th>
                <th className="px-4 py-3 text-right">Position</th>
                <th className="px-4 py-3">Change</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {keywords.map((k) => (
                <tr key={k.id}>
                  <td className="px-4 py-2.5 font-medium">{k.term}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{k.searchVolume.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={cn("tabular-nums", k.difficulty >= 70 ? "text-danger" : k.difficulty >= 40 ? "text-warning" : "text-success")}>{k.difficulty}</span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{k.intent ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{k.position ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <Movement k={k} />
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={k.status} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {canWrite && (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(k)}>
                        Edit
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <KeywordDialog keyword={editing} onClose={() => setEditing(null)} onChanged={onChanged} />
    </div>
  );
}

function KeywordDialog({ keyword, onClose, onChanged }: { keyword: Keyword | null; onClose: () => void; onChanged: () => void }) {
  const [v, setV] = React.useState({ searchVolume: "", difficulty: "", position: "", status: "TRACKING", targetUrl: "" });
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (keyword) setV({ searchVolume: String(keyword.searchVolume), difficulty: String(keyword.difficulty), position: keyword.position?.toString() ?? "", status: keyword.status, targetUrl: keyword.targetUrl ?? "" });
  }, [keyword]);
  if (!keyword) return null;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch(`seo/keywords/${keyword!.id}`, { searchVolume: Number(v.searchVolume) || 0, difficulty: Number(v.difficulty) || 0, position: v.position ? Number(v.position) : null, status: v.status, targetUrl: v.targetUrl || null });
      toast.success("Keyword updated");
      onClose();
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    try {
      await api.del(`seo/keywords/${keyword!.id}`);
      toast.success("Keyword removed");
      onClose();
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm">
        <form onSubmit={save}>
          <DialogHeader>
            <DialogTitle>{keyword.term}</DialogTitle>
            <DialogDescription>Update metrics from your rank tracker or Search Console.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monthly volume" htmlFor="k-vol">
              <Input id="k-vol" type="number" min={0} value={v.searchVolume} onChange={(e) => setV((x) => ({ ...x, searchVolume: e.target.value }))} />
            </Field>
            <Field label="Difficulty (0–100)" htmlFor="k-diff">
              <Input id="k-diff" type="number" min={0} max={100} value={v.difficulty} onChange={(e) => setV((x) => ({ ...x, difficulty: e.target.value }))} />
            </Field>
            <Field label="Current position" htmlFor="k-pos">
              <Input id="k-pos" type="number" min={1} value={v.position} onChange={(e) => setV((x) => ({ ...x, position: e.target.value }))} />
            </Field>
            <Field label="Status" htmlFor="k-status">
              <Select id="k-status" value={v.status} onChange={(e) => setV((x) => ({ ...x, status: e.target.value }))}>
                <option value="TRACKING">Tracking</option>
                <option value="OPPORTUNITY">Opportunity</option>
                <option value="ARCHIVED">Archived</option>
              </Select>
            </Field>
          </div>
          <Field label="Target URL" htmlFor="k-url" className="mt-3">
            <Input id="k-url" type="url" value={v.targetUrl} onChange={(e) => setV((x) => ({ ...x, targetUrl: e.target.value }))} />
          </Field>
          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="ghost" className="text-danger" onClick={remove}>
              <Trash2 /> Remove
            </Button>
            <Button type="submit" loading={busy}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CompetitorsPanel({ project, canWrite, onChanged }: { project: Project; canWrite: boolean; onChanged: () => void }) {
  const ai = useAIStream();
  const [list, setList] = React.useState(project.competitors.join(", "));
  const [saving, setSaving] = React.useState(false);
  async function save() {
    setSaving(true);
    try {
      await api.patch(`seo/projects/${project.id}`, { competitors: list.split(",").map((c) => c.trim()).filter(Boolean) });
      toast.success("Competitors saved");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card className="h-fit p-4">
        <Field label="Competitor domains" htmlFor="comp" hint="Comma-separated">
          <Textarea id="comp" value={list} onChange={(e) => setList(e.target.value)} rows={3} disabled={!canWrite} />
        </Field>
        <div className="mt-3 flex flex-wrap gap-2">
          {canWrite && (
            <Button size="sm" variant="outline" onClick={save} loading={saving}>
              Save
            </Button>
          )}
          {ai.streaming ? (
            <Button size="sm" variant="outline" onClick={ai.stop}>
              <Square /> Stop
            </Button>
          ) : (
            <Button size="sm" onClick={() => ai.start(`seo/projects/${project.id}/competitors`, {})} disabled={!canWrite || project.competitors.length === 0}>
              <Sparkles /> Research competitors
            </Button>
          )}
        </div>
        <div className="mt-3">
          <AIMeta meta={ai.meta} usage={ai.usage} streaming={ai.streaming} />
        </div>
      </Card>
      <Card>
        <CardContent className="p-6">
          {ai.error && <p className="text-sm text-danger">{ai.error}</p>}
          {ai.text ? <Markdown content={ai.text} /> : <EmptyState icon={Swords} title="Competitor research" description="Atlas compares keyword focus, content formats and gaps, then proposes a 60-day plan." className="border-0 bg-transparent" />}
        </CardContent>
      </Card>
    </div>
  );
}
