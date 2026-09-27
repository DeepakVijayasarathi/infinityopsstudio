"use client";

import * as React from "react";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { api } from "@/lib/api-client";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { DateText, TimeAgo } from "@/components/ui/time";
import { useConfirm } from "@/components/ui/confirm";
import { AdminTable } from "../admin-table";

type U = { id: string; name: string; email: string; platformRole: string; status: string; emailVerifiedAt: string | null; twoFactorEnabled: boolean; lastLoginAt: string | null; createdAt: string; _count: { memberships: number } };

export function UsersTable() {
  const confirm = useConfirm();
  const [key, setKey] = React.useState(0);
  async function patch(u: U, body: Record<string, string>, msg: string, confirmText?: string) {
    if (confirmText && !(await confirm({ title: confirmText, destructive: body.status === "SUSPENDED", confirmLabel: "Confirm" }))) return;
    try {
      await api.patch(`admin/users/${u.id}`, body);
      toast.success(msg);
      setKey((k) => k + 1);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <AdminTable<U>
      endpoint="/api/v1/admin/users"
      refreshKey={key}
      placeholder="Search name or email"
      rowKey={(u) => u.id}
      columns={[
        {
          key: "user",
          header: "User",
          cell: (u) => (
            <div className="min-w-0">
              <p className="font-medium">{u.name}</p>
              <p className="text-xs text-muted-foreground">{u.email}</p>
            </div>
          ),
        },
        { key: "role", header: "Role", cell: (u) => (u.platformRole === "SUPER_ADMIN" ? <Badge tone="danger">Super admin</Badge> : <Badge>User</Badge>) },
        { key: "status", header: "Status", cell: (u) => <StatusBadge status={u.status} /> },
        { key: "security", header: "Security", cell: (u) => <span className="text-xs text-muted-foreground">{u.emailVerifiedAt ? "Verified" : "Unverified"} · {u.twoFactorEnabled ? "2FA" : "No 2FA"}</span>, hideOnMobile: true },
        { key: "ws", header: "Workspaces", cell: (u) => u._count.memberships, className: "text-right" },
        { key: "login", header: "Last login", cell: (u) => (u.lastLoginAt ? <TimeAgo date={u.lastLoginAt} className="text-xs text-muted-foreground" /> : <span className="text-xs text-muted-foreground">Never</span>), hideOnMobile: true },
        { key: "created", header: "Joined", cell: (u) => <DateText date={u.createdAt} className="text-xs text-muted-foreground" />, hideOnMobile: true },
        {
          key: "actions",
          header: "",
          cell: (u) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${u.email}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {u.status === "ACTIVE" ? (
                  <DropdownMenuItem destructive onSelect={() => patch(u, { status: "SUSPENDED" }, "User suspended", `Suspend ${u.email}? All their sessions end immediately.`)}>Suspend user</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => patch(u, { status: "ACTIVE" }, "User reactivated")}>Reactivate user</DropdownMenuItem>
                )}
                {u.platformRole === "SUPER_ADMIN" ? (
                  <DropdownMenuItem onSelect={() => patch(u, { platformRole: "USER" }, "Admin access removed", `Remove admin access from ${u.email}?`)}>Remove admin access</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => patch(u, { platformRole: "SUPER_ADMIN" }, "Admin access granted", `Grant full platform admin access to ${u.email}?`)}>Make super admin</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ),
        },
      ]}
    />
  );
}
