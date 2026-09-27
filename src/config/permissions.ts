export const PERMISSIONS = [
  "workspace:manage",
  "workspace:delete",
  "members:manage",
  "billing:view",
  "billing:manage",
  "integrations:manage",
  "brand:manage",
  "workers:read",
  "workers:run",
  "workers:manage",
  "tasks:approve",
  "campaigns:read",
  "campaigns:write",
  "campaigns:approve",
  "content:read",
  "content:write",
  "content:approve",
  "social:read",
  "social:write",
  "social:publish",
  "seo:read",
  "seo:write",
  "email:read",
  "email:write",
  "email:send",
  "leads:read",
  "leads:write",
  "leads:delete",
  "automations:read",
  "automations:write",
  "analytics:read",
  "audit:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type RoleKey = "owner" | "admin" | "manager" | "member" | "viewer";

const READ: Permission[] = PERMISSIONS.filter((p) => p.endsWith(":read") && p !== "audit:read");
const WRITE: Permission[] = [
  "workers:run",
  "campaigns:write",
  "content:write",
  "social:write",
  "seo:write",
  "email:write",
  "leads:write",
  "automations:write",
];
const APPROVE: Permission[] = [
  "tasks:approve",
  "campaigns:approve",
  "content:approve",
  "social:publish",
  "email:send",
  "leads:delete",
  "workers:manage",
  "brand:manage",
];

export const SYSTEM_ROLES: Record<RoleKey, { name: string; description: string; rank: number; permissions: Permission[] }> = {
  owner: {
    name: "Owner",
    description: "Full control including billing and workspace deletion.",
    rank: 100,
    permissions: [...PERMISSIONS],
  },
  admin: {
    name: "Admin",
    description: "Manage members, integrations, billing and all modules.",
    rank: 80,
    permissions: PERMISSIONS.filter((p) => p !== "workspace:delete"),
  },
  manager: {
    name: "Manager",
    description: "Run campaigns, approve AI output and publish content.",
    rank: 60,
    permissions: [...READ, ...WRITE, ...APPROVE, "billing:view"],
  },
  member: {
    name: "Member",
    description: "Create and edit marketing work; approvals go to managers.",
    rank: 40,
    permissions: [...READ, ...WRITE],
  },
  viewer: {
    name: "Viewer",
    description: "Read-only access to dashboards and reports.",
    rank: 20,
    permissions: [...READ],
  },
};

export function hasPermission(granted: readonly string[], required: Permission): boolean {
  return granted.includes(required);
}
