"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export type Column<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  /** Hide on small screens (the mobile card view shows `primary` + `mobile` columns). */
  hideOnMobile?: boolean;
};

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  className?: string;
  selectable?: { selected: Set<string>; onChange: (next: Set<string>) => void };
};

/** Accessible table on desktop; stacked cards on mobile. */
export function DataTable<T>({ rows, columns, rowKey, onRowClick, empty, className, selectable }: Props<T>) {
  if (!rows.length && empty) return <>{empty}</>;
  const allSelected = selectable && rows.length > 0 && rows.every((r) => selectable.selected.has(rowKey(r)));
  const toggle = (id: string) => {
    if (!selectable) return;
    const next = new Set(selectable.selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectable.onChange(next);
  };
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card card-shadow", className)}>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-[12px] uppercase tracking-wide text-muted-foreground">
            <tr>
              {selectable && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    className="size-4 accent-[hsl(var(--primary))]"
                    checked={!!allSelected}
                    onChange={() => selectable.onChange(allSelected ? new Set() : new Set(rows.map(rowKey)))}
                  />
                </th>
              )}
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn("px-4 py-3 font-medium whitespace-nowrap", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const id = rowKey(row);
              return (
                <tr
                  key={id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn("transition-colors", onRowClick && "cursor-pointer hover:bg-muted/60", selectable?.selected.has(id) && "bg-primary/5")}
                >
                  {selectable && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label="Select row" className="size-4 accent-[hsl(var(--primary))]" checked={selectable.selected.has(id)} onChange={() => toggle(id)} />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-4 py-3 align-middle", c.className)}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-border md:hidden">
        {rows.map((row) => {
          const id = rowKey(row);
          const [primary, ...rest] = columns;
          return (
            <li key={id}>
              <div
                role={onRowClick ? "button" : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => e.key === "Enter" && onRowClick(row) : undefined}
                className="flex gap-3 p-4 active:bg-muted/60"
              >
                {selectable && (
                  <input type="checkbox" aria-label="Select row" className="mt-1 size-4 accent-[hsl(var(--primary))]" checked={selectable.selected.has(id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(id)} />
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="font-medium">{primary?.cell(row)}</div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground">
                    {rest
                      .filter((c) => !c.hideOnMobile)
                      .map((c) => (
                        <div key={c.key} className="flex items-center gap-1.5">
                          {typeof c.header === "string" && <span className="text-[11px] uppercase tracking-wide">{c.header}:</span>}
                          {c.cell(row)}
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return <p className="mt-3 text-xs text-muted-foreground">{total.toLocaleString()} result{total === 1 ? "" : "s"}</p>;
  return (
    <nav className="mt-4 flex items-center justify-between gap-2" aria-label="Pagination">
      <p className="text-xs text-muted-foreground">
        Page {page} of {totalPages} · {total.toLocaleString()} results
      </p>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft /> Prev
        </Button>
        <Button variant="outline" size="sm" onClick={() => onPage(page + 1)} disabled={page >= totalPages} aria-label="Next page">
          Next <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
