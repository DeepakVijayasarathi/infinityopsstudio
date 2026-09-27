import { db } from "../db";

/** Builds the Brand Kit context block injected into every AI worker/system prompt. */
export async function brandContext(workspaceId: string): Promise<string> {
  const kit = await db.brandKit.findUnique({ where: { workspaceId } });
  if (!kit) return "";
  const lines = [
    `Company: ${kit.companyName}`,
    kit.tagline && `Tagline: ${kit.tagline}`,
    kit.industry && `Industry: ${kit.industry}`,
    kit.website && `Website: ${kit.website}`,
    kit.voice && `Brand voice: ${kit.voice}`,
    kit.voiceAttributes.length > 0 && `Voice attributes: ${kit.voiceAttributes.join(", ")}`,
    kit.targetAudience && `Target audience: ${kit.targetAudience}`,
    kit.productsServices && `Products/services: ${kit.productsServices}`,
    kit.usps.length > 0 && `Unique selling points: ${kit.usps.join("; ")}`,
    kit.competitors.length > 0 && `Competitors: ${kit.competitors.join(", ")}`,
    kit.dos.length > 0 && `Always: ${kit.dos.join("; ")}`,
    kit.donts.length > 0 && `Never: ${kit.donts.join("; ")}`,
    kit.guidelines && `Guidelines: ${kit.guidelines}`,
  ].filter(Boolean);
  return `\n\n## Brand context (always follow)\n${lines.join("\n")}`;
}
