#!/usr/bin/env bash
# Starts everything the demo needs, in order:
#   1. the agent's dedicated Chrome (own profile, debugging port, never put to sleep, pixel density 1),
#   2. the H bridge `holo local browser` on that port, with a fixed session id, restarted if it stops,
#   3. Nami (`npm run dev`).
# Ctrl+C stops the bridge and Nami; the agent's Chrome stays open.
# Never prints the H key. Prints the NAMI_LOCAL_SESSION_ID line to put in .env.local.
#
# Usage: scripts/lancer-demo.sh [--port 9333]
# Env:   NAMI_AGENT_CHROME_PORT (9333), NAMI_AGENT_CHROME_PROFILE (~/chrome-for-agents),
#        NAMI_LOCAL_SESSION_ID (UUID, else from .env.local, else kept in ~/.config/nami/local-browser-session-id),
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
export NAMI_AGENT_CHROME_PORT="$PORT"
mkdir -p "$STATE_DIR" "$LOG_DIR"

# Value of one variable of .env.local (the last one wins), without printing it.
env_local() {
  local line value=""
  [ -f "$ROOT/.env.local" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      "$1"=*)
        value="${line#"$1"=}"
        value="${value%\"}"; value="${value#\"}"; value="${value%\'}"; value="${value#\'}"
        ;;
    esac
  done < "$ROOT/.env.local"
  printf '%s' "$value"
}

# --- H key: holo reads HAI_API_KEY, else ~/.config/hai/.env. Take it from .env.local if needed, without printing it.
if [ -z "${HAI_API_KEY:-}" ]; then
  value="$(env_local HAI_API_KEY)"
  [ -n "$value" ] && export HAI_API_KEY="$value"
  unset value
fi
if [ -z "${HAI_API_KEY:-}" ] && ! grep -qs '^HAI_API_KEY=.' "${XDG_CONFIG_HOME:-$HOME/.config}/hai/.env"; then
  die "No H key: set HAI_API_KEY in .env.local, or run: holo login --key"
fi

# --- holo CLI
HOLO="${HOLO_BIN:-$(command -v holo || true)}"
[ -z "$HOLO" ] && [ -x "$HOME/.venvs/holo/bin/holo" ] && HOLO="$HOME/.venvs/holo/bin/holo"
[ -n "$HOLO" ] || die 'holo not found: pip install "hai-agents[cli,browser]" (or set HOLO_BIN)'

# --- Fixed session id (the bridge only accepts a UUID)
ENV_LOCAL_SESSION_ID="$(env_local NAMI_LOCAL_SESSION_ID | tr -d '[:space:]')"
SESSION_ID="${NAMI_LOCAL_SESSION_ID:-$ENV_LOCAL_SESSION_ID}"
if [ -z "$SESSION_ID" ] && [ -s "$STATE_DIR/local-browser-session-id" ]; then
  SESSION_ID="$(tr -d '[:space:]' < "$STATE_DIR/local-browser-session-id")"
fi
if [ -z "$SESSION_ID" ]; then
  SESSION_ID="$(python3 -c 'import uuid; print(uuid.uuid4())' 2>/dev/null || uuidgen | tr '[:upper:]' '[:lower:]')"
  printf '%s\n' "$SESSION_ID" > "$STATE_DIR/local-browser-session-id"
fi
[[ "$SESSION_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] \
  || die "Session id must be a UUID, got: $SESSION_ID"
# The Nami started below reads it: /api/papers/start uses it when the side panel sends no session.
export NAMI_LOCAL_SESSION_ID="$SESSION_ID"
export NAMI_BRIDGE_CHANNEL_FILE="$STATE_DIR/bridge-channel"
rm -f "$NAMI_BRIDGE_CHANNEL_FILE"

load_node() {
  if ! command -v node > /dev/null 2>&1 && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  fi
}

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

# Only reuse a Chrome started with the agent's own profile, never a personal one.
# Checks the process that actually owns the port, not just any Chrome with these args.
agent_chrome_running() {
  local pid args
  command -v lsof > /dev/null 2>&1 || die "lsof not found: cannot check which browser owns port $PORT"
  pid="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2> /dev/null | sed -n 1p || true)"
  [ -n "$pid" ] || return 1
  args="$(ps -o args= -p "$pid" 2> /dev/null || true)"
  case " $args " in *" --remote-debugging-port=$PORT "*) ;; *) return 1 ;; esac
  case " $args " in *" --user-data-dir=$PROFILE "*) return 0 ;; esac
  return 1
}

