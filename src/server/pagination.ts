import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().max(40).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
  q: z.string().trim().max(200).optional(),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export function pageArgs(p: Pick<PaginationInput, "page" | "pageSize">) {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

export function orderBy<T extends string>(p: Pick<PaginationInput, "sort" | "order">, allowed: readonly T[], fallback: T) {
  const field = allowed.includes(p.sort as T) ? (p.sort as T) : fallback;
  return { [field]: p.order } as Record<T, "asc" | "desc">;
}

export type Paginated<T> = {
  items: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

export function paginated<T>(items: T[], total: number, p: Pick<PaginationInput, "page" | "pageSize">): Paginated<T> {
  return { items, meta: { page: p.page, pageSize: p.pageSize, total, totalPages: Math.max(1, Math.ceil(total / p.pageSize)) } };
}
