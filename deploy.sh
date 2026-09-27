#!/usr/bin/env bash
# One-command deploy for InfinityOps Studio on a Linux server (Ubuntu/Debian).
#
#   git clone https://github.com/DeepakVijayasarathi/infinityopsstudio.git /opt/infinityops
#   cd /opt/infinityops && sudo bash deploy.sh
#
# Options (environment variables):
#   APP_URL=https://app.example.com  public URL (default: http://<server-ip>:<port>)
#   WEB_PORT=3000                    host port for the web app (default: 3000, or the next free port)
#   SEED_DEMO=0                      skip the demo workspace on first start
#   DOMAIN=app.example.com           also install Caddy for HTTPS on this domain (DNS must point here)
#   NO_BUILD=1                       start existing images without rebuilding
#
# Re-running pulls the latest code and redeploys; existing data and secrets are kept.
set -euo pipefail
cd "$(dirname "$0")"

log() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || command -v docker >/dev/null || die "Run as root (sudo bash deploy.sh) so Docker can be installed."

# ── Docker ──
if ! command -v docker >/dev/null; then
  log "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required (docker compose). Update Docker."
docker info >/dev/null 2>&1 || { systemctl start docker 2>/dev/null || true; docker info >/dev/null 2>&1 || die "Docker daemon is not running."; }

# ── Latest code ──
if [ -d .git ] && [ "${SKIP_PULL:-0}" != "1" ]; then
  log "Updating code"
  git pull --ff-only || echo "(git pull skipped: local changes or no network)"
fi

# ── Configuration ──
set_env() { # set_env KEY VALUE — replace or append in .env
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}
get_env() { grep -m1 "^$1=" .env 2>/dev/null | cut -d= -f2- || true; }

if [ ! -f .env ]; then
  log "Creating .env with fresh secrets"
  cp .env.example .env
  set_env AUTH_SECRET "$(openssl rand -hex 32)"
  set_env ENCRYPTION_KEY "$(openssl rand -hex 32)"
  set_env POSTGRES_PASSWORD "$(openssl rand -hex 16)"
  set_env SEED_DEMO "${SEED_DEMO:-1}"
fi
# Secrets are never regenerated on later runs (that would lock you out of encrypted data).
if grep -q '^AUTH_SECRET=dev-only' .env; then set_env AUTH_SECRET "$(openssl rand -hex 32)"; fi
if grep -q '^ENCRYPTION_KEY=0\{64\}$' .env; then set_env ENCRYPTION_KEY "$(openssl rand -hex 32)"; fi

# Port: an explicit WEB_PORT wins; otherwise keep the port chosen on an earlier run; otherwise
# start at 3000 and move up until a free port is found.
port_busy() {
  local p="$1"
  # Something is listening if a local TCP connection succeeds.
  (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null || return 1
  # Our own running web container holding the port doesn't count.
  docker compose port web 3000 2>/dev/null | grep -q ":$p\$" && return 1
  return 0
}
if [ -n "${WEB_PORT:-}" ]; then
  port_busy "$WEB_PORT" && die "Port $WEB_PORT is already in use by another program. Pick another: WEB_PORT=3100 bash deploy.sh"
else
  WEB_PORT="$(get_env DEPLOY_PORT)"
  WEB_PORT="${WEB_PORT:-3000}"
  start_port="$WEB_PORT"
  while port_busy "$WEB_PORT"; do
    WEB_PORT=$((WEB_PORT + 1))
    [ "$WEB_PORT" -lt $((start_port + 100)) ] || die "No free port found between $start_port and $WEB_PORT."
  done
  [ "$WEB_PORT" = "$start_port" ] || echo "Port $start_port is in use by another program; using $WEB_PORT instead."
fi

# Public URL: explicit APP_URL or DOMAIN wins; a custom URL you put in .env is kept;
# otherwise it is derived from the server IP and port.
SAVED_URL="$(get_env APP_URL)"
if [ -n "${DOMAIN:-}" ]; then
  APP_URL="${APP_URL:-https://$DOMAIN}"
elif [ -z "${APP_URL:-}" ]; then
  if [ -n "$SAVED_URL" ] && ! printf '%s' "$SAVED_URL" | grep -Eq '^http://(localhost|[0-9.]+)(:[0-9]+)?/?$'; then
    APP_URL="$SAVED_URL"
  else
    IP="$(curl -fsS -m 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
    APP_URL="http://${IP}:${WEB_PORT}"
  fi
fi

set_env NODE_ENV production
set_env APP_URL "$APP_URL"
set_env WEB_PORT "$WEB_PORT"
set_env DEPLOY_PORT "$WEB_PORT"
chmod 600 .env

# ── Build and start ──
if [ "${NO_BUILD:-0}" = "1" ]; then
  log "Starting existing images"
  docker compose up -d --no-build --remove-orphans
else
  log "Building and starting (first build takes a few minutes)"
  docker compose up -d --build --remove-orphans
fi

log "Waiting for the app to become ready"
for i in $(seq 1 60); do
  if curl -fsS -m 5 "http://127.0.0.1:${WEB_PORT}/api/ready" >/dev/null 2>&1; then READY=1; break; fi
  sleep 5
done
[ "${READY:-0}" = "1" ] || { docker compose ps; docker compose logs --tail 50 migrate web; die "App did not become ready. Logs are above."; }

# ── Optional HTTPS with Caddy ──
if [ -n "${DOMAIN:-}" ]; then
  log "Configuring HTTPS for ${DOMAIN}"
  command -v caddy >/dev/null || { apt-get update -y && apt-get install -y caddy; }
  printf '%s {\n  reverse_proxy 127.0.0.1:%s\n}\n' "$DOMAIN" "$WEB_PORT" > /etc/caddy/Caddyfile
  systemctl enable --now caddy && systemctl reload caddy
fi

docker compose ps
cat <<EOF

✓ InfinityOps Studio is running at ${APP_URL}
  (app port on this server: ${WEB_PORT} — open it in your firewall, or put a reverse proxy in front)

  Demo login:   demo@infinityops.studio / Demo12345!   (if demo data was seeded)
  Admin:        admin@infinityops.studio / Admin12345!  — change these passwords after signing in

  Logs:         docker compose logs -f web worker
  Update:       sudo bash deploy.sh
  Stop:         docker compose down
EOF