# Pixel density of the agent's Chrome, read in every tab through DevTools (Runtime.evaluate): tabs in windows on
# different screens can differ. Opens a blank tab if there is none. Prints the first density that is not 1, else 1, or "error".
chrome_scale() {
  NAMI_CDP_PORT="$PORT" node - << 'JS'
const base = `http://127.0.0.1:${process.env.NAMI_CDP_PORT}`;
const done = (text) => { console.log(text); process.exit(0); };
setTimeout(() => done("error"), 8000);
const scaleOf = (url) => new Promise((resolve, reject) => {
  const ws = new WebSocket(url);
  ws.onerror = () => reject(new Error("socket"));
  ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: "window.devicePixelRatio", returnByValue: true } }));
  ws.onmessage = (event) => {
    const reply = JSON.parse(String(event.data));
    if (reply.id !== 1) return;
    ws.close();
    const value = reply.result?.result?.value;
    if (typeof value === "number") resolve(value); else reject(new Error("value"));
  };
});
(async () => {
  let tabs = (await (await fetch(`${base}/json`)).json()).filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
  if (!tabs.length) tabs = [await (await fetch(`${base}/json/new?about:blank`, { method: "PUT" })).json()];
  for (const tab of tabs) {
    const scale = await scaleOf(tab.webSocketDebuggerUrl);
    if (scale !== 1) done(String(scale));
  }
  done("1");
})().catch(() => done("error"));
JS
}

if chrome_up; then
  agent_chrome_running || die "Port $PORT is used by a browser that is not the agent's Chrome (profile $PROFILE). Quit it, or use --port."
  load_node
  command -v node > /dev/null 2>&1 || die "node not found: cannot check the pixel density of the agent's Chrome"
  scale="$(chrome_scale)"
  case "$scale" in
    1) ;;
    error) die "Could not read the pixel density of the agent's Chrome on port $PORT. Quit that Chrome, then run this script again." ;;
    *) die "The agent's Chrome on port $PORT has a pixel density of $scale, not 1: H's clicks would land at the wrong place. Quit that Chrome (profile $PROFILE), then run this script again: it starts Chrome with --force-device-scale-factor=1. Keep the page zoom at 100%." ;;
  esac
  say "The agent's Chrome already listens on port $PORT (pixel density 1): reusing it."
else
  CHROME="$(find_chrome)"
  [ -n "$CHROME" ] || die "Chrome not found (set CHROME_BIN)"
  # --force-device-scale-factor=1: Retina: without it, H's clicks land at twice their coordinates (measured on 2026-11-07).
  nohup "$CHROME" \
    --remote-debugging-port="$PORT" \
    --force-device-scale-factor=1 \
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
    # Nami writes a new channel here before each H session (lib/local-bridge.ts).
    CHANNEL="$(tr -d '[:space:]' < "$NAMI_BRIDGE_CHANNEL_FILE" 2> /dev/null || true)"
    [[ "$CHANNEL" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] || CHANNEL="$SESSION_ID"
    "$HOLO" local browser --session-id "$CHANNEL" --debug-port "$PORT" >> "$BRIDGE_LOG" 2>&1 && code=0 || code=$?
    if [ $(($(date +%s) - started)) -lt 5 ]; then quick=$((quick + 1)); else quick=0; fi
    if [ "$quick" -ge 3 ]; then
      say "The H bridge keeps failing (code $code), giving up. Last lines of $BRIDGE_LOG:" >&2
      tail -n 5 "$BRIDGE_LOG" >&2
      kill -TERM $$ 2> /dev/null
      exit 1
    fi
    # 1 s: Nami kills a used bridge before each new H session (lib/local-bridge.ts) and waits for this restart.
    say "H bridge stopped (code $code), restarting in 1 s with the same session id."
    sleep 1
  done
) &
BRIDGE_PID=$!

