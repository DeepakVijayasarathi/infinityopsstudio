import { route } from "@/server/api";
import { brandKitSchema } from "@/lib/schemas";
import { brandCompleteness, getBrandKit, updateBrandKit } from "@/server/services/brand";

export const GET = route({}, async ({ ctx }) => {
  const kit = await getBrandKit(ctx.workspace.id);
  return { ...kit, completeness: brandCompleteness(kit) };
});
export const PUT = route({ permission: "brand:manage", body: brandKitSchema }, async ({ ctx, body }) => {
  const kit = await updateBrandKit(ctx, body);
  return { ...kit, completeness: brandCompleteness(kit) };
});
