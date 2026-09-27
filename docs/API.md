# API reference

InfinityOps Studio exposes a JSON REST API under `/api/v1`. The web app is its only first-party client; every screen is built on these endpoints, so anything you can do in the UI you can do over the API.

## Conventions

**Authentication.** Sessions use an opaque token in the `ios_session` cookie (httpOnly, `SameSite=Lax`, `Secure` in production). Obtain it with `POST /api/v1/auth/login` or `POST /api/v1/auth/signup`. Tokens rotate every 15 minutes of activity; the previous token stays valid for a 60-second grace window, and replaying it afterwards revokes the whole session (see [SECURITY.md](SECURITY.md)).

**Workspace scoping.** Workspace endpoints act on the caller's current workspace: the `x-workspace-id` header if present, otherwise the `ios_ws` cookie, otherwise the user's last workspace. Membership is verified on every request; asking for a workspace you don't belong to returns `403`.

**Permissions.** Each endpoint declares the permission it needs (the *Access* column below). Permissions come from the member's role — see the matrix in [SECURITY.md](SECURITY.md#roles-and-permissions).

**CSRF.** Mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`) must carry an `Origin` (or `Referer`) matching `APP_URL`, the request origin or an entry in `ALLOWED_ORIGINS`. Webhook, tracking and unsubscribe endpoints are exempt because they authenticate with signatures or signed tokens instead of cookies.

**Requests.** Bodies are JSON (`content-type: application/json`, max 1 MB) and validated with zod; file uploads use `multipart/form-data`.

**Responses.** Success responses are wrapped in `data`:

```json
{ "data": { "id": "cm…", "name": "Q4 launch" } }
```

Lists are paginated with `?page=1&pageSize=20&sort=createdAt&order=desc&q=search` (`pageSize` ≤ 100):

```json
{ "data": { "items": [ … ], "meta": { "page": 1, "pageSize": 20, "total": 42, "totalPages": 3 } } }
```

**Errors** always have the same shape. Validation errors include per-field messages in `details`:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Campaign name is required", "details": [{ "path": "name", "message": "Campaign name is required" }] } }
```

| Code | HTTP | Meaning |
|---|---|---|
| `BAD_REQUEST` | 400 | The request is well-formed but not allowed in the current state |
| `UNAUTHENTICATED` | 401 | No valid session |
| `TWO_FACTOR_REQUIRED` | 401 | Password accepted; complete `POST /auth/2fa/verify` |
| `PAYMENT_REQUIRED` | 402 | Plan limit reached (credits, seats, campaigns…) |
| `FORBIDDEN` | 403 | Missing permission, not a member, or cross-origin request |
| `NOT_FOUND` | 404 | Record doesn't exist in this workspace |
| `CONFLICT` | 409 | Duplicate (e.g. email already registered) |
| `VALIDATION_ERROR` | 422 | Body or query failed validation |
| `RATE_LIMITED` | 429 | Too many requests; see the `Retry-After` header |
| `SERVICE_UNAVAILABLE` | 503 | An upstream provider (AI, billing, email) failed |
| `INTERNAL_ERROR` | 500 | Unexpected error; logged with the request's `x-request-id` |

Every response carries an `x-request-id` header; include it when reporting problems.

**Rate limits.** Sensitive endpoints have fixed-window limits keyed by user (or IP when signed out), backed by Redis with an in-memory fallback. Examples: login 20 / 15 min per IP plus account lockout after 5 failed passwords, signup 5 / hour, forgot-password 5 / 15 min, 2FA verification 10 / 15 min, invitations 30 / hour, inbound workflow webhooks 120 / min. AI usage is metered in credits against the workspace plan (`402` when exhausted).

**Streaming.** AI generation endpoints (`POST /content/generate`, `POST /content/inline`, `POST /workers/:id/chat`, `POST /email/writer`) respond with Server-Sent Events:

```
event: meta   data: {"model":"claude-sonnet-5","provider":"anthropic","label":"Claude Sonnet 5"}
event: token  data: {"text":"Here's a draft…"}
event: done   data: {"usage":{"promptTokens":812,"completionTokens":644},"costMicros":8062,"credits":2,"model":"claude-sonnet-5"}
event: error  data: {"message":"…"}
```

## Examples

