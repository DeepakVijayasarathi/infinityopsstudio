import { beforeEach, describe, expect, it } from "vitest";
import { resolveWorkspace, assertCan, can } from "@/server/tenant";
import { createCampaign, getCampaign, deleteCampaign } from "@/server/services/campaigns";
import { createLead, getLead } from "@/server/services/leads";
import { changeMemberRole } from "@/server/services/workspaces";
import { db } from "@/server/db";
import { addMember, createOwner, resetDb } from "../helpers/factory";

beforeEach(resetDb);

describe("workspace isolation", () => {
  it("never resolves a workspace the user is not a member of", async () => {
    const a = await createOwner("Alice");
    const b = await createOwner("Bob");
    expect(await resolveWorkspace(b.user, a.workspace.id)).toBeNull();
  });

  it("scopes records to their workspace", async () => {
    const a = await createOwner("Alice");
    const b = await createOwner("Bob");
    const campaign = await createCampaign(a, { name: "Spring launch" });
    const lead = await createLead(a, { firstName: "Priya", email: "priya@acme.com" });

    await expect(getCampaign(b.workspace.id, campaign.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getLead(b.workspace.id, lead.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteCampaign(b, campaign.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await getCampaign(a.workspace.id, campaign.id)).toMatchObject({ id: campaign.id });
  });
});

describe("role-based access", () => {
  it("gives viewers read-only permissions", async () => {
    const owner = await createOwner("Owner");
    const viewer = await addMember(owner.workspace.id, "viewer");
    expect(can(viewer, "campaigns:read")).toBe(true);
    expect(can(viewer, "campaigns:write")).toBe(false);
    expect(() => assertCan(viewer, "billing:manage")).toThrow();
  });

  it("prevents members from granting roles above their own", async () => {
    const owner = await createOwner("Owner");
    const admin = await addMember(owner.workspace.id, "admin", "Ada");
    const member = await addMember(owner.workspace.id, "member", "Max");
    const ownerRole = await db.role.findFirstOrThrow({ where: { key: "owner", workspaceId: null } });
    const memberRow = await db.workspaceMember.findFirstOrThrow({ where: { userId: member.user.id } });
    await expect(changeMemberRole(admin, memberRow.id, ownerRole.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
