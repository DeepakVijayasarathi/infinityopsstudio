"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Megaphone, Mail, PenLine, RefreshCw, Save, Search, Share2, ShoppingBag, Sparkles, Square, LayoutTemplate } from "lucide-react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Markdown } from "@/components/ui/markdown";
import { EmptyState } from "@/components/ui/states";
import { ModelSelect } from "@/components/app/model-select";
import { AIMeta } from "@/components/app/ai-meta";
import { useAIStream } from "@/hooks/use-ai-stream";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = { blog: PenLine, social: Share2, ad: Megaphone, landing: LayoutTemplate, email: Mail, product: ShoppingBag, "seo-meta": Search };
const TYPE_FOR: Record<string, string> = { blog: "BLOG_POST", social: "SOCIAL_POST", ad: "AD_COPY", landing: "LANDING_PAGE", email: "EMAIL", product: "PRODUCT_DESCRIPTION", "seo-meta": "SEO_META" };
const FIELD_META: Record<string, { label: string; placeholder: string; multiline?: boolean }> = {
  topic: { label: "Topic or brief", placeholder: "How mid-size 3PLs can cut fuel costs before peak season", multiline: true },
  keywords: { label: "Keywords", placeholder: "route optimization, fuel costs" },
  audience: { label: "Audience", placeholder: "Operations leaders at mid-size 3PLs" },
  length: { label: "Length", placeholder: "~1,000 words" },
  platform: { label: "Platform", placeholder: "LinkedIn" },
};

type Gen = { key: string; label: string; description: string; fields: string[] };

export function Generator({ generators, tones, campaigns, initialCampaignId, initialGenerator }: { generators: Gen[]; tones: string[]; campaigns: { id: string; name: string }[]; initialCampaignId: string; initialGenerator: string }) {
  const router = useRouter();
  const [generator, setGenerator] = React.useState(generators.some((g) => g.key === initialGenerator) ? initialGenerator : "blog");
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [tone, setTone] = React.useState(tones[0]!);
  const [model, setModel] = React.useState<string | null>(null);
  const [campaignId, setCampaignId] = React.useState(initialCampaignId);
  const [title, setTitle] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const ai = useAIStream();
  const g = generators.find((x) => x.key === generator)!;

  async function generate(e?: React.FormEvent) {
    e?.preventDefault();
    if (!values.topic?.trim()) {
      toast.error("Describe the topic first");
      return;
    }
    if (!title) setTitle(values.topic.slice(0, 90));
    await ai.start("content/generate", { generator, values, tone, model });
  }

  async function save() {
    setSaving(true);
    try {
      const c = await api.post<{ id: string }>("content", { title: title || values.topic?.slice(0, 90) || g.label, type: TYPE_FOR[generator], body: ai.text, tone, campaignId: campaignId || null, keywords: (values.keywords ?? "").split(",").map((k) => k.trim()).filter(Boolean), generatedByAI: true });
      toast.success("Saved to Content Studio");
      router.push(`/app/content/${c.id}`);
    } catch (err) {
      toast.error((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <form onSubmit={generate} className="space-y-5">
        <div role="radiogroup" aria-label="Content type" className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
          {generators.map((x) => {
            const Icon = ICONS[x.key] ?? Sparkles;
            return (
              <button
                key={x.key}
                type="button"
                role="radio"
                aria-checked={generator === x.key}
                onClick={() => setGenerator(x.key)}
                className={cn("flex items-start gap-2.5 rounded-xl border p-3 text-left transition", generator === x.key ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border bg-card hover:border-primary/30")}
              >
                <Icon className={cn("mt-0.5 size-4 shrink-0", generator === x.key ? "text-primary" : "text-muted-foreground")} />
                <span>
                  <span className="block text-sm font-medium">{x.label}</span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">{x.description}</span>
                </span>
              </button>
            );
          })}
        </div>
        {g.fields.map((f) => {
          const meta = FIELD_META[f] ?? { label: f, placeholder: "" };
          return (
            <Field key={f} label={meta.label} htmlFor={`f-${f}`} required={f === "topic"}>
              {meta.multiline ? (
                <Textarea id={`f-${f}`} value={values[f] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))} placeholder={meta.placeholder} rows={3} />
              ) : (
                <Input id={`f-${f}`} value={values[f] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))} placeholder={meta.placeholder} />
              )}
            </Field>
          );
        })}
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium">Tone</legend>
          <div className="flex flex-wrap gap-1.5">
            {tones.map((t) => (
              <button key={t} type="button" aria-pressed={tone === t} onClick={() => setTone(t)} className={cn("rounded-full border px-3 py-1 text-xs font-medium transition", tone === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                {t}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <Field label="AI model" htmlFor="model">
            <ModelSelect value={model} onChange={setModel} />
          </Field>
          <Field label="Campaign" htmlFor="campaign">
            <Select id="campaign" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">No campaign</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {ai.streaming ? (
          <Button type="button" variant="outline" size="lg" className="w-full" onClick={ai.stop}>
            <Square /> Stop generating
          </Button>
        ) : (
          <Button type="submit" size="lg" className="w-full">
            <Sparkles /> Generate {g.label.toLowerCase()}
          </Button>
        )}
      </form>

      <Card className="min-h-[520px]">
        <CardContent className="flex h-full flex-col p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title for the library" aria-label="Title" className="min-w-0 flex-1 border-transparent bg-transparent shadow-none" />
            <Button variant="ghost" size="sm" disabled={!ai.text || ai.streaming} onClick={() => navigator.clipboard.writeText(ai.text).then(() => toast.success("Copied"))}>
              <Copy /> Copy
            </Button>
            <Button variant="ghost" size="sm" disabled={!ai.text || ai.streaming} onClick={() => generate()}>
              <RefreshCw /> Regenerate
            </Button>
            <Button size="sm" disabled={!ai.text || ai.streaming} loading={saving} onClick={save}>
              <Save /> Save & edit
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin" aria-live="polite" aria-busy={ai.streaming}>
            {ai.error && <p className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">{ai.error}</p>}
            {ai.text ? (
              <Markdown content={ai.text} />
            ) : (
              !ai.streaming && <EmptyState icon={Sparkles} title="Your draft will appear here" description="Output streams in real time and uses your Brand Kit automatically." className="border-0 bg-transparent" />
            )}
          </div>
          <div className="border-t border-border px-4 py-2">
            <AIMeta meta={ai.meta} usage={ai.usage} streaming={ai.streaming} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
