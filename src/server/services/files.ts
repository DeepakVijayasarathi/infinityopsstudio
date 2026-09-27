import { randomUUID } from "node:crypto";
import { db } from "../db";
import { env } from "../env";
import { badRequest, notFound } from "../errors";
import { audit } from "../audit";
import { storage } from "../storage";
import type { WorkspaceContext } from "../tenant";
import { recordUsage } from "../billing/usage";

/** Allowed uploads, verified by magic bytes — the client-sent MIME type is never trusted. */
const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/gif", ext: "gif", test: (b) => b.subarray(0, 6).toString("ascii") === "GIF87a" || b.subarray(0, 6).toString("ascii") === "GIF89a" },
  { mime: "image/webp", ext: "webp", test: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
  { mime: "application/pdf", ext: "pdf", test: (b) => b.subarray(0, 5).toString("ascii") === "%PDF-" },
  { mime: "text/csv", ext: "csv", test: (b) => !b.subarray(0, 4096).includes(0) },
];

export function detectFileType(buf: Buffer, declared: string, filename: string) {
  const sig = SIGNATURES.find((s) => s.mime !== "text/csv" && s.test(buf));
  if (sig) return sig;
  if ((declared === "text/csv" || filename.toLowerCase().endsWith(".csv")) && SIGNATURES.at(-1)!.test(buf)) return SIGNATURES.at(-1)!;
  return null;
}

export async function uploadFile(ctx: WorkspaceContext, file: File, opts: { purpose?: string; visibility?: "PRIVATE" | "PUBLIC" } = {}) {
  if (file.size === 0) throw badRequest("The file is empty");
  if (file.size > env().MAX_UPLOAD_BYTES) throw badRequest(`Files must be under ${Math.round(env().MAX_UPLOAD_BYTES / 1024 / 1024)} MB`);
  const buf = Buffer.from(await file.arrayBuffer());
  const type = detectFileType(buf, file.type, file.name);
  if (!type) throw badRequest("Unsupported file type. Upload PNG, JPG, GIF, WebP, PDF or CSV files.");
  const key = `${ctx.workspace.id}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${type.ext}`;
  await storage().put(key, buf, type.mime);
  const filename = file.name.replace(/[^\w.\- ]/g, "_").slice(0, 120) || `upload.${type.ext}`;
  const row = await db.file.create({
    data: { workspaceId: ctx.workspace.id, uploadedById: ctx.user.id, key, filename, mimeType: type.mime, size: buf.length, visibility: opts.visibility ?? "PRIVATE", purpose: opts.purpose ?? "asset" },
  });
  await recordUsage({ workspaceId: ctx.workspace.id, metric: "STORAGE_BYTES", quantity: buf.length, refType: "File", refId: row.id });
  await audit({ action: "file.uploaded", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "File", entityId: row.id, metadata: { mime: type.mime, size: buf.length } });
  return { ...row, url: await fileUrl(row) };
}

export async function fileUrl(file: { id: string; key: string; visibility: "PRIVATE" | "PUBLIC" }) {
  // Public assets get a long-lived link; private files a short-lived signed URL.
  return storage().signedUrl(file.key, file.visibility === "PUBLIC" ? 60 * 60 * 24 * 365 : 60 * 15);
}

export async function listFiles(workspaceId: string) {
  const files = await db.file.findMany({ where: { workspaceId, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 100 });
  return Promise.all(files.map(async (f) => ({ ...f, url: await fileUrl(f) })));
}

export async function deleteFile(ctx: WorkspaceContext, id: string) {
  const f = await db.file.findFirst({ where: { id, workspaceId: ctx.workspace.id, deletedAt: null } });
  if (!f) throw notFound("File");
  await storage().delete(f.key);
  await db.file.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ action: "file.deleted", workspaceId: ctx.workspace.id, actorId: ctx.user.id, entityType: "File", entityId: id });
}
