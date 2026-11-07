#!/usr/bin/env bash
# Starts everything the demo needs, in order:
#   1. the agent's dedicated Chrome (own profile, debugging port, never put to sleep),
#   2. the H bridge `holo local browser` on that port, with a fixed session id, restarted if it stops,
#   3. Nami (`npm run dev`).
# Ctrl+C stops the bridge and Nami; the agent's Chrome stays open.
# Never prints the H key.
#
# Usage: scripts/lancer-demo.sh [--port 9333]
# Env:   NAMI_AGENT_CHROME_PORT (9333), NAMI_AGENT_CHROME_PROFILE (~/chrome-for-agents),
#        NAMI_LOCAL_SESSION_ID (UUID, else kept in ~/.config/nami/local-browser-session-id),
#        CHROME_BIN, HOLO_BIN.
set -euo pipefail
set +x

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${NAMI_AGENT_CHROME_PORT:-9333}"
PROFILE="${NAMI_AGENT_CHROME_PROFILE:-$HOME/chrome-for-agents}"
STATE_DIR="$HOME/.config/nami"
LOG_DIR="${TMPDIR:-/tmp}/nami-demo"

say() { printf '[lancer-demo] %s\n' "$*"; }
die() { printf '[lancer-demo] %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; shift 2 ;;
    --port=*) PORT="${1#*=}"; shift ;;
    -h | --help) sed -n '2,12p' "$0"; exit 0 ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
done
[[ "$PORT" =~ ^[0-9]+$ ]] || die "Port must be a number, got: $PORT"
mkdir -p "$STATE_DIR" "$LOG_DIR"

# --- H key: holo reads HAI_API_KEY, else ~/.config/hai/.env. Take it from .env.local if needed, without printing it.
if [ -z "${HAI_API_KEY:-}" ] && [ -f "$ROOT/.env.local" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      HAI_API_KEY=*)
        value="${line#HAI_API_KEY=}"
        value="${value%\"}"; value="${value#\"}"; value="${value%\'}"; value="${value#\'}"
        [ -n "$value" ] && export HAI_API_KEY="$value"
        ;;
    esac
  done < "$ROOT/.env.local"
  unset line value
fi
if [ -z "${HAI_API_KEY:-}" ] && ! grep -qs '^HAI_API_KEY=.' "${XDG_CONFIG_HOME:-$HOME/.config}/hai/.env"; then
  die "No H key: set HAI_API_KEY in .env.local, or run: holo login --key"
fi

# --- holo CLI
HOLO="${HOLO_BIN:-$(command -v holo || true)}"
[ -z "$HOLO" ] && [ -x "$HOME/.venvs/holo/bin/holo" ] && HOLO="$HOME/.venvs/holo/bin/holo"
[ -n "$HOLO" ] || die 'holo not found: pip install "hai-agents[cli,browser]" (or set HOLO_BIN)'

# --- Fixed session id (the bridge only accepts a UUID)
SESSION_ID="${NAMI_LOCAL_SESSION_ID:-}"
if [ -z "$SESSION_ID" ] && [ -s "$STATE_DIR/local-browser-session-id" ]; then
  SESSION_ID="$(tr -d '[:space:]' < "$STATE_DIR/local-browser-session-id")"
fi
if [ -z "$SESSION_ID" ]; then
  SESSION_ID="$(python3 -c 'import uuid; print(uuid.uuid4())' 2>/dev/null || uuidgen | tr '[:upper:]' '[:lower:]')"
  printf '%s\n' "$SESSION_ID" > "$STATE_DIR/local-browser-session-id"
fi
[[ "$SESSION_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] \
  || die "Session id must be a UUID, got: $SESSION_ID"

# --- 1. Agent's Chrome
chrome_up() { curl -fsS --max-time 2 "http://127.0.0.1:$PORT/json/version" > /dev/null 2>&1; }

find_chrome() {
  if [ -n "${CHROME_BIN:-}" ]; then echo "$CHROME_BIN"; return; fi
  local mac="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  if [ -x "$mac" ]; then echo "$mac"; return; fi
  local c
  for c in google-chrome google-chrome-stable chromium chromium-browser; do
    if command -v "$c" > /dev/null 2>&1; then command -v "$c"; return; fi
  done
}

if chrome_up; then
  PROFILE="(Chrome already running)"
  say "A Chrome already listens on port $PORT: reusing it."
  say "If it was not started by this script, quit it and run the script again (it needs the no-sleep flags)."
else
  CHROME="$(find_chrome)"
  [ -n "$CHROME" ] || die "Chrome not found (set CHROME_BIN)"
  nohup "$CHROME" \
    --remote-debugging-port="$PORT" \
    --user-data-dir="$PROFILE" \
    --disable-backgrounding-occluded-windows \
    --disable-renderer-backgrounding \
    --disable-background-timer-throttling \
    --disable-features=Translate \
    --no-first-run \
    --no-default-browser-check \
    > "$LOG_DIR/chrome.log" 2>&1 &
  for _ in $(seq 1 40); do chrome_up && break; sleep 0.5; done
  chrome_up || die "Chrome did not open port $PORT (log: $LOG_DIR/chrome.log)"
  say "Agent's Chrome started: port $PORT, profile $PROFILE"
fi

# --- 2. H bridge, restarted whenever it stops (it ends with each agent session)
BRIDGE_LOG="$LOG_DIR/holo-local-browser.log"
: > "$BRIDGE_LOG"
(
  trap 'exit 0' INT TERM
  quick=0
  while true; do
    started=$(date +%s)
    "$HOLO" local browser --session-id "$SESSION_ID" --debug-port "$PORT" >> "$BRIDGE_LOG" 2>&1 && code=0 || code=$?
    if [ $(($(date +%s) - started)) -lt 5 ]; then quick=$((quick + 1)); else quick=0; fi
    if [ "$quick" -ge 3 ]; then
      say "The H bridge keeps failing (code $code), giving up. Last lines of $BRIDGE_LOG:" >&2
      tail -n 5 "$BRIDGE_LOG" >&2
      exit 1
    fi
    say "H bridge stopped (code $code), restarting in 2 s with the same session id."
    sleep 2
  done
) &
BRIDGE_PID=$!

cleanup() {
  trap - EXIT INT TERM
  if kill -0 "$BRIDGE_PID" 2> /dev/null; then
    pkill -P "$BRIDGE_PID" 2> /dev/null || true
    kill "$BRIDGE_PID" 2> /dev/null || true
  fi
  say "H bridge stopped. The agent's Chrome stays open (port $PORT)."
}
trap cleanup EXIT INT TERM

sleep 3
kill -0 "$BRIDGE_PID" 2> /dev/null || die "The H bridge did not start (log: $BRIDGE_LOG)"

cat << INFO

  Agent's Chrome   port $PORT, profile $PROFILE
  H bridge         holo local browser (log: $BRIDGE_LOG)
  Session id       $SESSION_ID

  In Nami, open http://localhost:3000/?demo=1 and paste the session id
  in "Local browser session". It stays the same from one launch to the next.
  Keep the agent's Chrome window visible on screen during the demo.

INFO

# --- 3. Nami
cd "$ROOT"
if curl -fsS --max-time 2 -o /dev/null http://localhost:3000; then
  say "Nami already runs on http://localhost:3000: keeping only the H bridge alive. Ctrl+C to stop it."
  wait "$BRIDGE_PID" || exit 1
  exit 0
fi
if ! command -v npm > /dev/null 2>&1 && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
fi
command -v npm > /dev/null 2>&1 || die "npm not found"
npm run dev
