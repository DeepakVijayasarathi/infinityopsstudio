import { route } from "@/server/api";
import { leadNoteSchema } from "@/lib/schemas";
import { addNote } from "@/server/services/leads";

export const POST = route({ permission: "leads:write", body: leadNoteSchema }, async ({ ctx, params, body }) => addNote(ctx, params.id!, body.content, body.type));
