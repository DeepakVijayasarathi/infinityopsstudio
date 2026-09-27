"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Copy, ExternalLink, Eye, Globe, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatNumber, formatPercent } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { useConfirm } from "@/components/ui/confirm";

type Item = { title: string; body: string };
type Content = {
  hero: { eyebrow: string; headline: string; subheadline: string; cta: string };
  benefits: Item[];
  steps: Item[];
  proof: { quote: string; author: string; stat: string; statLabel: string };
  faq: { q: string; a: string }[];
  form: { title: string; button: string; success: string; fields: ("name" | "email" | "company" | "phone" | "message")[] };
  closing: { headline: string; body: string };
};
type Page = { id: string; title: string; slug: string; status: "DRAFT" | "PUBLISHED"; accentColor: string; seoTitle: string | null; seoDescription: string | null; views: number; conversions: number; content: Content };
type Section = keyof Content;

const FORM_FIELDS = ["name", "email", "company", "phone", "message"] as const;

function SectionCard({ title, description, section, onRegenerate, children, disabled }: { title: string; description?: string; section: Section; onRegenerate: (s: Section) => void; children: React.ReactNode; disabled: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        <Button size="sm" variant="ghost" onClick={() => onRegenerate(section)} disabled={disabled}>
          <RefreshCw /> Rewrite with AI
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function ItemList({ items, onChange, labels, max, disabled }: { items: Item[]; onChange: (v: Item[]) => void; labels: [string, string]; max: number; disabled: boolean }) {
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Input aria-label={`${labels[0]} ${i + 1}`} value={it.title} disabled={disabled} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder={labels[0]} />
            <Textarea aria-label={`${labels[1]} ${i + 1}`} rows={2} value={it.body} disabled={disabled} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} placeholder={labels[1]} />
          </div>
          <Button size="sm" variant="ghost" aria-label="Remove" disabled={disabled} onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <X />
          </Button>
        </div>
      ))}
      {items.length < max && (
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => onChange([...items, { title: "", body: "" }])}>
          <Plus /> Add
        </Button>
      )}
    </div>
  );
}

