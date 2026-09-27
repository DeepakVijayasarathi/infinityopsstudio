# Architecture

InfinityOps Studio is a single Next.js application (UI, server rendering and REST API) backed by PostgreSQL. It has one companion process, the **worker**, which runs background jobs from Redis queues.

```
                 ┌──────────────────────────────────────────────┐
 Browser ──────▶ │ Next.js (web)                                │
                 │  middleware: CSRF · CORS · page guard · ids  │
                 │  app/(marketing) (auth) app admin  ── RSC ───┼──┐
                 │  app/api/v1/**  ── route() wrapper ──────────┼──┤
                 └───────────────┬──────────────────────────────┘  │
                                 │ enqueue()                       │ src/server/services/*
                                 ▼                                 ▼
                         ┌──────────────┐   jobs    ┌─────────────────────┐
                         │ Redis/BullMQ │ ────────▶ │ worker (tsx)        │
                         └──────────────┘           │ queues + scheduler  │
                                 ▲                  └──────────┬──────────┘
                                 │ rate limits                 │
                         ┌───────┴──────────────────────────────┴──────┐
                         │ PostgreSQL (Prisma)                         │
                         └─────────────────────────────────────────────┘
     External: AI providers (Anthropic · OpenAI · Google) · SMTP · Stripe/Razorpay
               · LinkedIn / Meta / X / YouTube APIs · S3-compatible storage
```

## Source layout

```
src/
  app/
    (marketing)/     public site: home, features, pricing, about, contact, blog, legal
    (auth)/          login, signup, two-factor, password reset, recovery, verify, invite, onboarding
    app/             the product (/app/*): one folder per module
    admin/           platform administration (/admin/*), super admins only
    api/v1/          REST API (157 route handlers), api/health, api/ready
    og/  share/  unsubscribe/  robots.ts  sitemap.ts
  components/        ui/ (design system), charts/, app/ (shell), marketing/, auth/
  config/            plans, permissions and roles, AI worker definitions, site metadata
  hooks/             form state, AI streaming, URL query state
  lib/               isomorphic helpers: API client, zod schemas, CSV, templates, constants
  server/            server-only code (never imported by client components)
    auth/            passwords, sessions and rotation, TOTP, cookies
    ai/              provider abstraction, model catalog, prompts, brand context
    billing/         plan changes, usage metering, Stripe/Razorpay/manual providers
    integrations/    integration registry, social publishers
    email/  storage/ jobs/  services/
    api.ts           route() wrapper   tenant.ts   env.ts   queue.ts   net.ts …
worker/index.ts      BullMQ workers + scheduler
prisma/              schema, migrations, seed
tests/               unit/, integration/, e2e/
```

## Request lifecycle

**Pages** are React Server Components. Each module's `page.tsx` calls `requirePagePermission("…")` (`src/server/page-context.ts`), which validates the session, resolves the workspace and enforces the permission (redirecting to `/login` or `/app/forbidden`). The page loads data directly through the service layer and passes plain props to client components. Client components mutate through the REST API (`src/lib/api-client.ts`) and then call `router.refresh()`; lists that filter or paginate on the client read through SWR.

**API routes** are thin: every handler is built with `route()` (`src/server/api.ts`), which in order:

1. validates the session cookie (rejecting sessions still waiting for a second factor),
2. applies the route's rate limit,
3. resolves the workspace (`x-workspace-id` → `ios_ws` cookie → last workspace) and verifies membership,
4. checks the required permission against the member's role,
5. enforces the "verify email before changes" platform policy when enabled,
6. parses and validates the JSON body and query with zod,
7. rotates the session token when it is older than 15 minutes,
8. runs the handler and wraps the result as `{ data }`, or maps errors to `{ error: { code, message, details } }`,
9. logs method, path, status and duration, and records 5xx errors in `SystemLog`.

