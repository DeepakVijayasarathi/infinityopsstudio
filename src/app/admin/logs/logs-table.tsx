"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { DateText } from "@/components/ui/time";
import { AdminTable } from "../admin-table";

type L = { id: string; level: string; source: string; message: string; createdAt: string; context: unknown };

export function LogsTable() {
  const [level, setLevel] = React.useState("");
  return (
    <>
      <Select value={level} onChange={(e) => setLevel(e.target.value)} className="mb-3 w-40" aria-label="Level">
        <option value="">All levels</option>
        <option value="error">Errors</option>
        <option value="warn">Warnings</option>
        <option value="info">Info</option>
      </Select>
      <AdminTable<L>
        endpoint="/api/v1/admin/logs"
        extraParams={level ? `&level=${level}` : ""}
        placeholder="Search messages"
        rowKey={(l) => l.id}
        columns={[
          { key: "time", header: "Time", cell: (l) => <DateText date={l.createdAt} withTime className="whitespace-nowrap text-xs" /> },
          { key: "level", header: "Level", cell: (l) => <Badge tone={l.level === "error" ? "danger" : l.level === "warn" ? "warning" : "info"}>{l.level}</Badge> },
          { key: "source", header: "Source", cell: (l) => <code className="text-xs">{l.source}</code> },
          { key: "message", header: "Message", cell: (l) => <span className="line-clamp-2 break-all text-sm">{l.message}</span> },
        ]}
      />
    </>
  );
}
