import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { AppError, forbidden, unauthenticated } from "./errors";
import { logger } from "./logger";
import { systemLog } from "./system-log";
import { enforceRateLimit } from "./rate-limit";
import { SESSION_COOKIE } from "./auth/cookies";
import { needsRotation, rotateSession, validateSessionToken, type SessionUser, type ValidSession } from "./auth/session";
import { assertCan, resolveWorkspace, type WorkspaceContext } from "./tenant";
import type { Permission } from "@/config/permissions";

type AuthMode = "public" | "user" | "workspace" | "admin";

type RouteOptions<B, Q> = {
  auth?: AuthMode;
  permission?: Permission;
  body?: ZodType<B>;
  query?: ZodType<Q>;
  /** Requests per window, keyed by user (or IP when anonymous). */
  rateLimit?: { limit: number; windowSec: number; key?: string };
  /** Allow a session that is still waiting for its second factor. */
  allowTwoFactorPending?: boolean;
};

type Meta = { ip: string; userAgent: string | null };

type HandlerArgs<B, Q, A extends AuthMode> = {
  req: NextRequest;
  params: Record<string, string>;
  body: B;
  query: Q;
  meta: Meta;
  session: A extends "public" ? ValidSession | null : ValidSession;
  user: A extends "public" ? SessionUser | null : SessionUser;
  ctx: A extends "workspace" ? WorkspaceContext : WorkspaceContext | null;
};

type RouteContext = { params: Promise<Record<string, string | string[]>> };

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    const res = NextResponse.json({ error: { code: err.code, message: err.message, details: err.details ?? undefined } }, { status: err.status });
    const retry = (err.details as { retryAfter?: number } | undefined)?.retryAfter;
    if (retry) res.headers.set("Retry-After", String(retry));
    return res;
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: err.issues[0]?.message ?? "Invalid request",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 422 },
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return NextResponse.json({ error: { code: "CONFLICT", message: "A record with these details already exists" } }, { status: 409 });
    if (err.code === "P2025") return NextResponse.json({ error: { code: "NOT_FOUND", message: "Resource not found" } }, { status: 404 });
  }
  if (err instanceof SyntaxError) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Malformed JSON body" } }, { status: 400 });
  }
  logger.error("Unhandled API error", { err });
  void systemLog("error", "api", err instanceof Error ? err.message : "Unhandled API error", { stack: err instanceof Error ? err.stack?.slice(0, 2000) : undefined });
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } }, { status: 500 });
}

function getMeta(req: NextRequest): Meta {
  return {
    ip: (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim(),
    userAgent: req.headers.get("user-agent")?.slice(0, 255) ?? null,
  };
}

async function readBody(req: NextRequest): Promise<unknown> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return undefined;
  const text = await req.text();
  if (!text) return {};
  if (text.length > 1_000_000) throw new AppError("BAD_REQUEST", "Request body too large");
  return JSON.parse(text);
}

/**
 * Wraps a route handler with authentication, tenant resolution, RBAC, validation,
 * rate limiting, session rotation, structured logging and consistent error responses.
 */
export function route<B = undefined, Q = undefined, A extends AuthMode = "workspace">(
  options: RouteOptions<B, Q> & { auth?: A },
  handler: (args: HandlerArgs<B, Q, A>) => Promise<unknown>,
) {
  const auth: AuthMode = options.auth ?? "workspace";

  return async (req: NextRequest, context: RouteContext): Promise<Response> => {
    const started = Date.now();
    const meta = getMeta(req);
    let status = 200;
    try {
      const rawParams = (await context?.params) ?? {};
      const params = Object.fromEntries(Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v.join("/") : v]));

      // Authentication
      const jar = await cookies();
      const token = jar.get(SESSION_COOKIE)?.value;
      let session: ValidSession | null = token ? await validateSessionToken(token) : null;
      if (session?.session.twoFactorPending && !options.allowTwoFactorPending) session = null;
      if (auth !== "public" && !session) throw unauthenticated();
      if (auth === "admin" && session?.user.platformRole !== "SUPER_ADMIN") throw forbidden("Administrator access required");

      if (options.rateLimit) {
        const who = session?.user.id ?? meta.ip;
        await enforceRateLimit(`${options.rateLimit.key ?? req.nextUrl.pathname}:${who}`, options.rateLimit.limit, options.rateLimit.windowSec);
      }

      // Tenant resolution
      let ctx: WorkspaceContext | null = null;
      if (session && (auth === "workspace" || options.permission)) {
        const requested = req.headers.get("x-workspace-id");
        ctx = await resolveWorkspace(session.user, requested);
        if (!ctx && auth === "workspace") throw forbidden("No access to this workspace");
      }
      if (options.permission) {
        if (!ctx) throw forbidden();
        assertCan(ctx, options.permission);
      }

      const body = options.body ? options.body.parse(await readBody(req)) : (undefined as B);
      const query = options.query ? options.query.parse(Object.fromEntries(req.nextUrl.searchParams)) : (undefined as Q);

      // Refresh-token rotation on active use.
      if (session && !session.session.twoFactorPending && needsRotation(session.session)) {
        await rotateSession(session);
      }

      const result = await handler({ req, params, body, query, meta, session, user: session?.user ?? null, ctx } as HandlerArgs<B, Q, A>);
      if (result instanceof Response) {
        status = result.status;
        return result;
      }
      return ok(result ?? null);
    } catch (err) {
      const res = errorResponse(err);
      status = res.status;
      return res;
    } finally {
      logger.info("api", { method: req.method, path: req.nextUrl.pathname, status, ms: Date.now() - started });
    }
  };
}
