"use client";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(url.startsWith("/") ? url : `/api/v1/${url}`, {
    method,
    credentials: "same-origin",
    headers: isForm ? init.headers : { "content-type": "application/json", ...init.headers },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    ...init,
  });
  const type = res.headers.get("content-type") ?? "";
  const json = type.includes("application/json") ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const err = json?.error;
    if (res.status === 401 && typeof window !== "undefined" && !url.includes("/auth/")) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new ApiError(err?.message ?? `Request failed (${res.status})`, res.status, err?.code, err?.details);
  }
  return (json?.data ?? json) as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>("PUT", url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>("PATCH", url, body ?? {}),
  del: <T>(url: string, body?: unknown) => request<T>("DELETE", url, body),
  upload: <T>(url: string, form: FormData) => request<T>("POST", url, form),
};

export const fetcher = <T>(url: string) => api.get<T>(url);

export type StreamHandlers = {
  onMeta?: (meta: { model: string; provider: string; label?: string }) => void;
  onToken: (text: string) => void;
  onDone?: (info: { usage: { promptTokens: number; completionTokens: number }; costMicros: number; credits: number; model: string }) => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
};

/**
 * POSTs JSON and hands each Server-Sent Event to `onEvent`. Resolves when the stream ends.
 * Resolves with the response (for headers) and an error message when the request or stream failed
 * (aborts are not errors).
 */
export async function streamEvents(url: string, body: unknown, onEvent: (event: string, data: unknown) => void, signal?: AbortSignal): Promise<{ response: Response | null; error: string | null }> {
  let res: Response;
  try {
    res = await fetch(url.startsWith("/") ? url : `/api/v1/${url}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    return { response: null, error: (err as Error).name === "AbortError" ? null : "Network error. Check your connection and try again." };
  }
  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => null);
    return { response: res, error: json?.error?.message ?? `Request failed (${res.status})` };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const event = block.match(/^event: (.+)$/m)?.[1];
        const data = block.match(/^data: (.+)$/m)?.[1];
        if (event && data) onEvent(event, JSON.parse(data));
      }
    }
  } catch (err) {
    if ((err as Error).name !== "AbortError") return { response: res, error: "The stream was interrupted." };
  }
  return { response: res, error: null };
}

/** POSTs JSON and consumes the Server-Sent Events stream produced by AI endpoints. */
export async function streamAI(url: string, body: unknown, h: StreamHandlers): Promise<Response | null> {
  const { response, error } = await streamEvents(
    url,
    body,
    (event, data) => {
      const d = data as Record<string, unknown>;
      if (event === "token") h.onToken(d.text as string);
      else if (event === "meta") h.onMeta?.(d as Parameters<NonNullable<StreamHandlers["onMeta"]>>[0]);
      else if (event === "done") h.onDone?.(d as Parameters<NonNullable<StreamHandlers["onDone"]>>[0]);
      else if (event === "error") h.onError?.(d.message as string);
    },
    h.signal,
  );
  if (error) h.onError?.(error);
  return response;
}
