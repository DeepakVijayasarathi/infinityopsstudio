# Database

PostgreSQL 16, accessed through Prisma 6. The schema lives in `prisma/schema.prisma` (44 models, 32 enums); migrations are in `prisma/migrations`.

## Conventions

- **Ids** are `cuid()` strings. Timestamps are `createdAt` / `updatedAt` (UTC).
- **Tenancy**: every business table has a required `workspaceId` with `onDelete: Cascade`, so deleting a workspace removes its data. Queries always filter by it (see [SECURITY.md](SECURITY.md#tenant-isolation)).
- **Soft deletes**: `User`, `Workspace`, `Campaign`, `Content`, `Lead` and `File` have `deletedAt`; list queries exclude soft-deleted rows. Everything else is hard-deleted.
- **Money** is stored in minor units (`…Cents`, integer); AI cost in micro-dollars (`costMicros`, 1e-6 USD).
- **Secrets** (integration credentials, TOTP secrets) are AES-256-GCM encrypted before storage; tokens (sessions, verification links, invites, recovery codes) are stored only as SHA-256 hashes.
- **Enums** are Postgres enums, mirrored as TypeScript unions in `src/lib/constants.ts` for the UI.

## Entities

### Identity and access

| Model | Purpose |
|---|---|
| `User` | Account: email, bcrypt password hash, platform role (`USER` / `SUPER_ADMIN`), status, 2FA secret and hashed recovery codes, failed-login counter and lockout, last workspace |
| `OAuthAccount` | Linked Google identity (`provider` + `providerAccountId`, unique) |
| `Session` | Hashed session token, previous token hash and rotation time (reuse detection), expiry, remember-me, pending-2FA flag, IP and user agent, revocation |
| `VerificationToken` | Hashed one-time tokens: email verification, password reset, account recovery |
| `Workspace` | Tenant: name, unique slug, industry, timezone, logo |
| `Role` | Named permission set with a rank; system roles have `workspaceId = null` |
| `WorkspaceMember` | User ↔ workspace ↔ role (unique per workspace and user) |
| `WorkspaceInvite` | Pending invitation: email, role, hashed token, expiry |

### Billing and usage

| Model | Purpose |
|---|---|
| `Subscription` | One per workspace: plan, status, interval, provider ids, current period, pending downgrade, cancel-at-period-end |
| `Invoice` | Number, amount, status, billing period, provider id and hosted URL |
| `UsageRecord` | Metered usage events (`AI_CREDITS`, `AI_TOKENS`, `EMAILS_SENT`, `SOCIAL_POSTS`, `CONTENT_ITEMS`, `STORAGE_BYTES`) per billing period (`YYYY-MM`) |

### AI

| Model | Purpose |
|---|---|
| `AIWorker` | A workspace's instance of one of the 8 worker templates: active flag, custom instructions, model, temperature, approval requirement |
| `AITask` | Work assigned to a worker: capability, instructions, status (`QUEUED → RUNNING → AWAITING_APPROVAL → APPROVED/REJECTED`, or `COMPLETED`, `FAILED`, `CANCELLED`), output, token usage, reviewer |
| `AIRequest` | Audit row for **every** model call: feature, provider, model, tokens, cost, latency, status, error and a short prompt preview |
| `AIConversation` / `AIMessage` | Chat threads with a worker |

### Marketing modules

| Model | Purpose |
|---|---|
| `Campaign` | Objective, status, approval state, budget and spend, dates, channels, KPIs, AI strategy |
| `CampaignTask` | Tasks within a campaign, optionally assigned to a person or AI worker |
| `Content` / `ContentVersion` | Documents with type, status, keywords, sharing token; numbered version snapshots |
| `SocialAccount` / `SocialPost` | Connected profiles; posts with platform, status, schedule, media, approval and engagement metrics |
| `SEOProject` / `Keyword` | Tracked sites with last audit result and competitors; keywords with volume, difficulty, intent and position history |
| `EmailTemplate` / `EmailCampaign` / `EmailSend` | Templates; one-off campaigns and sequences with segment and steps; per-recipient sends with tracking token, open and click times |
| `Lead` / `LeadActivity` / `LeadTask` | Contacts with source, status, score, value, owner, tags and unsubscribe state; activity timeline; follow-up tasks |
| `Workflow` / `WorkflowNode` / `WorkflowExecution` | Automations: trigger and filters, ordered steps with JSON config, executions with status, current step, resume time and logs |
| `BrandKit` | One per workspace: voice and attributes, audience, products, USPs, competitors, do's and don'ts, guidelines, logo and brand colours |
| `Integration` | Connected provider per workspace: config, encrypted credentials, status, last check |
| `MetricDaily` | Daily metrics per workspace, channel and optionally campaign (impressions, reach, visits, clicks, engagements, leads, conversions, revenue, spend) |

### Platform

| Model | Purpose |
|---|---|
| `Notification` | In-app notifications per user and workspace, with read state |
| `AuditLog` | Security and business audit trail: actor, action, entity, metadata, IP, user agent |
| `FeatureFlag` | Global or per-workspace flags with rollout percentage |
| `SystemSetting` | Key/value JSON platform settings (AI defaults and pricing overrides, signup policy, maintenance banner) |
| `SystemLog` | Server-side errors and events for the admin log viewer |
| `File` | Uploaded files: storage key, MIME type, size, visibility |
| `BlogPost` | Public blog articles |
| `ContactSubmission` | Contact and demo requests from the public site |

## Indexes

Beyond primary keys and unique constraints, the schema declares 64 `@@index` / `@@unique` definitions. The main patterns are:

- `(workspaceId, status)` and `(workspaceId, createdAt)` on list-heavy tables (campaigns, content, tasks, posts, leads, email campaigns) to serve filtered, paginated lists.
- `(workspaceId, channel, date)` and `(campaignId, date)` on `MetricDaily` for analytics time series.
- `AIRequest (workspaceId, createdAt)` and `UsageRecord (workspaceId, metric, period)` for usage and cost reporting.
- Scheduler lookups across all workspaces: `SocialPost (status, scheduledAt)`, `EmailCampaign (status, scheduledAt)`, `WorkflowExecution (status, resumeAt)`.
- Unique business keys: `User.email`, `Workspace.slug`, `Lead (workspaceId, email)`, `Integration (workspaceId, provider)`, and the token hashes on sessions and verification tokens.

## Migrations

```bash
npm run db:migrate          # prisma migrate deploy — apply pending migrations (CI, Docker, production)
npm run db:migrate:dev      # prisma migrate dev — create a migration after editing schema.prisma
npx prisma studio           # browse data locally
```

Docker Compose runs `prisma migrate deploy` in the one-off `migrate` service before the web and worker services start. Migrations are forward-only; review generated SQL before merging and prefer additive changes (new nullable columns, backfill, then constrain) for zero-downtime deploys.

## Seed data

`npm run db:seed` (`prisma/seed.ts`) creates the system roles, a super admin and the **Northwind Growth** demo workspace on the Growth plan. The demo workspace has 4 members across roles, 8 campaigns, 90 days of daily metrics, 140 leads, content with versions, social accounts and posts, an SEO project with keywords, email templates and campaigns, 4 automations with executions, AI tasks and about 280 AI requests, invoices, notifications and audit history. It also loads the public blog articles.

Re-running the seed rebuilds the demo workspace. `--if-empty` (used by Docker Compose) skips seeding when any user exists.

## Backups

Use your platform's managed Postgres backups, or `pg_dump --format=custom` on a schedule. Restore into a fresh database, then run `npm run db:migrate` to apply any newer migrations.
