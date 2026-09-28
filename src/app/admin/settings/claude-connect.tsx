"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Copy, Loader2, PlugZap, Unplug, XCircle } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm";
import { TimeAgo } from "@/components/ui/time";

export type ClaudeStatus = {
  cli: { installed: boolean; version: string | null };
  connected: boolean;
  connectedAt: string | null;
  lastTest: { ok: boolean; message: string; at: string } | null;
  viaEnvironment: boolean;
  activeModel: { id: string; label: string; provider: string };
};

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{n}</span>
      <span className="min-w-0 pt-0.5">{children}</span>
    </li>
  );
}

export function ClaudeConnect({ initial }: { initial: ClaudeStatus }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [s, setS] = React.useState(initial);
  const [token, setToken] = React.useState("");
  const [busy, setBusy] = React.useState<null | "connect" | "test" | "disconnect">(null);

  async function run(kind: NonNullable<typeof busy>, fn: () => Promise<ClaudeStatus>, ok?: (r: ClaudeStatus) => string) {
    setBusy(kind);
    try {
      const r = await fn();
      setS(r);
      if (ok) toast.success(ok(r));
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const connect = (e: React.FormEvent) => {
    e.preventDefault();
    void run("connect", () => api.post<ClaudeStatus>("admin/claude", { token }), () => "Claude is connected — all AI now runs on your plan");
    setToken("");
  };

  const ok = s.connected ? s.lastTest?.ok !== false : s.viaEnvironment;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            Claude Pro / Max plan
            {s.connected ? <Badge tone={ok ? "success" : "danger"}>{ok ? "Connected" : "Needs attention"}</Badge> : s.viaEnvironment ? <Badge tone="info">Set up on the server</Badge> : <Badge>Not connected</Badge>}
          </CardTitle>
          <CardDescription>Run every AI feature on your Claude subscription through the Claude Code CLI inside the container — no API key or per-token billing.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-muted/60 p-3">
            <dt className="text-xs text-muted-foreground">Claude Code in container</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 font-medium">
              {s.cli.installed ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-danger" />}
              {s.cli.installed ? `Installed${s.cli.version ? ` (v${s.cli.version})` : ""}` : "Not installed"}
            </dd>
          </div>
          <div className="rounded-lg bg-muted/60 p-3">
            <dt className="text-xs text-muted-foreground">AI in use now</dt>
            <dd className="mt-0.5 truncate font-medium" title={s.activeModel.label}>
              {s.activeModel.provider === "local" ? "Built-in demo AI" : s.activeModel.label}
            </dd>
          </div>
          <div className="rounded-lg bg-muted/60 p-3">
            <dt className="text-xs text-muted-foreground">Last check</dt>
            <dd className="mt-0.5 font-medium">{s.lastTest ? <TimeAgo date={s.lastTest.at} /> : "—"}</dd>
          </div>
        </dl>

        {s.lastTest && <p className={s.lastTest.ok ? "text-success" : "text-danger"}>{s.lastTest.message}</p>}

        {!s.cli.installed && (
          <p className="rounded-lg border border-danger/30 bg-danger/5 p-3">
            The Claude Code CLI isn&apos;t in this container. Redeploy with the default image (<code>bash deploy.sh</code>) — it installs Claude Code unless built with <code>INSTALL_CLAUDE_CODE=0</code>.
          </p>
        )}

        {s.connected ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => run("test", () => api.post<ClaudeStatus>("admin/claude/test"), (r) => (r.lastTest?.ok ? "Claude is working" : "Test failed — see the message"))} disabled={!!busy}>
              {busy === "test" ? <Loader2 className="animate-spin" /> : <PlugZap />} Test connection
            </Button>
            <Button
              variant="ghost"
              className="text-danger"
              disabled={!!busy}
              onClick={async () => {
                if (await confirm({ title: "Disconnect Claude?", description: "AI features switch back to the built-in demo AI until you connect again.", confirmLabel: "Disconnect", destructive: true }))
                  void run("disconnect", () => api.del<ClaudeStatus>("admin/claude"), () => "Claude disconnected");
              }}
            >
              <Unplug /> Disconnect
            </Button>
            {s.connectedAt && (
              <span className="self-center text-xs text-muted-foreground">
                Connected <TimeAgo date={s.connectedAt} />
              </span>
            )}
          </div>
        ) : (
          <>
            <ol className="space-y-3">
              <Step n={1}>
                On any computer (your laptop is fine), install Claude Code: <code className="rounded bg-muted px-1.5 py-0.5">npm install -g @anthropic-ai/claude-code</code>
              </Step>
              <Step n={2}>
                Run{" "}
                <button type="button" className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono hover:bg-muted/70" onClick={() => navigator.clipboard.writeText("claude setup-token").then(() => toast.success("Copied"))}>
                  claude setup-token <Copy className="size-3" />
                </button>{" "}
                and sign in with the Claude account that has your Pro or Max plan.
              </Step>
              <Step n={3}>Copy the token it prints (starts with <code>sk-ant-</code>) and paste it below. It&apos;s tested, then stored encrypted — it&apos;s never shown again.</Step>
            </ol>
            <form onSubmit={connect} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Field label="Claude token" htmlFor="claude-token" className="flex-1">
                <Input id="claude-token" type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-oat01-…" value={token} onChange={(e) => setToken(e.target.value)} disabled={!!busy || !s.cli.installed} />
              </Field>
              <Button type="submit" disabled={!!busy || token.trim().length < 20 || !s.cli.installed}>
                {busy === "connect" ? <Loader2 className="animate-spin" /> : <PlugZap />} {busy === "connect" ? "Testing…" : "Connect & test"}
              </Button>
            </form>
            {s.viaEnvironment && <p className="text-xs text-muted-foreground">Claude is also set up through the server environment (manage.sh). A token connected here takes priority.</p>}
          </>
        )}
        <p className="text-xs text-muted-foreground">Requests count toward your Claude plan&apos;s usage limits. The CLI runs with every tool disabled — it only writes text.</p>
      </CardContent>
    </Card>
  );
}
