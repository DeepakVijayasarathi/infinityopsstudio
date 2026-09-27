import { db } from "../db";
import { notFound } from "../errors";
import { audit } from "../audit";
import { assertCan, type WorkspaceContext } from "../tenant";
import { AUTOMATION_TEMPLATES, CAMPAIGN_TEMPLATES, EMAIL_TEMPLATES } from "@/config/templates";
import { createCampaign } from "./campaigns";
import { upsertTemplate } from "./email";
import { createWorkflow } from "./automations";

export type TemplateKind = "campaign" | "email" | "automation";

export function listTemplates() {
  return {
    campaigns: CAMPAIGN_TEMPLATES,
    emails: EMAIL_TEMPLATES.map(({ body: _b, ...t }) => t),
    automations: AUTOMATION_TEMPLATES.map((t) => ({ key: t.key, name: t.name, description: t.description, trigger: t.trigger, steps: t.nodes.map((n) => n.label) })),
  };
}

/** Creates a draft from a template and returns where to open it. */
export async function applyTemplate(ctx: WorkspaceContext, kind: TemplateKind, key: string): Promise<{ id: string; href: string; name: string }> {
  if (kind === "campaign") {
    assertCan(ctx, "campaigns:write");
    const t = CAMPAIGN_TEMPLATES.find((x) => x.key === key);
    if (!t) throw notFound("Template");
    const start = new Date(Date.now() + 86_400_000);
    const c = await createCampaign(ctx, {
      name: t.name,
      description: t.description,
      objective: t.objective,
      channels: t.channels,
      kpis: t.kpis,
      startDate: start,
      endDate: new Date(start.getTime() + t.durationWeeks * 7 * 86_400_000),
    });
    await db.campaignTask.createMany({ data: t.tasks.map((title, i) => ({ workspaceId: ctx.workspace.id, campaignId: c.id, title, sortOrder: i + 1 })) });
    await audit({ action: "template.applied", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "Campaign", entityId: c.id, metadata: { template: key } });
    return { id: c.id, href: `/app/campaigns/${c.id}`, name: c.name };
  }
  if (kind === "email") {
    assertCan(ctx, "email:write");
    const t = EMAIL_TEMPLATES.find((x) => x.key === key);
    if (!t) throw notFound("Template");
    const saved = await upsertTemplate(ctx, null, { name: t.name, category: t.category, subject: t.subject, previewText: t.previewText, body: t.body });
    return { id: saved.id, href: "/app/email?tab=templates", name: saved.name };
  }
  assertCan(ctx, "automations:write");
  const t = AUTOMATION_TEMPLATES.find((x) => x.key === key);
  if (!t) throw notFound("Template");
  const wf = await createWorkflow(ctx, { name: t.name, description: t.description, trigger: t.trigger, triggerConfig: t.triggerConfig ?? null, nodes: t.nodes.map((n) => ({ type: n.type, label: n.label, config: n.config })) });
  return { id: wf.id, href: `/app/automations/${wf.id}`, name: wf.name };
}
