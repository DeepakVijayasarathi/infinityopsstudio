"use client";

import useSWR from "swr";
import { Select } from "@/components/ui/input";

type ModelsResponse = { allowSelection: boolean; defaultModel: string | null; models: { id: string; label: string; provider: string; configured: boolean; description: string }[] };

/** Model picker honouring admin configuration (only configured + enabled models are selectable). */
export function ModelSelect({ value, onChange, id = "model", className, allowDefault = true }: { value: string | null | undefined; onChange: (v: string | null) => void; id?: string; className?: string; allowDefault?: boolean }) {
  const { data } = useSWR<ModelsResponse>("/api/v1/ai/models");
  if (data && !data.allowSelection) return <p className="text-xs text-muted-foreground">Model is set by your administrator.</p>;
  const usable = data?.models.filter((m) => m.configured) ?? [];
  return (
    <Select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className={className} disabled={!data}>
      {allowDefault && <option value="">Workspace default</option>}
      {usable.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
          {m.provider === "local" ? " — no API key needed" : m.provider === "claude-code" ? " — uses your Claude login" : ""}
        </option>
      ))}
    </Select>
  );
}