```bash
# Sign in (stores the session cookie in cookies.txt)
curl -c cookies.txt -H 'content-type: application/json' -H 'origin: http://localhost:3000' \
  -d '{"email":"demo@infinityops.studio","password":"Demo12345!"}' \
  http://localhost:3000/api/v1/auth/login

# List active campaigns
curl -b cookies.txt 'http://localhost:3000/api/v1/campaigns?status=ACTIVE&pageSize=10'

# Assign a task to an AI worker (runs in the background worker)
curl -b cookies.txt -H 'content-type: application/json' -H 'origin: http://localhost:3000' \
  -d '{"capability":"blog-post","instructions":"How route optimization cuts fuel costs"}' \
  http://localhost:3000/api/v1/workers/<workerId>/tasks

# Trigger an automation from another system
curl -H 'content-type: application/json' -d '{"email":"new@lead.com","firstName":"Sam"}' \
  http://localhost:3000/api/v1/hooks/workflows/<webhookToken>
```

## Webhooks

- **Inbound workflow hooks** — `POST /api/v1/hooks/workflows/:token` starts an automation whose trigger is *Webhook*. The token is shown in the automation builder; the JSON body is available to steps as `payload.*`.
- **Billing** — `POST /api/v1/billing/webhooks/stripe` (verifies `Stripe-Signature`, 5-minute tolerance) and `POST /api/v1/billing/webhooks/razorpay` (verifies `X-Razorpay-Signature`).
- **Outgoing** — the *Webhook* automation step POSTs JSON to a public URL (private and link-local addresses are refused). When the Webhook integration is connected, requests carry `x-ios-timestamp` and `x-ios-signature: sha256=<hex>`, an HMAC-SHA256 of `<timestamp>.<raw body>` with the integration secret. Receivers should reject timestamps older than a few minutes.

## Endpoints

157 route handlers. *Access* lists the permission required, or who may call it.

### System

| Method | Path | Access |
|---|---|---|
| GET | `/api/health` | none |
| GET | `/api/ready` | none |

### Authentication

| Method | Path | Access |
|---|---|---|
| POST | `/api/v1/auth/2fa/disable` | signed-in user |
| POST | `/api/v1/auth/2fa/enable` | signed-in user |
| POST | `/api/v1/auth/2fa/recovery-codes` | signed-in user |
| POST | `/api/v1/auth/2fa/setup` | signed-in user |
| POST | `/api/v1/auth/2fa/verify` | pending two-factor session |
| POST | `/api/v1/auth/forgot-password` | public |
| GET | `/api/v1/auth/google` | none (OAuth redirect) |
| GET | `/api/v1/auth/google/callback` | OAuth state cookie |
| POST | `/api/v1/auth/login` | public |
| POST | `/api/v1/auth/logout` | public |
| GET | `/api/v1/auth/me` | signed-in user |
| PATCH | `/api/v1/auth/password` | signed-in user |
| POST | `/api/v1/auth/recovery` | public |
| POST | `/api/v1/auth/recovery/complete` | public |
| POST | `/api/v1/auth/refresh` | signed-in user |
| POST | `/api/v1/auth/reset-password` | public |
| GET, DELETE | `/api/v1/auth/sessions` | signed-in user |
| DELETE | `/api/v1/auth/sessions/:id` | signed-in user |
| POST | `/api/v1/auth/signup` | public |
| POST | `/api/v1/auth/verify-email` | public |
| POST | `/api/v1/auth/verify-email/resend` | signed-in user |

### Current user

| Method | Path | Access |
|---|---|---|
| GET, PATCH, DELETE | `/api/v1/users/me` | signed-in user |
| PUT | `/api/v1/users/me/notifications` | signed-in user |

### Workspaces & team

| Method | Path | Access |
|---|---|---|
| GET, POST | `/api/v1/workspaces` | signed-in user |
| GET, PATCH, DELETE | `/api/v1/workspaces/current` | `workspace:delete`, `workspace:manage` |
| DELETE | `/api/v1/workspaces/invites/:id` | `members:manage` |
| POST | `/api/v1/workspaces/invites/accept` | signed-in user |
| GET, POST | `/api/v1/workspaces/members` | `members:manage` |
| PATCH, DELETE | `/api/v1/workspaces/members/:id` | `members:manage` |
| GET | `/api/v1/workspaces/roles` | workspace member |
| POST | `/api/v1/workspaces/switch` | signed-in user |

### AI workers

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/workers` | `workers:read` |
| GET, PATCH | `/api/v1/workers/:id` | `workers:manage`, `workers:read` |
| POST | `/api/v1/workers/:id/chat` | `workers:run` |
| GET | `/api/v1/workers/:id/conversations` | `workers:read` |
| GET, POST | `/api/v1/workers/:id/tasks` | `workers:read`, `workers:run` |
| GET | `/api/v1/workers/conversations/:id` | `workers:read` |
| GET | `/api/v1/workers/tasks` | `workers:read` |
| GET | `/api/v1/workers/tasks/:id` | `workers:read` |
| POST | `/api/v1/workers/tasks/:id/cancel` | `workers:run` |
| POST | `/api/v1/workers/tasks/:id/retry` | `workers:run` |
| POST | `/api/v1/workers/tasks/:id/review` | `tasks:approve` |
| POST | `/api/v1/workers/tasks/:id/save-content` | `content:write` |

### AI models & usage

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/ai/models` | signed-in user |
| GET | `/api/v1/ai/usage` | `analytics:read` |

