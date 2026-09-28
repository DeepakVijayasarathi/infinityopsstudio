# Environment variables

Configuration comes from environment variables only. They are validated at startup (`src/server/env.ts`); an invalid or missing required value stops the process with a message listing every problem. Copy `.env.example` to `.env` for local development.

Secrets are read on the server only. Nothing here is exposed to the browser (the app has no `NEXT_PUBLIC_*` variables).

## Core

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | | `development` | `development`, `test` or `production` |
| `APP_URL` | prod | `http://localhost:3000` | Public origin. Used in emails, OAuth redirects, share links and the CSRF origin check |
| `ALLOWED_ORIGINS` | | — | Extra comma-separated origins allowed to call the API with cookies |
| `DATABASE_URL` | ✓ | — | PostgreSQL connection string |
| `REDIS_URL` | prod | — | Redis for queues and rate limits. Without it, jobs run in-process and rate limits are per-process (development only). The worker requires it |
| `AUTH_SECRET` | ✓ | — | ≥ 32 characters. Signs email tracking links, file URLs and other tokens. Production refuses the development placeholder |
| `ENCRYPTION_KEY` | ✓ | — | 64 hex characters (32 bytes) for AES-256-GCM encryption of integration credentials and 2FA secrets. Production refuses the all-zero key. **Rotating it makes existing encrypted values unreadable** — users must reconnect integrations and re-enrol 2FA |
| `LOG_LEVEL` | | `info` | `debug`, `info`, `warn` or `error` |

Generate secrets with `openssl rand -hex 32`.

## Sign in with Google

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth client from Google Cloud Console. Authorised redirect URI: `${APP_URL}/api/v1/auth/google/callback`. When unset, the Google button returns to the login page with a "Google sign-in isn't configured" message |

## AI providers

| Variable | Default | Description |
|---|---|---|
| `AI_DEFAULT_PROVIDER` | `local` | `anthropic`, `openai`, `google`, `claude-code` (local Claude Code CLI, no API key) or `local` (offline demo provider) |
| `AI_DEFAULT_MODEL` | — | Optional default model id, e.g. `claude-sonnet-5`. Admins can override it in `/admin/settings` |
| `AI_REQUEST_TIMEOUT_MS` | `60000` | Per-call timeout |
| `AI_MAX_RETRIES` | `2` | Retries for rate limits, timeouts and server errors (0–5) |
| `ANTHROPIC_API_KEY` | — | Enables Claude models |
| `OPENAI_API_KEY` | — | Enables GPT models |
| `GOOGLE_AI_API_KEY` | — | Enables Gemini models |
| `CLAUDE_CODE_ENABLED` | `0` | Offer the local Claude Code models even when another provider is the default. Implied by `AI_DEFAULT_PROVIDER=claude-code` |
| `CLAUDE_CODE_PATH` | `claude` | Path to the Claude Code CLI binary |
| `CLAUDE_CODE_OAUTH_TOKEN` | — | Long-lived token from `claude setup-token` (Claude Pro/Max). Lets the CLI run headless on a server; set it with `bash manage.sh connect-claude`, or connect from **Admin → Settings** instead (stored encrypted in the database, takes priority, no restart) |
| `CLAUDE_CODE_MAX_CONCURRENCY` | `2` | Maximum CLI processes running at once (per app or worker process) |

Models only appear in pickers when their provider has a key. See [AI_ARCHITECTURE.md](AI_ARCHITECTURE.md).

## Email

| Variable | Default | Description |
|---|---|---|
| `EMAIL_PROVIDER` | `console` | `console` logs emails (development); `smtp` sends them |
| `EMAIL_FROM` | `InfinityOps Studio <no-reply@infinityuniquers.com>` | Sender for system email |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | —, `587` | Platform SMTP server (Postmark, SES, SendGrid…). Workspaces can also connect their own SMTP integration for marketing email |

## Billing

| Variable | Default | Description |
|---|---|---|
| `BILLING_PROVIDER` | `manual` | `manual` (plan changes apply immediately and invoices are issued for offline payment), `stripe` or `razorpay` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | — | Stripe Checkout, customer portal and webhooks (`/api/v1/billing/webhooks/stripe`) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | — | Razorpay subscriptions and webhooks (`/api/v1/billing/webhooks/razorpay`) |

## File storage

| Variable | Default | Description |
|---|---|---|
| `STORAGE_DRIVER` | `local` | `local` disk or `s3` (any S3-compatible service: AWS S3, Cloudflare R2, MinIO…) |
| `STORAGE_LOCAL_DIR` | `./storage` | Directory for the local driver. Mount a persistent volume in containers |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | — | S3 settings; `S3_ENDPOINT` is only needed for non-AWS services |
| `MAX_UPLOAD_BYTES` | `10485760` | Upload size limit (10 MB) |

## Seeding

| Variable | Default | Description |
|---|---|---|
| `SEED_DEMO_PASSWORD` | `Demo12345!` | Password for the demo workspace users |
| `SEED_ADMIN_PASSWORD` | `Admin12345!` | Password for `admin@infinityops.studio` |

## Docker Compose

| Variable | Default | Description |
|---|---|---|
| `WEB_PORT` | `3000` | Host port for the web container |
| `SEED_DEMO` | `1` | Seed demo data into an empty database on first start (`0` to skip) |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `ios`, `ios`, `infinityops` | Credentials for the bundled PostgreSQL |

## Build and tests

| Variable | Description |
|---|---|
| `BUILD_STANDALONE=1` | Produce Next.js standalone output (set by the Dockerfile) |
| `TEST_DATABASE_URL` | Database for `npm test` (default `postgresql://ios:ios@localhost:5432/infinityops_test`). **Tests truncate every table** — never point it at real data |
| `E2E_BASE_URL` | Run Playwright against an already running server instead of starting `npm start` |
| `PLAYWRIGHT_CHROMIUM_PATH` | Use a preinstalled Chromium binary |
| `QUEUE_INLINE=1` / `QUEUE_INLINE_SYNC=1` | Run jobs in-process (and synchronously) even when Redis is configured. Used by the test suite |