**Services** (`src/server/services/*`) hold all business rules — plan limits, status transitions, approvals, audit entries, notifications and domain events. They take a `WorkspaceContext` and scope every query by `workspaceId`, so the same functions serve pages, API routes, automations and background jobs.

**Middleware** (`src/middleware.ts`) runs at the edge before everything: it blocks cross-origin mutating API requests, answers CORS preflights for configured origins, redirects signed-out visitors away from `/app` and `/admin`, and stamps an `x-request-id` on every request.

## Background jobs

`enqueue(queue, payload)` (`src/server/queue.ts`) adds a BullMQ job with 3 attempts and exponential backoff. When `REDIS_URL` is unset (or Redis is unreachable) the job runs in-process instead, so local development and tests need no extra infrastructure.

| Queue | Jobs |
|---|---|
| `ai` | Run AI worker tasks |
| `email` | Send email campaigns, transactional and notification emails |
| `social` | Publish scheduled social posts |
| `workflows` | Run or resume automation executions |
| `analytics` | Roll up first-party metrics per workspace, sync YouTube subscribers, fire low-engagement triggers |
| `reports` | Generate campaign performance reports |
| `scheduler` | The 60-second tick |

The worker (`npm run worker`) registers a repeatable `tick` job every 60 seconds. Each tick enqueues due social posts, scheduled email campaigns and sequence steps, scheduled workflows and resumed delays, rolls billing periods over (applying scheduled downgrades), triggers the hourly analytics rollup and deletes expired sessions and tokens. Because the tick is a single repeatable job, running several worker replicas does not duplicate it.

## Domain events and automations

Services emit domain events (`emitEvent`) such as `LEAD_CREATED`, `LEAD_STATUS_CHANGED`, `CONTENT_PUBLISHED`, `CAMPAIGN_COMPLETED` and `ENGAGEMENT_LOW`. Enabled workflows listening to that trigger (after their trigger filters) get a `WorkflowExecution`, which the `workflows` queue runs step by step. `DELAY` steps park the execution in `WAITING` with a resume time that the scheduler picks up; `CONDITION` steps stop the run when false. Every step appends to the execution log shown in the builder.

## AI

All model calls go through `generateText` / `streamText` (`src/server/ai/service.ts`): model resolution, Brand Kit injection, credit checks, retries, timeouts, cost calculation and an `AIRequest` audit row for every call. See [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md).

## Multi-tenancy

Every business table carries `workspaceId`; services always filter by it and look records up with `findFirst({ where: { id, workspaceId } })`, so an id from another workspace behaves exactly like a missing one (`404`). Roles are rows (`Role`) with permission arrays; the five system roles are shared (`workspaceId = null`). Details in [SECURITY.md](SECURITY.md).

## Frontend

- **Design system** in `src/components/ui`: buttons, inputs, dialogs and sheets, dropdowns, tabs, data table with pagination, badges, skeletons, empty, error and loading states, confirm dialogs. Tokens are CSS variables in `globals.css` (light and dark), consumed through Tailwind 4 `@theme`.
- **Charts** (`src/components/charts`) wrap Recharts with a validated categorical palette (`--series-1…8`), legends for multi-series charts, hover tooltips and a single y-axis.
- **Shell**: collapsible sidebar, top bar with global search (⌘K command palette), notifications, theme toggle and workspace switcher; bottom navigation on mobile.
- Dates in client components render through `TimeAgo` / `DateText` to avoid hydration mismatches.

## Observability

- Structured JSON logs (`src/server/logger.ts`) with level control via `LOG_LEVEL`, and a request id on every API log line.
- `SystemLog` stores server errors, worker failures and notable events; super admins browse it at `/admin/logs`.
- `AuditLog` records security- and business-relevant actions (sign-ins, role changes, deletions, plan changes…), visible at `/admin/audit`.
- `GET /api/health` (liveness) and `GET /api/ready` (database and Redis reachability, `503` when degraded).
- The admin dashboard shows live queue depths, AI cost and error counts.