### Campaigns

| Method | Path | Access |
|---|---|---|
| GET, POST | `/api/v1/campaigns` | `campaigns:read`, `campaigns:write` |
| GET, PATCH, DELETE | `/api/v1/campaigns/:id` | `campaigns:read`, `campaigns:write` |
| POST | `/api/v1/campaigns/:id/approval` | `campaigns:write` |
| POST | `/api/v1/campaigns/:id/duplicate` | `campaigns:write` |
| GET | `/api/v1/campaigns/:id/performance` | `campaigns:read` |
| POST | `/api/v1/campaigns/:id/status` | `campaigns:write` |
| POST | `/api/v1/campaigns/:id/strategy` | `campaigns:write` |
| POST | `/api/v1/campaigns/:id/strategy/tasks` | `campaigns:write` |
| POST | `/api/v1/campaigns/:id/tasks` | `campaigns:write` |
| PATCH, DELETE | `/api/v1/campaigns/:id/tasks/:taskId` | `campaigns:write` |

### Content Studio

| Method | Path | Access |
|---|---|---|
| GET, POST | `/api/v1/content` | `content:read`, `content:write` |
| GET, PATCH, DELETE | `/api/v1/content/:id` | `content:read`, `content:write` |
| GET | `/api/v1/content/:id/export` | `content:read` |
| GET | `/api/v1/content/:id/links` | `content:read` |
| POST | `/api/v1/content/:id/share` | `content:write` |
| POST | `/api/v1/content/:id/status` | `content:write` |
| GET | `/api/v1/content/:id/versions/:versionId` | `content:read` |
| POST | `/api/v1/content/:id/versions/:versionId/restore` | `content:write` |
| POST | `/api/v1/content/generate` | `content:write` |
| POST | `/api/v1/content/inline` | `content:write` |

### Social media

| Method | Path | Access |
|---|---|---|
| GET, POST | `/api/v1/social/accounts` | `integrations:manage`, `social:read` |
| DELETE | `/api/v1/social/accounts/:id` | `integrations:manage` |
| GET | `/api/v1/social/analytics` | `social:read` |
| GET | `/api/v1/social/calendar` | `social:read` |
| POST | `/api/v1/social/caption` | `social:write` |
| POST | `/api/v1/social/hashtags` | `social:write` |
| GET, POST | `/api/v1/social/posts` | `social:read`, `social:write` |
| GET, PATCH, DELETE | `/api/v1/social/posts/:id` | `social:read`, `social:write` |
| POST | `/api/v1/social/posts/:id/action` | `social:write` |

### SEO

| Method | Path | Access |
|---|---|---|
| PATCH, DELETE | `/api/v1/seo/keywords/:id` | `seo:write` |
| GET | `/api/v1/seo/opportunities` | `seo:read` |
| GET, POST | `/api/v1/seo/projects` | `seo:read`, `seo:write` |
| GET, PATCH, DELETE | `/api/v1/seo/projects/:id` | `seo:read`, `seo:write` |
| POST | `/api/v1/seo/projects/:id/audit` | `seo:write` |
| POST | `/api/v1/seo/projects/:id/competitors` | `seo:write` |
| GET, POST | `/api/v1/seo/projects/:id/keywords` | `seo:read`, `seo:write` |
| POST | `/api/v1/seo/projects/:id/keywords/suggest` | `seo:write` |
| GET | `/api/v1/seo/projects/:id/report` | `seo:read` |

### Email marketing

| Method | Path | Access |
|---|---|---|
| GET, POST | `/api/v1/email/campaigns` | `email:read`, `email:write` |
| GET, PATCH, DELETE | `/api/v1/email/campaigns/:id` | `email:read`, `email:write` |
| POST | `/api/v1/email/campaigns/:id/schedule` | `email:write` |
| POST | `/api/v1/email/campaigns/:id/state` | `email:write` |
| POST | `/api/v1/email/campaigns/:id/test` | `email:write` |
| POST | `/api/v1/email/segments/preview` | `email:read` |
| GET | `/api/v1/email/stats` | `email:read` |
| GET, POST | `/api/v1/email/templates` | `email:read`, `email:write` |
| PATCH, DELETE | `/api/v1/email/templates/:id` | `email:write` |
| GET | `/api/v1/email/track/click/:token` | signed token |
| GET | `/api/v1/email/track/open/:token` | signed token |
| POST | `/api/v1/email/unsubscribe/:token` | signed token |
| GET | `/api/v1/email/unsubscribed` | `email:read` |
| POST | `/api/v1/email/writer` | `email:write` |

