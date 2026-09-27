"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { useDebouncedCallback, useQueryState } from "@/hooks/use-query-state";
import { Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Filter = { key: string; label: string; options: { value: string; label: string }[] };

/** Search + select filters bound to URL search params. */
export function ListToolbar({ placeholder = "Search…", filters = [], children, className }: { placeholder?: string; filters?: Filter[]; children?: React.ReactNode; className?: string }) {
  const q = useQueryState();
  const [search, setSearch] = React.useState(q.get("q"));
  const push = useDebouncedCallback((v: string) => q.set({ q: v }), 300);
  return (
    <div className={cn("mb-4 flex flex-col gap-2 sm:flex-row sm:items-center", className)}>
      <div className="relative flex-1 sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            push(e.target.value);
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Select key={f.key} value={q.get(f.key)} onChange={(e) => q.set({ [f.key]: e.target.value })} aria-label={f.label} className="w-auto min-w-[140px]">
            <option value="">{f.label}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ))}
        {children}
      </div>
      {q.pending && <span className="text-xs text-muted-foreground" aria-live="polite">Loading…</span>}
    </div>
  );
}

export function UrlPagination({ page, totalPages, total }: { page: number; totalPages: number; total: number }) {
  const q = useQueryState();
  if (totalPages <= 1) return <p className="mt-3 text-xs text-muted-foreground">{total.toLocaleString()} result{total === 1 ? "" : "s"}</p>;
  return (
    <nav className="mt-4 flex items-center justify-between" aria-label="Pagination">
      <p className="text-xs text-muted-foreground">
        Page {page} of {totalPages} · {total.toLocaleString()} results
      </p>
      <div className="flex gap-1">
        <button className="h-8 rounded-lg border border-border px-3 text-sm disabled:opacity-50" disabled={page <= 1} onClick={() => q.set({ page: page - 1 }, { resetPage: false })}>
          Previous
        </button>
        <button className="h-8 rounded-lg border border-border px-3 text-sm disabled:opacity-50" disabled={page >= totalPages} onClick={() => q.set({ page: page + 1 }, { resetPage: false })}>
          Next
        </button>
      </div>
    </nav>
  );
}
