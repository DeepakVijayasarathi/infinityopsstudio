# Security

This document describes the controls built into InfinityOps Studio and what operators must configure. Report vulnerabilities privately to security@infinityuniquers.com.

## Authentication

| Control | Implementation |
|---|---|
| Password storage | bcrypt, cost 12. Policy: 8–128 characters with at least one letter and one number |
| Login lockout | 5 consecutive failures lock the account for 15 minutes; a successful login resets the counter |
| Enumeration resistance | Unknown email and wrong password return the same error; for unknown users a dummy bcrypt comparison equalises timing. Password-reset and recovery requests always report success |
| Sessions | 256-bit random opaque tokens in an httpOnly `SameSite=Lax` cookie (`Secure` in production). Only the SHA-256 hash is stored. 24-hour sliding sessions, or 30 days with *remember me* |
| Token rotation | Active sessions get a new token every 15 minutes. The previous token is honoured for a 60-second grace window (parallel requests); presenting it after that is treated as theft — the whole session is revoked and `auth.session.reuse_detected` is audited |
| Two-factor | TOTP (RFC 6238, 6 digits, 30 s, ±1 step) with a QR code at setup, confirmed before enabling. 10 single-use recovery codes, stored hashed. Password sign-in with 2FA creates a *pending* session that grants no access until the second factor is verified |
| Account recovery | For users who lost their authenticator: an emailed, single-use link lets them set a new password, which disables 2FA and revokes every session |
| Session management | Users see active sessions (device, IP, last use) and can revoke one or all others. Password changes revoke other sessions |
| Google OAuth | Authorization-code flow with PKCE and a `state` cookie; an existing account is linked only when Google reports the email as verified |
| Email verification | Signed, single-use, expiring links. Admins can require verification before any changes (`requireEmailVerification`) |
| Rate limits | Per-IP / per-user fixed windows on login, signup, password reset, recovery, 2FA, invitations, search and inbound webhooks (Redis, with an in-memory fallback) |

## Authorisation

### Roles and permissions

Five system roles, each with a rank. A member can never grant a role above their own, change the role of someone ranked above them, or remove someone of equal or higher rank; the last owner can't be demoted.

| Permission | Owner | Admin | Manager | Member | Viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| All `*:read` (campaigns, content, social, SEO, email, leads, automations, workers, analytics) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create and edit work (`campaigns:write`, `content:write`, `social:write`, `seo:write`, `email:write`, `leads:write`, `automations:write`, `workers:run`) | ✓ | ✓ | ✓ | ✓ | |
| Approve and publish (`tasks:approve`, `campaigns:approve`, `content:approve`, `social:publish`, `email:send`), delete leads, configure workers, manage the Brand Kit | ✓ | ✓ | ✓ | | |
| View billing (`billing:view`) | ✓ | ✓ | ✓ | | |
| Manage members, integrations, billing and workspace settings; read the audit log | ✓ | ✓ | | | |
| Delete the workspace (`workspace:delete`) | ✓ | | | | |

Permissions are enforced on the server — in `route()` for every API call and in `requirePagePermission()` for every page. The UI hides actions a member can't take, but hiding is never the control.

**Platform administrators** (`User.platformRole = SUPER_ADMIN`) access `/admin` and `/api/v1/admin/*`. They are created by the seed or promoted by another super admin; every admin action is audited.

### Tenant isolation

- The workspace for a request comes from `x-workspace-id`, the `ios_ws` cookie or the user's last workspace, and is only accepted after a membership lookup (`resolveWorkspace`).
- Services receive that `WorkspaceContext` and filter every query by `workspaceId`; single records are fetched with `findFirst({ where: { id, workspaceId } })`, so ids from other workspaces return `404`, not `403`, and leak nothing.
- References inside a request (a campaign on a content item, an owner on a lead, a worker on a task) are validated to belong to the same workspace before writing.
- Integration tests (`tests/integration/tenancy.test.ts`) assert cross-workspace reads, updates and deletes fail.

## Web protections

- **CSRF**: `SameSite=Lax` cookies plus middleware that rejects state-changing API requests whose `Origin`/`Referer` doesn't match the host the request was sent to, `APP_URL` or an `ALLOWED_ORIGINS` entry. Signature-authenticated endpoints (billing webhooks, workflow hooks, email tracking, unsubscribe) are exempt.
- **Security headers** (all responses): Content-Security-Policy (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, restricted `form-action`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`, and HSTS with preload in production. `X-Powered-By` is removed. `script-src` allows `'unsafe-inline'` because Next.js injects inline bootstrap scripts.
- **XSS**: React escapes output by default. User and AI Markdown is rendered with `marked` and sanitised with `sanitize-html` on the server and DOMPurify in the browser; shared content pages render sanitised HTML only.
- **SSRF**: URLs fetched on a user's behalf (SEO audits, outgoing webhooks) must be `http(s)`, resolve to public addresses (private, loopback, link-local, CGNAT and multicast ranges are refused) and are re-checked on every redirect.
- **Uploads**: type is detected from magic bytes (PNG, JPEG, GIF, WebP, PDF, CSV); the client's MIME type is ignored. Size is capped by `MAX_UPLOAD_BYTES`. Files are stored under random keys and served through short-lived HMAC-signed URLs with `nosniff` and `attachment` disposition for non-images.
- **CSV exports** neutralise spreadsheet formula injection (`=`, `+`, `-`, `@` prefixes).
- **Email**: click tracking redirects are HMAC-signed, so they can't be used as open redirects. Unsubscribe links show a confirmation page and unsubscribe via `POST` (RFC 8058 one-click), so link scanners can't unsubscribe people.
- **Input validation**: every API body and query is parsed with zod; request bodies are capped at 1 MB.

## Secrets and data protection

- Secrets live in environment variables only (see [ENVIRONMENT.md](ENVIRONMENT.md)); none are sent to the browser. AI, billing, email and storage calls happen server-side.
- The app refuses to start in production with the development `AUTH_SECRET` or an all-zero `ENCRYPTION_KEY`.
- Integration credentials and TOTP secrets are encrypted with AES-256-GCM (`ENCRYPTION_KEY`, random 96-bit IV per value, authenticated). Session, verification, invite and recovery tokens are stored only as SHA-256 hashes.
- Webhooks: Stripe signatures are verified with a 5-minute timestamp tolerance; Razorpay signatures with HMAC-SHA256; comparisons are constant-time.
- Logs never include passwords, tokens or credentials. `AIRequest` keeps only a 280-character prompt preview.
- Users can delete their account (`DELETE /api/v1/users/me`); owners can delete a workspace, which cascades to all of its data.

## Audit trail

`AuditLog` records sign-ins and failures, 2FA changes, session revocations and reuse detection, password changes, role and membership changes, invitations, integration connections, plan changes, deletions, approvals and admin actions — with actor, workspace, entity, IP and user agent. Super admins browse and filter it at `/admin/audit`.

## Operator checklist

- [ ] Set `AUTH_SECRET` and `ENCRYPTION_KEY` to fresh random values (`openssl rand -hex 32`) and store them in a secret manager.
- [ ] Serve only over HTTPS and set `APP_URL` to the public origin.
- [ ] Change or disable the seeded demo and admin accounts (`SEED_*_PASSWORD`, or don't seed production).
- [ ] Use managed PostgreSQL and Redis on a private network with TLS and backups.
- [ ] Configure webhook secrets (`STRIPE_WEBHOOK_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) before enabling those providers.
- [ ] Put a WAF or CDN rate limiting in front of the app for volumetric protection.
- [ ] Keep dependencies patched (`npm audit` reports no known vulnerabilities at release).
