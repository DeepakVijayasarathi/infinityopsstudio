# syntax=docker/dockerfile:1.7
# Multi-stage build for InfinityOps Studio.
#   target "web"   – minimal Next.js standalone server (default)
#   target "tools" – full toolchain for the background worker, migrations and seeding

ARG NODE_VERSION=22-bookworm-slim
ARG NODE_VERSION_FULL=22-bookworm

# OpenSSL 3 (CLI + libssl) for the Prisma engine, taken from the full image of the same Debian
# release so the build needs no apt mirror access. Node itself bundles its CA store.
FROM node:${NODE_VERSION_FULL} AS openssl
RUN mkdir /out && cp --parents /usr/bin/openssl /usr/lib/*-linux-gnu/libssl.so.3 /usr/lib/*-linux-gnu/libcrypto.so.3 /out/

# Run containers with an init process for signal handling (compose sets `init: true`).
FROM node:${NODE_VERSION} AS base
COPY --from=openssl /out/ /
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ── Dependencies ──
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
# Optional: builds behind a TLS-inspecting proxy can pass its CA with `--secret id=ca,src=/path/ca.pem`.
RUN --mount=type=cache,target=/root/.npm --mount=type=secret,id=ca,required=false \
  if [ -s /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
  npm ci --no-audit --no-fund

# ── Build ──
FROM deps AS builder
COPY . .
RUN --mount=type=secret,id=ca,required=false \
  if [ -s /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
  BUILD_STANDALONE=1 npm run build

# ── Worker / migrations / seed ──
FROM base AS tools
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY package.json package-lock.json tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY worker ./worker
USER node
CMD ["npx", "tsx", "worker/index.ts"]

# ── Web (default target) ──
FROM base AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 STORAGE_LOCAL_DIR=/app/storage
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
RUN mkdir -p /app/storage && chown node:node /app/storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