export function PageEditor({ page, appUrl, canWrite, canPublish }: { page: Page; appUrl: string; canWrite: boolean; canPublish: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [p, setP] = React.useState(page);
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const c = p.content;
  const url = `${appUrl}/p/${page.slug}`;
  const ro = !canWrite || !!busy;

  const setContent = <S extends Section>(s: S, v: Content[S]) => {
    setP((x) => ({ ...x, content: { ...x.content, [s]: v } }));
    setDirty(true);
  };
  const setField = <K extends "title" | "slug" | "accentColor" | "seoTitle" | "seoDescription">(k: K, v: Page[K]) => {
    setP((x) => ({ ...x, [k]: v }));
    setDirty(true);
  };

  async function run(label: string, fn: () => Promise<unknown>, success?: string) {
    setBusy(label);
    try {
      await fn();
      if (success) toast.success(success);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const save = () =>
    run(
      "save",
      async () => {
        const clean = {
          ...c,
          benefits: c.benefits.filter((b) => b.title.trim()),
          steps: c.steps.filter((b) => b.title.trim()),
          faq: c.faq.filter((f) => f.q.trim()),
        };
        await api.patch(`pages/${p.id}`, { title: p.title, slug: p.slug, accentColor: p.accentColor, seoTitle: p.seoTitle || null, seoDescription: p.seoDescription || null, content: clean });
        setDirty(false);
      },
      "Page saved",
    );

  async function regenerate(section: Section) {
    if (dirty && !(await confirm({ title: "Rewrite this section?", description: "Unsaved edits on this page will be lost.", confirmLabel: "Rewrite" }))) return;
    await run(
      "regen",
      async () => {
        await api.post(`pages/${p.id}/regenerate`, { section });
        const fresh = await api.get<Page>(`pages/${p.id}`);
        setP(fresh);
        setDirty(false);
      },
      "Section rewritten",
    );
  }

  async function publish(on: boolean) {
    if (on && dirty) await api.patch(`pages/${p.id}`, { title: p.title, slug: p.slug, accentColor: p.accentColor, seoTitle: p.seoTitle || null, seoDescription: p.seoDescription || null, content: c }).then(() => setDirty(false));
    await run(
      "publish",
      async () => {
        await api.post(`pages/${p.id}/publish`, { publish: on });
        setP((x) => ({ ...x, status: on ? "PUBLISHED" : "DRAFT" }));
      },
      on ? "Page is live" : "Page unpublished",
    );
  }

  async function remove() {
    if (!(await confirm({ title: "Delete this page?", description: "The public link stops working. Leads already captured stay in your CRM.", confirmLabel: "Delete", destructive: true }))) return;
    await run("delete", async () => {
      await api.del(`pages/${p.id}`);
      router.push("/app/pages");
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="ghost" asChild>
          <Link href="/app/pages">
            <ArrowLeft /> Pages
          </Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{p.title}</h1>
        <Badge tone={p.status === "PUBLISHED" ? "success" : "neutral"}>{p.status === "PUBLISHED" ? "Live" : "Draft"}</Badge>
        <Button size="sm" variant="outline" asChild>
          <a href={`/p/${page.slug}${p.status === "PUBLISHED" ? "" : "?preview=1"}`} target="_blank" rel="noreferrer">
            <Eye /> {p.status === "PUBLISHED" ? "View" : "Preview"}
          </a>
        </Button>
        {canWrite && (
          <Button size="sm" variant="outline" onClick={save} disabled={!!busy || !dirty}>
            <Save /> {busy === "save" ? "Saving…" : "Save"}
          </Button>
        )}
        {canPublish &&
          (p.status === "PUBLISHED" ? (
            <Button size="sm" variant="ghost" onClick={() => publish(false)} disabled={!!busy}>
              Unpublish
            </Button>
          ) : (
            <Button size="sm" onClick={() => publish(true)} disabled={!!busy}>
              <Globe /> Publish
            </Button>
          ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <SectionCard title="Hero" description="The first thing visitors see" section="hero" onRegenerate={regenerate} disabled={ro}>
            <Field label="Eyebrow" htmlFor="h-eyebrow">
              <Input id="h-eyebrow" value={c.hero.eyebrow} disabled={ro} onChange={(e) => setContent("hero", { ...c.hero, eyebrow: e.target.value })} />
            </Field>
            <Field label="Headline" htmlFor="h-head" required>
              <Input id="h-head" value={c.hero.headline} disabled={ro} maxLength={140} onChange={(e) => setContent("hero", { ...c.hero, headline: e.target.value })} />
            </Field>
            <Field label="Subheadline" htmlFor="h-sub">
              <Textarea id="h-sub" rows={3} value={c.hero.subheadline} disabled={ro} maxLength={400} onChange={(e) => setContent("hero", { ...c.hero, subheadline: e.target.value })} />
            </Field>
            <Field label="Button text" htmlFor="h-cta">
              <Input id="h-cta" value={c.hero.cta} disabled={ro} maxLength={40} onChange={(e) => setContent("hero", { ...c.hero, cta: e.target.value })} />
            </Field>
          </SectionCard>

          <SectionCard title="Benefits" section="benefits" onRegenerate={regenerate} disabled={ro}>
            <ItemList items={c.benefits} onChange={(v) => setContent("benefits", v)} labels={["Benefit", "Why it matters"]} max={6} disabled={ro} />
          </SectionCard>

          <SectionCard title="How it works" section="steps" onRegenerate={regenerate} disabled={ro}>
            <ItemList items={c.steps} onChange={(v) => setContent("steps", v)} labels={["Step", "Detail"]} max={5} disabled={ro} />
          </SectionCard>

          <SectionCard title="Proof" description="Only use real quotes and numbers" section="proof" onRegenerate={regenerate} disabled={ro}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Stat" htmlFor="p-stat">
                <Input id="p-stat" value={c.proof.stat} disabled={ro} placeholder="3×" onChange={(e) => setContent("proof", { ...c.proof, stat: e.target.value })} />
              </Field>
              <Field label="Stat label" htmlFor="p-statl">
                <Input id="p-statl" value={c.proof.statLabel} disabled={ro} placeholder="more qualified leads" onChange={(e) => setContent("proof", { ...c.proof, statLabel: e.target.value })} />
              </Field>
            </div>
            <Field label="Customer quote" htmlFor="p-quote">
              <Textarea id="p-quote" rows={2} value={c.proof.quote} disabled={ro} onChange={(e) => setContent("proof", { ...c.proof, quote: e.target.value })} />
            </Field>
            <Field label="Quote author" htmlFor="p-author">
              <Input id="p-author" value={c.proof.author} disabled={ro} placeholder="Name, Title at Company" onChange={(e) => setContent("proof", { ...c.proof, author: e.target.value })} />
            </Field>
          </SectionCard>

          <SectionCard title="FAQ" section="faq" onRegenerate={regenerate} disabled={ro}>
            <ItemList items={c.faq.map((f) => ({ title: f.q, body: f.a }))} onChange={(v) => setContent("faq", v.map((x) => ({ q: x.title, a: x.body })))} labels={["Question", "Answer"]} max={8} disabled={ro} />
          </SectionCard>

          <SectionCard title="Lead form" description="Submissions become leads (source: Website)" section="form" onRegenerate={regenerate} disabled={ro}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Form title" htmlFor="f-title">
                <Input id="f-title" value={c.form.title} disabled={ro} onChange={(e) => setContent("form", { ...c.form, title: e.target.value })} />
              </Field>
              <Field label="Button" htmlFor="f-btn">
                <Input id="f-btn" value={c.form.button} disabled={ro} onChange={(e) => setContent("form", { ...c.form, button: e.target.value })} />
              </Field>
            </div>
            <Field label="Thank-you message" htmlFor="f-ok">
              <Input id="f-ok" value={c.form.success} disabled={ro} onChange={(e) => setContent("form", { ...c.form, success: e.target.value })} />
            </Field>
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <legend className="mb-2 text-sm font-medium">Fields</legend>
              {FORM_FIELDS.map((f) => (
                <label key={f} className="flex items-center gap-2 capitalize">
                  <Checkbox
                    checked={c.form.fields.includes(f)}
                    disabled={ro || f === "email"}
                    onCheckedChange={(v) => setContent("form", { ...c.form, fields: v ? FORM_FIELDS.filter((x) => x === f || c.form.fields.includes(x)) : c.form.fields.filter((x) => x !== f) })}
                  />
                  {f}
                </label>
              ))}
            </fieldset>
          </SectionCard>

          <SectionCard title="Closing" section="closing" onRegenerate={regenerate} disabled={ro}>
            <Field label="Headline" htmlFor="c-head">
              <Input id="c-head" value={c.closing.headline} disabled={ro} onChange={(e) => setContent("closing", { ...c.closing, headline: e.target.value })} />
            </Field>
            <Field label="Text" htmlFor="c-body">
              <Textarea id="c-body" rows={2} value={c.closing.body} disabled={ro} onChange={(e) => setContent("closing", { ...c.closing, body: e.target.value })} />
            </Field>
          </SectionCard>
        </div>

        <div className="space-y-5 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <dt className="text-xs text-muted-foreground">Views</dt>
                  <dd className="text-lg font-semibold">{formatNumber(p.views)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Leads</dt>
                  <dd className="text-lg font-semibold">{formatNumber(p.conversions)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Rate</dt>
                  <dd className="text-lg font-semibold">{p.views ? formatPercent(p.conversions / p.views) : "—"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Page settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {p.status === "PUBLISHED" && (
                <div className="flex gap-2">
                  <Input readOnly value={url} className="font-mono text-xs" aria-label="Public URL" />
                  <Button size="sm" variant="outline" aria-label="Copy URL" onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Link copied"))}>
                    <Copy />
                  </Button>
                  <Button size="sm" variant="outline" aria-label="Open" asChild>
                    <a href={url} target="_blank" rel="noreferrer">
                      <ExternalLink />
                    </a>
                  </Button>
                </div>
              )}
              <Field label="Internal name" htmlFor="s-title">
                <Input id="s-title" value={p.title} disabled={ro} onChange={(e) => setField("title", e.target.value)} />
              </Field>
              <Field label="URL" htmlFor="s-slug" hint={`${appUrl}/p/${p.slug}`}>
                <Input id="s-slug" value={p.slug} disabled={ro} onChange={(e) => setField("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} />
              </Field>
              <Field label="Accent colour" htmlFor="s-color">
                <div className="flex gap-2">
                  <input type="color" aria-label="Pick colour" value={p.accentColor} disabled={ro} onChange={(e) => setField("accentColor", e.target.value)} className="h-9 w-12 rounded border" />
                  <Input id="s-color" value={p.accentColor} disabled={ro} onChange={(e) => setField("accentColor", e.target.value)} />
                </div>
              </Field>
              <Field label="SEO title" htmlFor="s-seot">
                <Input id="s-seot" maxLength={70} value={p.seoTitle ?? ""} disabled={ro} onChange={(e) => setField("seoTitle", e.target.value)} />
              </Field>
              <Field label="SEO description" htmlFor="s-seod">
                <Textarea id="s-seod" rows={3} maxLength={160} value={p.seoDescription ?? ""} disabled={ro} onChange={(e) => setField("seoDescription", e.target.value)} />
              </Field>
              {canWrite && (
                <Button variant="ghost" className="w-full text-destructive" onClick={remove} disabled={!!busy}>
                  <Trash2 /> Delete page
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
