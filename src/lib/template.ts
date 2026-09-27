/** Resolves a dotted path ("lead.firstName") against an object. */
export function getPath(scope: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), scope);
}

/** Replaces {{path}} placeholders with values from scope; unknown paths become "". */
export function renderTemplate(template: string, scope: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const v = getPath(scope, path);
    if (v === undefined || v === null) return "";
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  });
}

export type ConditionOperator = "equals" | "not_equals" | "contains" | "gt" | "gte" | "lt" | "lte" | "exists" | "not_exists";

export function evaluateCondition(scope: Record<string, unknown>, field: string, operator: ConditionOperator, value?: string): boolean {
  const actual = getPath(scope, field);
  const str = actual === undefined || actual === null ? "" : String(actual);
  const num = Number(actual);
  const target = Number(value);
  switch (operator) {
    case "equals":
      return str.toLowerCase() === (value ?? "").toLowerCase();
    case "not_equals":
      return str.toLowerCase() !== (value ?? "").toLowerCase();
    case "contains":
      return Array.isArray(actual) ? actual.map(String).includes(value ?? "") : str.toLowerCase().includes((value ?? "").toLowerCase());
    case "gt":
      return !Number.isNaN(num) && num > target;
    case "gte":
      return !Number.isNaN(num) && num >= target;
    case "lt":
      return !Number.isNaN(num) && num < target;
    case "lte":
      return !Number.isNaN(num) && num <= target;
    case "exists":
      return str !== "";
    case "not_exists":
      return str === "";
  }
}
