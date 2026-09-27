import { db } from "../db";
import { audit } from "../audit";
import type { WorkspaceContext } from "../tenant";

export type BrandKitInput = Partial<{
  companyName: string;
  tagline: string | null;
  logoUrl: string | null;
  website: string | null;
  industry: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  voice: string | null;
  voiceAttributes: string[];
  targetAudience: string | null;
  productsServices: string | null;
  usps: string[];
  competitors: string[];
  guidelines: string | null;
  dos: string[];
  donts: string[];
}>;

export async function getBrandKit(workspaceId: string) {
  return db.brandKit.upsert({ where: { workspaceId }, create: { workspaceId, companyName: (await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } })).name }, update: {} });
}

export async function updateBrandKit(ctx: WorkspaceContext, input: BrandKitInput) {
  await getBrandKit(ctx.workspace.id);
  const kit = await db.brandKit.update({ where: { workspaceId: ctx.workspace.id }, data: input });
  await audit({ action: "brand.updated", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "BrandKit", entityId: kit.id });
  return kit;
}

/** 0–100 completeness score shown in the UI; higher = better AI context. */
export function brandCompleteness(kit: Awaited<ReturnType<typeof getBrandKit>>): number {
  const checks = [kit.companyName, kit.tagline, kit.voice, kit.targetAudience, kit.productsServices, kit.voiceAttributes.length, kit.usps.length, kit.competitors.length, kit.guidelines, kit.dos.length || kit.donts.length, kit.logoUrl, kit.website];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