### Leads & CRM

| Method | Path | Access |
|---|---|---|
| GET, POST | `/api/v1/leads` | `leads:read`, `leads:write` |
| GET, PATCH, DELETE | `/api/v1/leads/:id` | `leads:delete`, `leads:read`, `leads:write` |
| POST | `/api/v1/leads/:id/notes` | `leads:write` |
| POST | `/api/v1/leads/:id/resubscribe` | `email:send` |
| POST | `/api/v1/leads/:id/tasks` | `leads:write` |
| PATCH, DELETE | `/api/v1/leads/:id/tasks/:taskId` | `leads:write` |
| POST | `/api/v1/leads/bulk` | `leads:write` |
| GET | `/api/v1/leads/export` | `leads:read` |
| POST | `/api/v1/leads/import` | `leads:write` |
| GET | `/api/v1/leads/pipeline` | `leads:read` |

### Automations

| Method | Path | Access |
|---|---|---|
| GET, POST | `/api/v1/automations` | `automations:read`, `automations:write` |
| GET, PATCH, DELETE | `/api/v1/automations/:id` | `automations:read`, `automations:write` |
| POST | `/api/v1/automations/:id/enabled` | `automations:write` |
| GET | `/api/v1/automations/:id/executions` | `automations:read` |
| POST | `/api/v1/automations/:id/run` | `automations:write` |

### Inbound webhooks

| Method | Path | Access |
|---|---|---|
| POST | `/api/v1/hooks/workflows/:token` | workflow token |

### Analytics & reports

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/analytics/ai` | `analytics:read` |
| GET | `/api/v1/analytics/campaigns` | `analytics:read` |
| GET | `/api/v1/analytics/channels` | `analytics:read` |
| GET | `/api/v1/analytics/email` | `analytics:read` |
| GET | `/api/v1/analytics/export` | `analytics:read` |
| GET | `/api/v1/analytics/leads` | `analytics:read` |
| GET | `/api/v1/analytics/overview` | `analytics:read` |
| POST | `/api/v1/analytics/reports` | `analytics:read` |
| GET | `/api/v1/analytics/timeseries` | `analytics:read` |

### Brand Kit

| Method | Path | Access |
|---|---|---|
| GET, PUT | `/api/v1/brand` | `brand:manage` |

### Integrations

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/integrations` | workspace member |
| POST, DELETE | `/api/v1/integrations/:key` | `integrations:manage` |
| POST | `/api/v1/integrations/:key/test` | `integrations:manage` |

### Billing

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/billing` | `billing:view` |
| POST | `/api/v1/billing/cancel-pending` | `billing:manage` |
| POST | `/api/v1/billing/change-plan` | `billing:manage` |
| GET | `/api/v1/billing/invoices/:id` | `billing:view` |
| POST | `/api/v1/billing/portal` | `billing:manage` |
| POST | `/api/v1/billing/webhooks/:provider` | provider signature |

### Notifications

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/notifications` | signed-in user |
| DELETE | `/api/v1/notifications/:id` | signed-in user |
| POST | `/api/v1/notifications/read` | signed-in user |

### Global search

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/search` | workspace member |

### Activity feed

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/activity` | workspace member |

### Files

| Method | Path | Access |
|---|---|---|
| GET, POST | `/api/v1/files` | `content:write` |
| DELETE | `/api/v1/files/:id` | `content:write` |
| GET | `/api/v1/files/raw/:key*` | short-lived signed URL |

### Public forms

| Method | Path | Access |
|---|---|---|
| POST | `/api/v1/contact` | public |

### Platform admin

| Method | Path | Access |
|---|---|---|
| GET | `/api/v1/admin/ai` | super admin |
| GET | `/api/v1/admin/audit` | super admin |
| GET | `/api/v1/admin/content` | super admin |
| GET | `/api/v1/admin/dashboard` | super admin |
| GET, POST | `/api/v1/admin/flags` | super admin |
| DELETE | `/api/v1/admin/flags/:key` | super admin |
| POST | `/api/v1/admin/invoices/:id/paid` | super admin |
| GET | `/api/v1/admin/logs` | super admin |
| GET, PUT | `/api/v1/admin/settings` | super admin |
| GET | `/api/v1/admin/subscriptions` | super admin |
| GET | `/api/v1/admin/users` | super admin |
| PATCH | `/api/v1/admin/users/:id` | super admin |
| GET | `/api/v1/admin/workspaces` | super admin |
| POST | `/api/v1/admin/workspaces/:id/plan` | super admin |
