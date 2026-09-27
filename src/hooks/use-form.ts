"use client";

import * as React from "react";
import type { ZodType, ZodTypeDef } from "zod";
import { ApiError } from "@/lib/api-client";

type Errors = Record<string, string | undefined>;

/**
 * Minimal form state + Zod validation. Shares the exact schema used by the API,
 * and maps server VALIDATION_ERROR details back onto fields.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useForm<T extends Record<string, any>, O = T>(schema: ZodType<O, ZodTypeDef, any>, initial: T) {
  const [values, setValues] = React.useState<T>(initial);
  const [errors, setErrors] = React.useState<Errors>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const set = React.useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key as string]: undefined }));
  }, []);

  const bind = (key: keyof T & string) => ({
    id: key,
    name: key,
    value: (values[key] ?? "") as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(key, e.target.value as T[typeof key]),
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `${key}-error` : undefined,
  });

  const validate = (): O | null => {
    const parsed = schema.safeParse(values);
    if (parsed.success) {
      setErrors({});
      return parsed.data;
    }
    const next: Errors = {};
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? "_");
      next[k] ??= issue.message;
    }
    setErrors(next);
    return null;
  };

  const handleError = (err: unknown) => {
    if (err instanceof ApiError && Array.isArray(err.details)) {
      const next: Errors = {};
      for (const d of err.details as { path: string; message: string }[]) next[d.path.split(".")[0] ?? "_"] ??= d.message;
      setErrors(next);
    }
    setFormError(err instanceof Error ? err.message : "Something went wrong");
  };

  const submit = (fn: (data: O) => Promise<void>) => async (e?: React.FormEvent) => {
    e?.preventDefault();
    setFormError(null);
    const data = validate();
    if (!data) return;
    setSubmitting(true);
    try {
      await fn(data);
    } catch (err) {
      handleError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return { values, setValues, set, bind, errors, setErrors, submitting, formError, setFormError, submit };
}
