"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, Check, Loader2, RotateCcw, Sparkles, Wand2, X } from "lucide-react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/misc";
import { Markdown } from "@/components/ui/markdown";
import { AutopilotDialog } from "./autopilot-dialog";

type Action = { type: string; [k: string]: unknown };
type Proposed = { id: string; title: string; description: string; action: Action; state?: "running" | "done" | "dismissed" | "error"; result?: { message: string; href?: string } };
type Msg = { id: string; role: "user" | "assistant"; content: string; actions?: Proposed[]; suggestions?: string[] };

const STORAGE_KEY = "ios:copilot";
const STARTERS = ["How are we doing this month?", "Which leads should I call today?", "What needs my approval?", "Build a campaign to get 100 demo bookings in 4 weeks", "Draft 3 LinkedIn posts about our new feature"];

let counter = 0;
const uid = () => `m${Date.now().toString(36)}${(counter++).toString(36)}`;

const CopilotContext = React.createContext<{ open: (prompt?: string) => void }>({ open: () => undefined });
export const useCopilot = () => React.useContext(CopilotContext);

/** Workspace AI assistant: floating button, ⌘J / Ctrl+J, and a side panel with approvable actions. */
export function CopilotProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isOpen, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [thinking, setThinking] = React.useState(false);
  const [autopilotGoal, setAutopilotGoal] = React.useState<string | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // The conversation survives page navigation within this tab.
  React.useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved));
    } catch {
      /* storage unavailable */
    }
  }, []);
  React.useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      /* storage unavailable */
    }
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const send = React.useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || thinking) return;
      setInput("");
      const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
      setMessages((ms) => [...ms, { id: uid(), role: "user", content: message }]);
      setThinking(true);
      try {
        const r = await api.post<{ reply: string; actions: Proposed[]; suggestions?: string[] }>("copilot", { message, history });
        setMessages((ms) => [...ms, { id: uid(), role: "assistant", content: r.reply, actions: r.actions, suggestions: r.suggestions }]);
      } catch (e) {
        setMessages((ms) => [...ms, { id: uid(), role: "assistant", content: `⚠️ ${(e as Error).message}` }]);
      } finally {
        setThinking(false);
        inputRef.current?.focus();
      }
    },
    [messages, thinking],
  );

  const open = React.useCallback(
    (prompt?: string) => {
      setOpen(true);
      if (prompt) void send(prompt);
    },
    [send],
  );

  const updateAction = (msgId: string, actionId: string, patch: Partial<Proposed>) =>
    setMessages((ms) => ms.map((m) => (m.id !== msgId ? m : { ...m, actions: m.actions?.map((a) => (a.id === actionId ? { ...a, ...patch } : a)) })));

  async function approve(msg: Msg, p: Proposed) {
    if (p.action.type === "navigate") {
      setOpen(false);
      router.push(p.action.href as string);
      return;
    }
    if (p.action.type === "launch_ai_campaign") {
      // Live, step-by-step progress lives in the autopilot dialog.
      setAutopilotGoal(p.action.goal as string);
      updateAction(msg.id, p.id, { state: "done", result: { message: "Opened the AI campaign builder." } });
      return;
    }
    updateAction(msg.id, p.id, { state: "running" });
    try {
      const r = await api.post<{ message: string; href?: string }>("copilot/execute", { action: p.action });
      updateAction(msg.id, p.id, { state: "done", result: r });
      router.refresh();
    } catch (e) {
      updateAction(msg.id, p.id, { state: "error", result: { message: (e as Error).message } });
    }
  }

  // In-app links inside answers navigate without a full reload and close the panel.
  const onAnswerClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href");
    if (href?.startsWith("/")) {
      e.preventDefault();
      setOpen(false);
      router.push(href);
    }
  };

  return (
    <CopilotContext.Provider value={{ open }}>
      {children}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/30 transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:bottom-6 lg:right-6"
        aria-label="Open Copilot"
      >
        <Sparkles className="size-4" aria-hidden /> <span className="hidden sm:inline">Ask Copilot</span>
      </button>

      <Sheet open={isOpen} onOpenChange={setOpen} side="right" title="Copilot" className="w-full max-w-full sm:w-[440px] sm:max-w-[440px]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold">Copilot</p>
              <p className="text-[11px] text-muted-foreground">Answers from your data · you approve every action</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <Button size="icon-sm" variant="ghost" aria-label="New conversation" onClick={() => setMessages([])}>
                <RotateCcw />
              </Button>
            )}
            <Button size="icon-sm" variant="ghost" aria-label="Close Copilot" onClick={() => setOpen(false)}>
              <X />
            </Button>
          </div>
        </div>

        <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin" aria-live="polite">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Ask about your marketing, or tell me what to do. I&apos;ll propose actions for you to approve.</p>
              <div className="flex flex-col gap-2">
                {STARTERS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="rounded-lg border border-border px-3 py-2 text-left text-sm transition hover:border-primary hover:bg-primary/5">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="ml-8 rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                {m.content}
              </div>
            ) : (
              <div key={m.id} className="space-y-2">
                <div onClick={onAnswerClick} className="rounded-2xl rounded-bl-sm bg-muted/60 px-3.5 py-2.5 text-sm [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:whitespace-nowrap [&_table]:text-xs">
                  <Markdown content={m.content} />
                </div>
                {m.actions?.map((p) => (
                  <div key={p.id} className={cn("rounded-xl border p-3", p.state === "done" ? "border-success/40 bg-success/5" : p.state === "error" ? "border-danger/40" : "border-primary/30 bg-primary/5")}>
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      {p.action.type === "launch_ai_campaign" && <Wand2 className="size-4 text-primary" aria-hidden />}
                      {p.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>
                    {p.result && (
                      <p className={cn("mt-2 text-xs", p.state === "error" ? "text-danger" : "text-foreground")}>
                        {p.state === "done" && <Check className="mr-1 inline size-3.5 text-success" aria-hidden />}
                        {p.result.message}{" "}
                        {p.result.href && (
                          <Link href={p.result.href} onClick={() => setOpen(false)} className="font-medium text-primary hover:underline">
                            Open
                          </Link>
                        )}
                      </p>
                    )}
                    {!p.state && (
                      <div className="mt-2.5 flex gap-2">
                        <Button size="sm" onClick={() => approve(m, p)}>
                          {p.action.type === "navigate" ? "Open" : "Approve"}
                        </Button>
                        {p.action.type !== "navigate" && (
                          <Button size="sm" variant="ghost" onClick={() => updateAction(m.id, p.id, { state: "dismissed", result: { message: "Dismissed." } })}>
                            Dismiss
                          </Button>
                        )}
                      </div>
                    )}
                    {p.state === "running" && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Working on it…
                      </p>
                    )}
                    {p.state === "error" && (
                      <Button size="sm" variant="outline" className="mt-2" onClick={() => approve(m, p)}>
                        Try again
                      </Button>
                    )}
                  </div>
                ))}
                {m.suggestions && m.suggestions.length > 0 && m === messages[messages.length - 1] && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.suggestions.map((s) => (
                      <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ),
          )}
          {thinking && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Thinking…
            </p>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="border-t border-border p-3"
        >
          <div className="flex items-end gap-2 rounded-xl border border-input bg-background p-1.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              placeholder="Ask or tell Copilot what to do…"
              aria-label="Message Copilot"
              className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
            />
            <Button type="submit" size="icon-sm" disabled={!input.trim() || thinking} aria-label="Send">
              <ArrowUp />
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            <Kbd>⌘</Kbd> <Kbd>J</Kbd> to open anywhere · Enter to send
          </p>
        </form>
      </Sheet>

      <AutopilotDialog open={autopilotGoal !== null} onOpenChange={(o) => !o && setAutopilotGoal(null)} initialGoal={autopilotGoal ?? ""} />
    </CopilotContext.Provider>
  );
}
