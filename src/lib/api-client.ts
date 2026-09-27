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

/** POSTs JSON and consumes the Server-Sent Events stream produced by AI endpoints. */
export async function streamAI(url: string, body: unknown, h: StreamHandlers): Promise<Response | null> {
  let res: Response;
  try {
    res = await fetch(url.startsWith("/") ? url : `/api/v1/${url}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: h.signal,
    });
  } catch (err) {
    if ((err as Error).name !== "AbortError") h.onError?.("Network error. Check your connection and try again.");
    return null;
  }
  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => null);
    h.onError?.(json?.error?.message ?? `Request failed (${res.status})`);
    return null;
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
        if (!event || !data) continue;
        const parsed = JSON.parse(data);
        if (event === "token") h.onToken(parsed.text);
        else if (event === "meta") h.onMeta?.(parsed);
        else if (event === "done") h.onDone?.(parsed);
        else if (event === "error") h.onError?.(parsed.message);
      }
    }
  } catch (err) {
    if ((err as Error).name !== "AbortError") h.onError?.("The stream was interrupted.");
  }
  return res;
}
