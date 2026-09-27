"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, LogOut, MailPlus, Trash2, UserMinus } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Avatar } from "@/components/ui/misc";
import { DateText, TimeAgo } from "@/components/ui/time";
import { useConfirm } from "@/components/ui/confirm";

type Role = { id: string; key: string; name: string; description: string | null; rank: number; permissions: string[] };
type Member = { id: string; user: { id: string; name: string; email: string; avatarUrl: string | null; lastLoginAt: string | null }; role: { id: string; key: string; name: string; rank: number }; createdAt: string };
type Invite = { id: string; email: string; role: { key: string; name: string }; expiresAt: string; createdAt: string };

export function TeamView({ members, invites, roles, me, canManage, seatLimit }: { members: Member[]; invites: Invite[]; roles: Role[]; me: { id: string; rank: number }; canManage: boolean; seatLimit: number }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [roleId, setRoleId] = React.useState(roles.find((r) => r.key === "member")?.id ?? roles[0]?.id ?? "");
  const [busy, setBusy] = React.useState(false);
  const [link, setLink] = React.useState<string | null>(null);
  const assignable = roles.filter((r) => r.rank <= me.rank);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post<{ inviteUrl: string }>("workspaces/members", { email, roleId });
      toast.success(`Invitation sent to ${email}`);
      setLink(r.inviteUrl);
      setEmail("");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(m: Member, newRoleId: string) {
    try {
      await api.patch(`workspaces/members/${m.id}`, { roleId: newRoleId });
      toast.success(`${m.user.name}'s role updated`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(m: Member) {
    const self = m.user.id === me.id;
    if (!(await confirm({ title: self ? "Leave this workspace?" : `Remove ${m.user.name}?`, description: self ? "You'll lose access until someone invites you again." : "They'll lose access immediately.", destructive: true, confirmLabel: self ? "Leave" : "Remove" }))) return;
    try {
      await api.del(`workspaces/members/${m.id}`);
      toast.success(self ? "You left the workspace" : "Member removed");
      if (self) window.location.href = "/app";
      else router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              {members.length + invites.length} of {seatLimit < 0 ? "unlimited" : seatLimit} seats used
            </CardDescription>
          </div>
          {canManage && (
            <Button onClick={() => setOpen(true)}>
              <MailPlus /> Invite teammate
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar name={m.user.name} src={m.user.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {m.user.name} {m.user.id === me.id && <span className="text-xs text-muted-foreground">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.user.email} · {m.user.lastLoginAt ? <>active <TimeAgo date={m.user.lastLoginAt} /></> : "never signed in"}
                  </p>
                </div>
                {canManage && m.user.id !== me.id && m.role.rank <= me.rank ? (
                  <Select value={m.role.id} onChange={(e) => changeRole(m, e.target.value)} aria-label={`Role for ${m.user.name}`} className="w-36">
                    {assignable.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Badge tone={m.role.key === "owner" ? "brand" : "neutral"}>{m.role.name}</Badge>
                )}
                {(m.user.id === me.id || (canManage && m.role.rank < me.rank)) && (
                  <Button size="icon-sm" variant="ghost" aria-label={m.user.id === me.id ? "Leave workspace" : `Remove ${m.user.name}`} onClick={() => remove(m)}>
                    {m.user.id === me.id ? <LogOut /> : <UserMinus />}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{i.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.role.name} · expires <DateText date={i.expiresAt} />
                    </p>
                  </div>
                  {canManage && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Revoke invitation for ${i.email}`}
                      onClick={async () => {
                        try {
                          await api.del(`workspaces/invites/${i.id}`);
                          toast.success("Invitation revoked");
                          router.refresh();
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Roles & permissions</CardTitle>
          <CardDescription>Built-in roles. Nobody can grant a role higher than their own.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {roles.map((r) => (
            <div key={r.id} className="rounded-lg border border-border p-3">
              <p className="font-medium">{r.name}</p>
              <p className="text-xs text-muted-foreground">{r.description}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">{r.permissions.length} permissions</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setLink(null);
        }}
      >
        <DialogContent size="sm">
          {link ? (
            <>
              <DialogHeader>
                <DialogTitle>Invitation sent</DialogTitle>
                <DialogDescription>We emailed the invitation. You can also share this link directly — it expires in 7 days.</DialogDescription>
              </DialogHeader>
              <div className="flex gap-2">
                <Input readOnly value={link} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} />
                <Button variant="outline" size="icon" aria-label="Copy link" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Copied"))}>
                  <Copy />
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => setLink(null)}>Invite another</Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={invite}>
              <DialogHeader>
                <DialogTitle>Invite a teammate</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Field label="Email" htmlFor="inv-email" required>
                  <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                </Field>
                <Field label="Role" htmlFor="inv-role" hint={assignable.find((r) => r.id === roleId)?.description ?? undefined}>
                  <Select id="inv-role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                    {assignable.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <DialogFooter>
                <Button type="submit" loading={busy}>
                  Send invitation
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
