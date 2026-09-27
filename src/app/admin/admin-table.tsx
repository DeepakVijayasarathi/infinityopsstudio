"use client";

import * as React from "react";
import useSWR from "swr";
import { Search } from "lucide-react";
import { DataTable, Pagination, type Column } from "@/components/ui/data-table";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/skeleton";

type Page<T> = { items: T[]; meta: { page: number; totalPages: number; total: number } };

/** Paginated, searchable admin list backed by an /api/v1/admin endpoint. */
export function AdminTable<T>({ endpoint, columns, rowKey, placeholder = "Search…", extraParams = "", refreshKey = 0 }: { endpoint: string; columns: Column<T>[]; rowKey: (r: T) => string; placeholder?: string; extraParams?: string; refreshKey?: number }) {
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const url = `${endpoint}?page=${page}&pageSize=25&q=${encodeURIComponent(debounced)}${extraParams}&_=${refreshKey}`;
  const { data, error, isLoading } = useSWR<Page<T>>(url, { keepPreviousData: true });
  return (
    <div>
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
      </div>
      {error ? (
        <ErrorState description={(error as Error).message} />
      ) : isLoading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : (
        <>
          <DataTable rows={data?.items ?? []} columns={columns} rowKey={rowKey} empty={<EmptyState title="Nothing found" />} />
          {data && <Pagination {...data.meta} onPage={setPage} />}
        </>
      )}
    </div>
  );
}
