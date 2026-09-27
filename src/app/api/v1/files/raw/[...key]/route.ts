import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { storage, verifyLocal } from "@/server/storage";

// Serves locally stored files through short-lived HMAC-signed URLs.
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await params;
  const key = parts.map(decodeURIComponent).join("/");
  const e = Number(req.nextUrl.searchParams.get("e"));
  const s = req.nextUrl.searchParams.get("s") ?? "";
  if (!verifyLocal(key, e, s)) return NextResponse.json({ error: "Link expired or invalid" }, { status: 403 });
  const file = await db.file.findUnique({ where: { key } });
  if (!file || file.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await storage().get(key);
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": file.mimeType,
      "content-disposition": `${file.mimeType.startsWith("image/") ? "inline" : "attachment"}; filename="${file.filename.replace(/"/g, "")}"`,
      "x-content-type-options": "nosniff",
      "cache-control": file.visibility === "PUBLIC" ? "public, max-age=86400" : "private, no-store",
    },
  });
}
