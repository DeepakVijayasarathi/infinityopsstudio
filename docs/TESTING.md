# Testing

Three layers, all runnable locally and in CI (`.github/workflows/ci.yml`).

| Suite | Tool | Location | Needs |
|---|---|---|---|
| Unit | Vitest | `tests/unit` | nothing |
| Integration | Vitest | `tests/integration` | PostgreSQL (`TEST_DATABASE_URL`) |
| End-to-end | Playwright | `tests/e2e` | a built app, PostgreSQL, Chromium |

```bash
npm run test:unit        # fast, no database
npm test                 # unit + integration
npm run test:e2e         # builds must exist: npm run build first
npm run check            # lint + typecheck + tests + production build
```

## Unit tests

Pure logic with no I/O:

- CSV parsing and export (RFC 4180 quoting, BOM, formula-injection neutralisation, round trip)
- Template rendering and every automation condition operator
- Lead scoring (seniority, pipeline stage, engagement, clamping)
- SEO page audit scoring and internal-link suggestions
- AES-256-GCM encryption (fresh IV, tamper detection), hashing helpers, bcrypt, password policy, TOTP and recovery codes
- AI model catalog, cost and credit calculation, pricing overrides; the local provider's routing, transforms, usage and streaming
- Plan ordering and limits, role permission nesting, Stripe webhook signature verification (valid, forged, stale)

## Integration tests

Services and API route handlers run against a real PostgreSQL database with the production code paths — only `next/headers` is replaced by an in-memory cookie jar (`tests/helpers/next-headers.ts`). Jobs run synchronously in-process (`QUEUE_INLINE_SYNC=1`) and AI uses the deterministic local provider, so results are reproducible.

- **Auth**: signup creates the workspace, owner role, AI workers and audit entry; duplicate emails; identical errors for unknown users and wrong passwords; lockout after five failures; the full 2FA flow including recovery codes; refresh-token rotation and reuse detection.
- **Tenancy and RBAC**: other workspaces are unresolvable; cross-workspace reads, updates and deletes return `NOT_FOUND`; viewer permissions; role-escalation prevention.
- **Campaigns and content**: create, list, duplicate, date validation, status transitions, audit entries, plan limits; content version snapshots and restore.
- **AI workers**: a task flows through the queue to `AWAITING_APPROVAL` with an `AIRequest` row and credit usage, then approval and saving to Content Studio; inactive workers are refused.
- **Billing**: upgrades apply immediately with an invoice; downgrades are scheduled for period end.
- **Automations**: a `LEAD_CREATED` workflow with a condition and a lead update runs for matching leads and stops for others.
- **API layer**: `401` shape for anonymous calls, `422` validation errors, workspace-scoped create and list, `403` for a foreign `x-workspace-id`, health endpoint.

### Setup

```bash
createdb infinityops_test          # once (or: psql -c "CREATE DATABASE infinityops_test")
export TEST_DATABASE_URL=postgresql://ios:ios@localhost:5432/infinityops_test?schema=public
npm test
```

Before the run, `tests/global-setup.ts` applies migrations with `prisma migrate deploy`. Each test file truncates all tables in `beforeEach`, so **never point `TEST_DATABASE_URL` at a database with data you care about**. Files run sequentially (`fileParallelism: false`) because they share the database.

## End-to-end tests

Playwright drives Chromium through real user journeys against a production build:

- `public.spec.ts` — marketing navigation, pricing, blog article, redirect of protected pages to login, health endpoints.
- `journey.spec.ts` — one new customer, in order: sign up → create a campaign → generate and save content → assign a task to an AI worker → build an automation → open analytics → upgrade the plan (with invoice).

```bash
npm run build
npx prisma migrate deploy && npm run db:seed    # the public blog comes from the seed
npm run test:e2e                                # starts `npm start` automatically
# or against a running server / container:
E2E_BASE_URL=http://localhost:3100 npm run test:e2e
```

In production mode the server requires real secrets, so export a random `AUTH_SECRET` and `ENCRYPTION_KEY` (see [ENVIRONMENT.md](ENVIRONMENT.md)). Traces and screenshots of failures are written to `test-results/`; CI uploads the HTML report.

## Writing tests

- Put pure functions under `tests/unit`; anything touching Prisma under `tests/integration`.
- Use `createOwner()` and `addMember()` from `tests/helpers/factory.ts` to get a real `WorkspaceContext`.
- Assert on `AppError` codes (`rejects.toMatchObject({ code: "NOT_FOUND" })`) rather than messages.
- Prefer role- and label-based locators in Playwright (`getByRole`, `getByLabel`); form controls in the app carry accessible labels.
