# Deployment

InfinityOps Studio runs as two processes from one codebase — the **web** app and the **worker** — plus PostgreSQL 16 and Redis 7.

## One-command server deploy

```bash
git clone https://github.com/DeepakVijayasarathi/infinityopsstudio.git /opt/infinityops
cd /opt/infinityops && sudo bash deploy.sh
```

`deploy.sh` installs Docker when missing, pulls the latest code, creates `.env` on the first run (random `AUTH_SECRET`, `ENCRYPTION_KEY` and database password; existing secrets are never regenerated), sets `NODE_ENV=production` and `APP_URL`, runs `docker compose up -d --build`, and waits for `/api/ready`. Options: `APP_URL`, `WEB_PORT`, `SEED_DEMO=0`, `DOMAIN` (installs Caddy with automatic HTTPS) and `NO_BUILD=1`.

## Managing a live server

`manage.sh` (run in the project folder on the server) wraps admin commands for Docker deployments:

| Command | What it does |
|---|---|
| `bash manage.sh make-admin you@company.com` | Creates your super-admin account and company workspace (Enterprise plan), or promotes an existing user. Prompts for name, company and password |
| `bash manage.sh remove-demo` | Deletes the Northwind Growth demo workspace and demo users (refuses until another admin exists) and sets `SEED_DEMO=0` |
| `bash manage.sh reset-password you@company.com` | Sets a new password, unlocks the account and signs out every session |
| *(browser)* **Admin → Settings → Claude Pro / Max plan** | Paste a `claude setup-token` token; it's tested, stored encrypted and used by the web and worker containers within 30 seconds — no restart. Test and disconnect from the same card |
| `bash manage.sh connect-claude` | Uses a Claude Pro/Max plan for all AI via the bundled Claude Code CLI and a `claude setup-token` token; verifies it and falls back to demo AI if the test fails |
| `bash manage.sh disconnect-claude` | Switches back to the built-in demo AI |
| `bash manage.sh status` | Lists users, workspaces, demo data and the active AI engine |

Passwords are read interactively and passed to the container through the environment, never as command-line arguments. The images include Claude Code by default; build with `--build-arg INSTALL_CLAUDE_CODE=0` to leave it out.

## Connecting your website, WhatsApp and email

- **Website**: open **Website → Install** in the app and paste the snippet before `</body>` on your site. Add your domain under **Chat & forms → Allowed domains** so nobody else can use your key.
- **WhatsApp**: in Meta for Developers create a WhatsApp Business app, then in **Integrations → WhatsApp Business** enter the phone number ID, a permanent access token, the app secret and a verify token of your choice. Paste the webhook URL shown on the **Inbox** page (⚙) into the Meta app's webhook settings with the same verify token and subscribe to `messages`. Meta requires an `https://` URL, so set `DOMAIN` (or put the app behind your own TLS proxy).
- **Email**: point your provider's inbound route (Postmark, SendGrid Inbound Parse or Mailgun) at the inbound URL shown on the Inbox page. Replies are sent through the workspace SMTP integration or the platform SMTP settings.

## Docker Compose (single host)

```bash
cp .env.example .env
# Required: AUTH_SECRET and ENCRYPTION_KEY  (openssl rand -hex 32)
# Recommended: APP_URL, EMAIL_PROVIDER=smtp + SMTP_*, an AI provider key
docker compose up -d --build
docker compose ps
```

| Service | Image target | Purpose |
|---|---|---|
| `db` | `postgres:16-alpine` | Database (volume `pgdata`) |
| `redis` | `redis:7-alpine` | Queues and rate limits, AOF persistence, `noeviction` (volume `redisdata`) |
| `migrate` | `tools` | One-off: `prisma migrate deploy`, then seeds demo data if the database has no users and `SEED_DEMO=1` |
| `web` | `web` | Next.js standalone server on port 3000, health-checked via `/api/health` |
| `worker` | `tools` | BullMQ workers and the 60-second scheduler |

`web` and `worker` start only after `migrate` succeeds and the databases are healthy. Uploaded files go to the shared `storage` volume (or S3 with `STORAGE_DRIVER=s3`). Set `SEED_DEMO=0` for real deployments.

Useful commands:

```bash
docker compose logs -f web worker
docker compose run --rm migrate                               # re-run migrations after an upgrade
docker compose run --rm --entrypoint npx migrate tsx prisma/seed.ts   # reset the demo workspace
docker compose down            # stop (keeps volumes)
```

### Images

The multi-stage `Dockerfile` produces:

- **`web`** (default target, ≈570 MB) — Next.js standalone output on `node:22-bookworm-slim`, running as the unprivileged `node` user, with a built-in `HEALTHCHECK`.
- **`tools`** — full dependencies plus sources, for the worker, migrations and seeding.

OpenSSL for the Prisma engine is copied from the official `node:22-bookworm` image, so builds don't need Debian mirror access. Behind a TLS-inspecting proxy, pass its CA to the build:

```bash
docker build --secret id=ca,src=/path/to/proxy-ca.pem --target web -t infinityops-web .
```

## Other platforms

Any platform that runs containers or Node.js 20.11+ works (Fly.io, Render, Railway, ECS, Kubernetes, a VM).

1. Provision PostgreSQL 16 and Redis 7 (managed services recommended).
2. Set the environment from [ENVIRONMENT.md](ENVIRONMENT.md). At minimum: `NODE_ENV=production`, `APP_URL`, `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`.
3. Run migrations once per release, before starting the new version: `npx prisma migrate deploy` (the `tools` image, or a release command).
4. Web: `node server.js` in the `web` image — or, without Docker, `npm ci && npm run build && npm start`.
5. Worker: `npx tsx worker/index.ts` in the `tools` image — or `npm run worker`.
6. Health checks: liveness `GET /api/health`, readiness `GET /api/ready` (`503` if the database or Redis is unreachable).

### Scaling

- **Web** is stateless: run as many replicas as needed behind a load balancer. Sessions live in PostgreSQL; rate-limit counters live in Redis.
- **Worker** replicas share queues safely; the scheduler tick is a single repeatable BullMQ job, so it runs once per minute no matter how many workers exist. Per-queue concurrency is set in `worker/index.ts`.
- Use `STORAGE_DRIVER=s3` when running more than one web replica, so uploads are visible to all of them.
- Terminate TLS at the load balancer and forward `X-Forwarded-For`; rate limits and audit logs use it for the client IP.

## Production checklist

- [ ] `AUTH_SECRET` and `ENCRYPTION_KEY` are fresh random values stored in a secret manager (the app refuses to start with the development defaults).
- [ ] `APP_URL` is the public `https://` origin; add any other front-end origins to `ALLOWED_ORIGINS`.
- [ ] Demo seed disabled (`SEED_DEMO=0`) or seeded passwords changed; a real super admin created.
- [ ] `EMAIL_PROVIDER=smtp` with a verified sending domain (SPF, DKIM, DMARC).
- [ ] An AI provider key set, and a default model chosen in `/admin/settings`.
- [ ] Billing provider configured and its webhook endpoint registered with the provider.
- [ ] Database backups and point-in-time recovery enabled.
- [ ] Logs shipped to your log platform (stdout is structured JSON); alerts on `/api/ready` and on `level=error`.
- [ ] Google OAuth redirect URI registered, if using Google sign-in.

## Upgrades

1. Build new images (or pull them from your registry).
2. Run `prisma migrate deploy` with the new `tools` image.
3. Roll the `web` and `worker` services. Keep migrations backward-compatible with the previous release (additive first, destructive in a later release) so old and new versions can run side by side during the rollout.
