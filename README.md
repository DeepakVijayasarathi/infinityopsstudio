# InfinityOps Studio

**Your AI marketing operations team.** InfinityOps Studio is a multi-tenant SaaS platform where eight specialised AI workers plan campaigns, write on-brand content, run social, SEO and email, qualify leads and report on results — with human approval wherever it matters.

Built by [Infinity Uniquers](https://infinityuniquers.com).

## What's inside

| Area | Highlights |
|---|---|
| **Public website** | Home, features, pricing, about, contact, blog, privacy, terms · SEO metadata, sitemap, robots, dynamic Open Graph images |
| **Authentication** | Email + password, Google OAuth, email verification, password reset, account recovery, TOTP two-factor with recovery codes, refresh-token rotation with reuse detection, login lockout, rate limiting |
| **Workspaces** | Multiple workspaces per user, invitations, roles (Owner, Admin, Manager, Member, Viewer) with 32 fine-grained permissions |
| **AI Copilot** | Assistant on every page (⌘J): answers questions from live workspace data ("which leads should I call?", "how are we doing?") and proposes actions — campaigns, content, social drafts, leads, worker tasks — that run only after you approve |
| **One-click AI campaign** | Describe a goal; the AI team builds the campaign, strategy and tasks, a blog post, scheduled social drafts, an email and a follow-up automation, with live progress. Everything is a draft for review |
| **Smart insights** | Anomaly detection (sudden drops and spikes), week-over-week changes, hot leads needing follow-up, stalled deals, budget pacing, overdue approvals, failed posts and low open rates — each with a next step. Daily alerts and an automatic weekly AI report |
| **Setup wizard & templates** | Guided 5-minute setup that drafts your Brand Kit from your website, plus campaign, automation and email templates you can use in one click |
| **AI workers** | Nova (strategy), Quill (content), Pulse (social), Atlas (SEO), Echo (email), Blaze (ads), Lens (analytics) and Apex (growth) — task queue, approvals, chat, per-worker configuration and usage |
| **Campaigns** | Lifecycle with validated status transitions, approvals, AI strategy generation, tasks, budget and KPI tracking, performance charts |
| **Content Studio** | Streaming AI generator (blog posts, social posts, ads, landing pages, emails, product descriptions, SEO meta), rich editor with inline AI actions, version history and restore, sharing links, export (Markdown / HTML / text), internal-link suggestions |
| **Social** | Composer with per-platform previews, calendar, approvals, publishing to LinkedIn / X / Facebook / Instagram (or manual publishing), caption and hashtag AI, analytics |
| **SEO** | Projects, live page audits (16 checks), keyword tracking and AI keyword suggestions, competitor notes, opportunities, PDF reports |
| **Email** | Templates, segments, campaigns and sequences, AI writer, test sends, scheduling, open / click tracking, one-click unsubscribe (RFC 8058) |
| **Leads & CRM** | List and pipeline views, explainable scoring ("why this score" and the next best step), activities, notes, tasks, CSV import / export, bulk actions |
| **Automations** | Visual builder with 10 step types (condition, delay, AI action, assign worker, email, social post, update lead, webhook, notify, report) and 8 triggers, test runs, execution logs |
| **Analytics** | Traffic, leads, engagement, conversions, channel mix, campaign table, email and AI usage, CSV export, PDF reports |
| **Brand Kit** | Voice, audience, USPs, do's and don'ts, colours, logos — injected into every AI request |
| **Integrations** | LinkedIn, Meta (Facebook & Instagram), X, YouTube, SMTP and signed outgoing webhooks, with encrypted credentials and connection tests · CRM, ads and web-analytics connectors listed as coming soon |
| **Billing** | Free, Starter, Growth, Scale, Enterprise plans · usage metering · invoice billing, Stripe or Razorpay |
| **Platform admin** | Dashboard, users, workspaces, subscriptions, AI usage and costs, content, system logs, audit logs, feature flags, platform settings |
| **Everywhere** | ⌘K command palette and global search, notifications, dark mode, responsive layouts with mobile navigation |

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL 16 + Prisma 6 · Redis 7 + BullMQ · Anthropic, OpenAI, Google and local Claude Code AI providers · Recharts · Tiptap · Vitest · Playwright · Docker.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it fits together.

## Quick start (local)

Prerequisites: Node.js 20.11+ (22 recommended), PostgreSQL 16, Redis 7.

```bash
npm install
cp .env.example .env              # works as-is for local development
npm run db:migrate                # apply migrations
npm run db:seed                   # demo workspace, users and 90 days of data
npm run dev                       # http://localhost:3000
npm run worker                    # in a second terminal: background jobs and scheduler
```

No API keys are needed: with `AI_DEFAULT_PROVIDER=local` every AI feature runs on a deterministic offline provider (clearly labelled *Infinity Local* in the UI). Add `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `GOOGLE_AI_API_KEY` to use real models.

### Use your own Claude, without an API key

If [Claude Code](https://claude.com/claude-code) is installed and signed in on the machine running the app, every AI feature can run through it on your Claude plan:

```bash
npm install -g @anthropic-ai/claude-code   # if not installed
claude                                     # sign in once, then exit
```

Then in `.env`:

```bash
AI_DEFAULT_PROVIDER=claude-code
AI_REQUEST_TIMEOUT_MS=180000
```

Restart `npm run dev` and `npm run worker`. Models show up as *Claude Opus / Sonnet / Haiku (local Claude Code)*; Sonnet is the default. The CLI runs with every tool disabled, so it only generates text. This is meant for running the app on your own machine — for a hosted, multi-user deployment use `ANTHROPIC_API_KEY`.

Without Redis, background jobs run in-process so the app still works end to end; the worker process requires Redis.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Owner | demo@infinityops.studio | Demo12345! |
| Manager | sarah@northwindgrowth.com | Demo12345! |
| Member | raj@northwindgrowth.com | Demo12345! |
| Viewer | lena@northwindgrowth.com | Demo12345! |
| Super admin (`/admin`) | admin@infinityops.studio | Admin12345! |

Change these with `SEED_DEMO_PASSWORD` / `SEED_ADMIN_PASSWORD` before seeding anything reachable from the internet.

## Deploy to a server (one command)

On a fresh Ubuntu/Debian server, as root:

```bash
git clone https://github.com/DeepakVijayasarathi/infinityopsstudio.git /opt/infinityops
cd /opt/infinityops && bash deploy.sh
```

`deploy.sh` installs Docker if needed, creates `.env` with fresh secrets on the first run, builds and starts the stack, waits until it is healthy and prints the URL. Add `DOMAIN=app.example.com bash deploy.sh` to serve it over HTTPS with Caddy (point the domain's DNS at the server first). Run it again any time to update; data and secrets are kept.

### Go live with your own business

```bash
cd /opt/infinityops
bash manage.sh make-admin you@yourcompany.com   # your admin account + company workspace
bash manage.sh remove-demo                      # delete the demo company and demo users
bash manage.sh connect-claude                   # optional: AI on your Claude Pro/Max plan
bash manage.sh status
```

`connect-claude` asks for a token from `claude setup-token` (run it on your own computer, signed in to your Claude account), stores it only in the server's `.env`, switches every AI feature to Claude and verifies the connection — if the test fails it stays on the built-in demo AI. The Docker images include the Claude Code CLI for this. Usage counts against your Claude plan's limits; for a public, multi-customer service use `ANTHROPIC_API_KEY` instead.

## Docker

```bash
cp .env.example .env
# set AUTH_SECRET and ENCRYPTION_KEY:  openssl rand -hex 32
docker compose up --build
```

This starts PostgreSQL, Redis, a one-off `migrate` job (applies migrations and seeds demo data into an empty database), the web app on port 3000 and the background worker. Details in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` / `npm start` | Production build / server |
| `npm run worker` | BullMQ workers + scheduler (every 60 s) |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm test` | Unit + integration tests (needs PostgreSQL, uses `TEST_DATABASE_URL`) |
| `npm run test:unit` | Unit tests only (no database) |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run check` | Lint, typecheck, tests and build — the full quality gate |
| `npm run db:migrate` · `npm run db:migrate:dev` | Apply migrations · create a new migration while developing |
| `npm run db:seed` | Demo data (re-running resets the demo workspace) |

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — components, request flow, background jobs
- [API](docs/API.md) — conventions and all 166 endpoints
- [Database](docs/DATABASE.md) — schema, tenancy, indexes, migrations
- [AI architecture](docs/AI_ARCHITECTURE.md) — providers, models, prompts, cost tracking
- [Environment](docs/ENVIRONMENT.md) — every configuration variable
- [Deployment](docs/DEPLOYMENT.md) — Docker, production checklist, scaling
- [Security](docs/SECURITY.md) — auth, RBAC, tenant isolation, headers, secrets
- [Testing](docs/TESTING.md) — test suites and how to run them

## License

Proprietary © Infinity Uniquers. All rights reserved.
