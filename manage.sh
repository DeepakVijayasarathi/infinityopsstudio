#!/usr/bin/env bash
# Server management for a Docker deployment of InfinityOps Studio (run from the project folder).
#
#   bash manage.sh make-admin you@company.com   create your admin account + workspace (asks for a password)
#   bash manage.sh remove-demo                  delete the demo company and demo users
#   bash manage.sh reset-password you@company.com
#   bash manage.sh status                       users, workspaces, demo data, AI engine
#   bash manage.sh connect-claude               use your Claude Pro/Max plan for all AI (no API key)
#   bash manage.sh disconnect-claude            switch back to the built-in demo AI
set -euo pipefail
cd "$(dirname "$0")"

die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
ok() { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
[ -f .env ] || die "No .env found. Run: bash deploy.sh"
command -v docker >/dev/null || die "Docker is not installed. Run: bash deploy.sh"

set_env() { if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi; }
get_env() { grep -m1 "^$1=" .env 2>/dev/null | cut -d= -f2- || true; }

# Run the admin script in the tools image with the app's environment.
admin() { docker compose run --rm -T -e NEW_PASSWORD -e NAME -e WORKSPACE_NAME --entrypoint npx migrate tsx scripts/admin.ts "$@"; }

ask_password() {
  local p1 p2
  read -rsp "New password (8+ characters, a letter and a number): " p1; echo
  read -rsp "Repeat password: " p2; echo
  [ "$p1" = "$p2" ] || die "Passwords don't match"
  export NEW_PASSWORD="$p1"
}

cmd="${1:-help}"
case "$cmd" in
  make-admin)
    email="${2:-}"; [ -n "$email" ] || die "Usage: bash manage.sh make-admin you@company.com"
    read -rp "Your name: " NAME; export NAME
    read -rp "Company / workspace name: " WORKSPACE_NAME; export WORKSPACE_NAME
    ask_password
    admin make-admin "$email"
    echo "Sign in at $(get_env APP_URL)/login with $email"
    ;;
  reset-password)
    email="${2:-}"; [ -n "$email" ] || die "Usage: bash manage.sh reset-password you@company.com"
    ask_password
    admin reset-password "$email"
    ;;
  remove-demo)
    read -rp "Delete the demo company (Northwind Growth) and demo users? This cannot be undone. [y/N] " yn
    [ "${yn,,}" = "y" ] || die "Cancelled"
    admin remove-demo
    set_env SEED_DEMO 0
    ok "Demo data will not be re-created."
    ;;
  status)
    admin status
    echo "AI engine: $(get_env AI_DEFAULT_PROVIDER)"
    ;;
  connect-claude)
    cat <<'TXT'

Connect your Claude Pro/Max plan
────────────────────────────────
1. On YOUR computer (not the server), install Claude Code if you don't have it:
     npm install -g @anthropic-ai/claude-code
2. Run:
     claude setup-token
   Sign in with your Claude account in the browser that opens.
   It prints a long token that starts with  sk-ant-oat...
3. Paste that token below. It is stored only in this server's .env file.

TXT
    read -rsp "Paste the token: " token; echo
    case "$token" in sk-ant-*) ;; *) die "That doesn't look like a Claude token (it should start with sk-ant-)";; esac
    set_env CLAUDE_CODE_OAUTH_TOKEN "$token"
    set_env AI_DEFAULT_PROVIDER claude-code
    set_env AI_REQUEST_TIMEOUT_MS 180000
    chmod 600 .env
    echo "Restarting the app with Claude…"
    docker compose up -d web worker >/dev/null
    sleep 5
    echo "Testing the connection (this takes a few seconds)…"
    if out=$(docker compose exec -T web sh -c 'cd /tmp && echo "Reply with exactly: connected" | claude -p --tools "" --no-session-persistence --model haiku' 2>&1) && echo "$out" | grep -qi connected; then
      ok "Claude is connected. All AI features now use your Claude plan."
    else
      echo "$out" | tail -5
      # Don't leave the app pointing at a Claude connection that doesn't work.
      set_env AI_DEFAULT_PROVIDER local
      docker compose up -d web worker >/dev/null
      die "The test failed, so AI stays on the built-in demo engine. Create a new token with: claude setup-token — then run: bash manage.sh connect-claude"
    fi
    ;;
  disconnect-claude)
    set_env AI_DEFAULT_PROVIDER local
    set_env CLAUDE_CODE_OAUTH_TOKEN ""
    docker compose up -d web worker >/dev/null
    ok "Switched back to the built-in demo AI."
    ;;
  *)
    sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
    ;;
esac
