import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/v1/campaigns/route";
import { GET as health } from "@/app/api/health/route";
import { signup } from "@/server/services/auth";
import { db } from "@/server/db";
import { clearCookies } from "../helpers/next-headers";
import { createOwner, resetDb } from "../helpers/factory";

const url = "http://localhost:3000/api/v1/campaigns";
const noParams = { params: Promise.resolve({}) };
const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new NextRequest(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }), noParams as never);

beforeEach(resetDb);

describe("API route wrapper", () => {
  it("rejects unauthenticated requests with a consistent error shape", async () => {
    const res = await GET(new NextRequest(url), noParams as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it("validates bodies and returns field errors", async () => {
    await signup({ name: "Api User", email: "api@example.com", password: "Password123" }, {});
    await db.user.update({ where: { email: "api@example.com" }, data: { emailVerifiedAt: new Date() } });
    const res = await post({ name: "" });
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("creates and lists campaigns in the caller's workspace only", async () => {
    await signup({ name: "Api User", email: "api@example.com", password: "Password123" }, {});
    await db.user.update({ where: { email: "api@example.com" }, data: { emailVerifiedAt: new Date() } });
    const created = await post({ name: "API launch", objective: "LEADS" });
    expect(created.status).toBe(200);

    const { data: list } = await (await GET(new NextRequest(`${url}?page=1&pageSize=5`), noParams as never)).json();
    expect(list.items.map((c: { name: string }) => c.name)).toEqual(["API launch"]);
    expect(list.meta.total).toBe(1);
  });

  it("refuses an x-workspace-id the caller does not belong to", async () => {
    const other = await createOwner("Other");
    await signup({ name: "Api User", email: "api@example.com", password: "Password123" }, {});
    const res = await GET(new NextRequest(url, { headers: { "x-workspace-id": other.workspace.id } }), noParams as never);
    expect(res.status).toBe(403);
    clearCookies();
  });
});

describe("health", () => {
  it("reports ok", async () => {
    const res = await health();
    expect(res.status).toBe(200);
  });
});
