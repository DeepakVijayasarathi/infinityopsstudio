import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { changeCampaignStatus, createCampaign, duplicateCampaign, listCampaigns, updateCampaign } from "@/server/services/campaigns";
import { createContent, restoreVersion, updateContent } from "@/server/services/content";
import { createOwner, resetDb } from "../helpers/factory";

beforeEach(resetDb);

describe("campaigns", () => {
  it("creates, lists and duplicates campaigns", async () => {
    const ctx = await createOwner();
    const c = await createCampaign(ctx, { name: "Q4 launch", objective: "LEADS", budgetCents: 500_000, channels: ["linkedin", "email"] });
    expect(c.status).toBe("DRAFT");
    const copy = await duplicateCampaign(ctx, c.id);
    expect(copy.name).toContain("Q4 launch");
    const list = await listCampaigns(ctx.workspace.id, { page: 1, pageSize: 10, order: "desc" });
    expect(list.meta.total).toBe(2);
  });

  it("validates dates and status transitions", async () => {
    const ctx = await createOwner();
    await expect(createCampaign(ctx, { name: "Bad dates", startDate: new Date("2026-05-02"), endDate: new Date("2026-05-01") })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const c = await createCampaign(ctx, { name: "Webinar" });
    await expect(changeCampaignStatus(ctx, c.id, "COMPLETED")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const active = await changeCampaignStatus(ctx, c.id, "ACTIVE");
    expect(active.startDate).not.toBeNull();
    const done = await updateCampaign(ctx, c.id, { status: "COMPLETED" });
    expect(done.status).toBe("COMPLETED");
    expect(await db.auditLog.count({ where: { entityId: c.id, action: "campaign.status_changed" } })).toBe(2);
  });

  it("enforces plan limits", async () => {
    const ctx = await createOwner(); // FREE plan
    const limit = (await import("@/config/plans")).getPlan("FREE").limits.campaigns;
    for (let i = 0; i < limit; i++) await createCampaign(ctx, { name: `Campaign ${i}` });
    await expect(createCampaign(ctx, { name: "One too many" })).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });
  });
});

describe("content versions", () => {
  it("snapshots saves and restores earlier versions", async () => {
    const ctx = await createOwner();
    const doc = await createContent(ctx, { title: "Fuel savings", type: "BLOG_POST", body: "First draft about fuel." });
    await updateContent(ctx, doc.id, { body: "Second draft with numbers." });
    const versions = await db.contentVersion.findMany({ where: { contentId: doc.id }, orderBy: { version: "asc" } });
    expect(versions.map((v) => v.version)).toEqual([1, 2]);

    const restored = await restoreVersion(ctx, doc.id, versions[0]!.id);
    expect(restored.body).toBe("First draft about fuel.");
    expect(await db.contentVersion.count({ where: { contentId: doc.id } })).toBe(3);
    expect(restored.wordCount).toBe(4);
  });
});
