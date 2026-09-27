"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, KeyRound, Laptop, LogOut, ShieldCheck, ShieldOff, Smartphone, Trash2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/misc";
import { TimeAgo } from "@/components/ui/time";
import { useConfirm } from "@/components/ui/confirm";

type Profile = { id: string; name: string; email: string; avatarUrl: string | null; emailVerifiedAt: string | null; twoFactorEnabled: boolean; hasPassword: boolean; oauthAccounts: { provider: string }[] };
type Session = { id: string; ip: string | null; userAgent: string | null; createdAt: string; lastUsedAt: string; current: boolean; rememberMe: boolean };

function deviceLabel(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "Unknown OS";
  return `${browser} on ${os}`;
}

export function ProfileView({ profile, sessions }: { profile: Profile; sessions: Session[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [name, setName] = React.useState(profile.name);
  const [avatarUrl, setAvatarUrl] = React.useState(profile.avatarUrl ?? "");
  const [pw, setPw] = React.useState({ current: "", next: "" });
  const [busy, setBusy] = React.useState<string | null>(null);
  const [setup, setSetup] = React.useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = React.useState("");
  const [codes, setCodes] = React.useState<string[] | null>(null);
  const [disableOpen, setDisableOpen] = React.useState(false);
  const [disable, setDisable] = React.useState({ password: "", code: "" });
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deletePw, setDeletePw] = React.useState("");

  async function run(key: string, fn: () => Promise<unknown>, msg?: string) {
    setBusy(key);
    try {
      await fn();
      if (msg) toast.success(msg);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run("profile", () => api.patch("users/me", { name, avatarUrl: avatarUrl || null }), "Profile updated").then((ok) => ok && router.refresh());
            }}
            className="space-y-4"
          >
            <div className="flex items-center gap-4">
              <Avatar name={name} src={avatarUrl || null} className="size-14" />
              <div className="text-sm">
                <p className="font-medium">{profile.email}</p>
                <p className="text-xs text-muted-foreground">{profile.emailVerifiedAt ? "Email verified" : "Email not verified"}{profile.oauthAccounts.length > 0 && ` · Signed in with ${profile.oauthAccounts.map((o) => o.provider).join(", ")}`}</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" htmlFor="p-name">
                <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
              </Field>
              <Field label="Avatar URL" htmlFor="p-avatar">
                <Input id="p-avatar" type="url" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://" />
              </Field>
            </div>
            <Button type="submit" loading={busy === "profile"}>
              Save profile
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-4" /> Password
          </CardTitle>
          <CardDescription>Changing your password signs out all other sessions.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run("pw", () => api.patch("auth/password", { currentPassword: pw.current, newPassword: pw.next }), "Password changed").then((ok) => ok && setPw({ current: "", next: "" }));
            }}
            className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          >
            {profile.hasPassword && (
              <Field label="Current password" htmlFor="pw-cur">
                <Input id="pw-cur" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw((x) => ({ ...x, current: e.target.value }))} required />
              </Field>
            )}
            <Field label={profile.hasPassword ? "New password" : "Set a password"} htmlFor="pw-new" hint="8+ characters, a letter and a number">
              <Input id="pw-new" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw((x) => ({ ...x, next: e.target.value }))} required minLength={8} />
            </Field>
            <Button type="submit" loading={busy === "pw"}>
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" /> Two-factor authentication
            {profile.twoFactorEnabled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}
          </CardTitle>
          <CardDescription>Protect your account with a code from an authenticator app (Google Authenticator, 1Password, Authy).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {codes ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">Save your recovery codes</p>
              <p className="text-sm text-muted-foreground">Each code works once if you lose your device. They won&apos;t be shown again.</p>
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface p-4 font-mono text-sm sm:grid-cols-5">
                {codes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <a href={`data:text/plain;charset=utf-8,${encodeURIComponent(`Infinity Ops Studio recovery codes for ${profile.email}\n\n${codes.join("\n")}\n`)}`} download="infinity-ops-recovery-codes.txt">
                    <Download /> Download
                  </a>
                </Button>
                <Button
                  onClick={() => {
                    setCodes(null);
                    router.refresh();
                  }}
                >
                  I&apos;ve saved them
                </Button>
              </div>
            </div>
          ) : profile.twoFactorEnabled ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setDisableOpen(true)}>
                <ShieldOff /> Turn off
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  const c = window.prompt("Enter a current 6-digit code to generate new recovery codes");
                  if (!c) return;
                  await run("regen", async () => setCodes((await api.post<{ recoveryCodes: string[] }>("auth/2fa/recovery-codes", { code: c })).recoveryCodes), "New recovery codes generated");
                }}
              >
                Regenerate recovery codes
              </Button>
            </div>
          ) : setup ? (
            <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt="QR code for your authenticator app" className="size-44 rounded-lg border border-border bg-white p-2" />
              <form
                className="space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await run("enable", async () => {
                    const r = await api.post<{ recoveryCodes: string[] }>("auth/2fa/enable", { code });
                    setCodes(r.recoveryCodes);
                    setSetup(null);
                    setCode("");
                  }, "Two-factor authentication enabled");
                }}
              >
                <p className="text-sm">1. Scan the QR code with your authenticator app.</p>
                <p className="text-xs text-muted-foreground">
                  Can&apos;t scan? Enter this key: <code className="break-all rounded bg-muted px-1">{setup.secret}</code>
                </p>
                <Field label="2. Enter the 6-digit code" htmlFor="2fa-code">
                  <Input id="2fa-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className="max-w-40 tracking-widest" required />
                </Field>
                <Button type="submit" loading={busy === "enable"}>
                  Verify & enable
                </Button>
              </form>
            </div>
          ) : (
            <Button onClick={() => run("setup", async () => setSetup(await api.post<{ qr: string; secret: string }>("auth/2fa/setup")))} loading={busy === "setup"}>
              <Smartphone /> Set up two-factor authentication
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Laptop className="size-4" /> Active sessions
            </CardTitle>
            <CardDescription>Devices currently signed in to your account.</CardDescription>
          </div>
          {sessions.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => run("all", () => api.del("auth/sessions"), "Signed out of all other devices").then(() => router.refresh())} loading={busy === "all"}>
              <LogOut /> Sign out other devices
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3 text-sm">
                <Laptop className="size-5 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {deviceLabel(s.userAgent)} {s.current && <Badge tone="success">This device</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.ip ?? "Unknown IP"} · last active <TimeAgo date={s.lastUsedAt} />
                  </p>
                </div>
                {!s.current && (
                  <Button size="sm" variant="ghost" onClick={() => run(s.id, () => api.del(`auth/sessions/${s.id}`), "Session revoked").then(() => router.refresh())} loading={busy === s.id}>
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="border-danger/30">
        <CardHeader>
          <CardTitle className="text-danger">Delete account</CardTitle>
          <CardDescription>Permanently delete your account. Workspaces where you&apos;re the only member are deleted too.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 /> Delete my account
          </Button>
        </CardContent>
      </Card>

      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent size="sm">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await run("disable", () => api.post("auth/2fa/disable", disable), "Two-factor authentication turned off")) {
                setDisableOpen(false);
                router.refresh();
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>Turn off two-factor authentication?</DialogTitle>
              <DialogDescription>Your account will be protected by your password only.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {profile.hasPassword && (
                <Field label="Password" htmlFor="d-pw">
                  <Input id="d-pw" type="password" value={disable.password} onChange={(e) => setDisable((x) => ({ ...x, password: e.target.value }))} required />
                </Field>
              )}
              <Field label="Authentication code" htmlFor="d-code">
                <Input id="d-code" inputMode="numeric" value={disable.code} onChange={(e) => setDisable((x) => ({ ...x, code: e.target.value }))} required />
              </Field>
            </div>
            <DialogFooter>
              <Button type="submit" variant="destructive" loading={busy === "disable"}>
                Turn off
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          {profile.hasPassword && (
            <Field label="Confirm your password" htmlFor="del-pw">
              <Input id="del-pw" type="password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} />
            </Field>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={busy === "delete"}
              onClick={async () => {
                if (!(await confirm({ title: "Are you absolutely sure?", destructive: true, confirmLabel: "Delete forever" }))) return;
                if (await run("delete", () => api.del("users/me", { password: deletePw || undefined }), "Account deleted")) window.location.href = "/";
              }}
            >
              Delete account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
