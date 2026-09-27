"use client";

import { DateText } from "@/components/ui/time";
import { AdminTable } from "../admin-table";

type A = { id: string; action: string; entityType: string | null; entityId: string | null; ip: string | null; createdAt: string; actor: { email: string; name: string } | null; workspace: { name: string } | null; metadata: unknown };

export function AuditTable() {
  return (
    <AdminTable<A>
      endpoint="/api/v1/admin/audit"
      placeholder="Search action or actor email"
      rowKey={(a) => a.id}
      columns={[
        { key: "time", header: "Time", cell: (a) => <DateText date={a.createdAt} withTime className="whitespace-nowrap text-xs" /> },
        { key: "action", header: "Action", cell: (a) => <code className="text-xs">{a.action}</code> },
        { key: "actor", header: "Actor", cell: (a) => <span className="text-sm">{a.actor?.email ?? "System"}</span> },
        { key: "ws", header: "Workspace", cell: (a) => <span className="text-sm text-muted-foreground">{a.workspace?.name ?? "—"}</span>, hideOnMobile: true },
        { key: "entity", header: "Entity", cell: (a) => <span className="text-xs text-muted-foreground">{a.entityType ? `${a.entityType} ${a.entityId?.slice(0, 8) ?? ""}` : "—"}</span>, hideOnMobile: true },
        { key: "ip", header: "IP", cell: (a) => <span className="text-xs text-muted-foreground">{a.ip ?? "—"}</span>, hideOnMobile: true },
      ]}
    />
  );
}
