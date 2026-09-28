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
    api/v1/          REST API (166 route handlers), api/health, api/ready
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
| `reports` | Generate campaign performance reports; daily AI Manager runs |
| `scheduler` | The 60-second tick |

The worker (`npm run worker`) registers a repeatable `tick` job every 60 seconds. Each tick enqueues due social posts, scheduled email campaigns and sequence steps, scheduled workflows and resumed delays, rolls billing periods over (applying scheduled downgrades), triggers the hourly analytics rollup, queues each workspace's daily AI Manager run (once per UTC day, from its configured hour) and deletes expired sessions and tokens. Because the tick is a single repeatable job, running several worker replicas does not duplicate it.

## Domain events and automations

Services emit domain events (`emitEvent`) such as `LEAD_CREATED`, `LEAD_STATUS_CHANGED`, `CONTENT_PUBLISHED`, `CAMPAIGN_COMPLETED` and `ENGAGEMENT_LOW`. Enabled workflows listening to that trigger (after their trigger filters) get a `WorkflowExecution`, which the `workflows` queue runs step by step. `DELAY` steps park the execution in `WAITING` with a resume time that the scheduler picks up; `CONDITION` steps stop the run when false. Every step appends to the execution log shown in the builder.

## Copilot, autopilot and insights

- **Copilot** (`services/copilot.ts`, `components/app/copilot.tsx`): `POST /copilot` returns a Markdown reply plus proposed actions validated against a zod schema; `POST /copilot/execute` runs one approved action after re-checking the member's permission. Workspace questions (hot leads, approvals, performance, upcoming posts, campaigns, next steps) are answered from live queries. With a real model the model plans the reply and actions from a workspace snapshot; with the offline demo provider a rule-based planner handles the same requests.
- **Voice** (`lib/voice.ts`, `components/app/voice-mode.tsx`): the Web Speech API in the browser — recognition in, synthesis out — around the same Copilot endpoint with `voice: true`, which asks a real model for 1–3 spoken sentences (Markdown answers are also flattened for speech). Short replies such as “yes”, “approve all”, “no”, “stop” and “goodbye” are handled locally as commands; approvals still go through `/copilot/execute` with the usual permission checks. The optional wake word runs continuous recognition only while the tab is visible. `Permissions-Policy` allows the microphone for the app's own origin only.
- **Campaign autopilot** (`services/autopilot.ts`): an async generator that creates the campaign, then strategy and tasks, blog post, per-platform social drafts spread over the campaign dates, an email draft and a disabled follow-up automation. `POST /campaigns/autopilot` streams each step over SSE; failures in one step don't stop the others, and nothing is published or sent.
- **Insights** (`services/insights.ts`): rule-based signals from `MetricDaily` (3-day vs 14-day anomaly test, week-over-week change), leads, campaigns, approvals, social and email. The hourly analytics job sends each anomaly alert at most once a day and writes one AI weekly digest per ISO week.
- **Templates** (`config/templates.ts`) and **Brand autofill** (`services/brand-autofill.ts`, SSRF-safe fetch of the user's site, deterministic metadata extraction plus optional AI inference with a real model).

## Growth: website, inbox, landing pages and the AI Manager

- **Website widget** (`services/website.ts`, `server/widget-script.ts` served at `/widget.js`): a dependency-free script that records pageviews (including SPA navigation), binds `form[data-infinityops]` to lead capture and renders the chat in a shadow DOM using `textContent` only. Visitors are counted with a daily-rotating salted hash of IP and user agent — no cookies, no raw IPs stored. Public endpoints live under `/api/public/*`, where the middleware sets open CORS, strips cookies and skips the CSRF check; each checks the key, the optional domain allow-list and a per-IP rate limit. The hourly rollup adds website visits and conversions to `MetricDaily`.
- **Inbox** (`services/inbox.ts`): one `Conversation` per contact and channel. Website chat gets AI replies (from the Brand Kit) until a person turns them off; WhatsApp and email conversations start with AI off. Inbound WhatsApp is verified with HMAC-SHA256 of the raw body; inbound email is normalised across providers and de-duplicated by message ID. Replies go out on the same channel (WhatsApp Graph API or the workspace's email provider); a failed delivery is stored with its error.
- **Landing pages** (`services/landing-pages.ts`, `app/p/[slug]`): content is a zod-validated section schema, not HTML, so pages always render safely and each field is editable. A real model writes the JSON; the demo provider fills a template from the Brand Kit. Pages embed the widget with `data-page`, so views and form leads are attributed to the page.
- **AI Manager** (`services/agent.ts`): gathers insights, inbox, leads and content gaps, turns them into rule-based proposals (Copilot actions), and with a real model adds a written brief and up to two extra draft ideas. Proposals are de-duplicated against pending ones, approved through `copilotExecute` with the approver's permissions, and claimed atomically so a double click can't run twice. `autoDrafts` pre-runs up to three draft-only actions as the workspace owner.

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