# npm run dev starts next as a grandchild: stop the whole tree, not just npm.
kill_tree() {
  local child
  for child in $(pgrep -P "$1" 2> /dev/null); do kill_tree "$child"; done
  kill -TERM "$1" 2> /dev/null || true
}

NAMI_PID=""
cleanup() {
  trap - EXIT INT TERM
  [ -n "$NAMI_PID" ] && kill_tree "$NAMI_PID"
  kill_tree "$BRIDGE_PID"
  say "H bridge stopped. The agent's Chrome stays open (port $PORT)."
}
trap cleanup EXIT INT TERM

sleep 3
kill -0 "$BRIDGE_PID" 2> /dev/null || die "The H bridge did not start (log: $BRIDGE_LOG)"

# .env.local: the session id and the bridge log, read by the Nami started below (or by one started by hand).
set_env_local() {
  local file="$ROOT/.env.local"
  touch "$file"
  if grep -q "^$1=" "$file"; then
    local tmp; tmp="$(mktemp)"
    # grep -v returns 1 when nothing else is in the file: not an error here.
    { grep -v "^$1=" "$file" || true; } > "$tmp"
    printf '%s=%s\n' "$1" "$2" >> "$tmp" && mv "$tmp" "$file"
  else
    printf '%s=%s\n' "$1" "$2" >> "$file"
  fi
}
set_env_local NAMI_LOCAL_SESSION_ID "$SESSION_ID"
set_env_local NAMI_BRIDGE_LOG "$BRIDGE_LOG"
export NAMI_BRIDGE_LOG="$BRIDGE_LOG"

if [ "$ENV_LOCAL_SESSION_ID" = "$SESSION_ID" ]; then
  ENV_LOCAL_HINT="Already in .env.local, so the side panel needs no setting:"
else
  ENV_LOCAL_HINT="Written to .env.local (restart any Nami not started by this script):"
fi

cat << INFO

  Agent's Chrome   port $PORT, profile $PROFILE
  H bridge         holo local browser (log: $BRIDGE_LOG)
  Session id       $SESSION_ID (the same from one launch to the next)

  $ENV_LOCAL_HINT

      NAMI_LOCAL_SESSION_ID=$SESSION_ID

  Keep the agent's Chrome window visible on screen during the demo.

INFO

# --- 3. Nami
cd "$ROOT"
# Any HTTP answer means the port is taken; -L follows the /access redirect of a protected Nami.
status="$(curl -sSL --max-time 5 -o "$LOG_DIR/port-3000.html" -w '%{http_code}' http://localhost:3000 2> /dev/null || true)"
if [ -n "$status" ] && [ "$status" != "000" ]; then
  grep -qF "Nami prepares your trip" "$LOG_DIR/port-3000.html" ||
    die "Port 3000 is used by another app. Stop it, then run the script again."
  say "Nami already runs on http://localhost:3000: keeping only the H bridge alive. Ctrl+C to stop it."
  say "That Nami must use Chrome port $PORT: put NAMI_AGENT_CHROME_PORT=$PORT in .env.local and restart it, or stop it and run this script again."
  wait "$BRIDGE_PID" || exit 1
  exit 0
fi
command -v npm > /dev/null 2>&1 || load_node
command -v npm > /dev/null 2>&1 || die "npm not found"
# In the background so that a bridge that gives up stops the whole demo (it signals this script).
npm run dev &
NAMI_PID=$!
wait "$NAMI_PID"
