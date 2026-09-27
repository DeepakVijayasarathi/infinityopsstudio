import type { Metadata } from "next";
import { requireContext } from "@/server/page-context";
import { can } from "@/server/tenant";
import { listMembers, listRoles } from "@/server/services/workspaces";
import { getPlan } from "@/config/plans";
import { TeamView } from "./team-view";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const ctx = await requireContext();
  const [{ members, invites }, roles] = await Promise.all([listMembers(ctx.workspace.id), listRoles(ctx.workspace.id)]);
  return (
    <TeamView
      members={JSON.parse(JSON.stringify(members))}
      invites={JSON.parse(JSON.stringify(invites))}
      roles={JSON.parse(JSON.stringify(roles))}
      me={{ id: ctx.user.id, rank: ctx.role.rank }}
      canManage={can(ctx, "members:manage")}
      seatLimit={getPlan(ctx.plan).limits.seats}
    />
  );
}
