#!/usr/bin/env bash
# Ticket 0: the test bench on Devin's machine (Linux) or any Mac, in one command.
#   1. Chrome: found, or downloaded to ~/.local/chrome (no sudo). Headless when there is no display.
#   2. holo: ~/.venvs/holo with pip install "hai-agents[cli,browser]" when missing.
#   3. The mock official sites (scripts/bench/mock-sites.mjs) on NAMI_MOCK_SITES_PORT (3100).
#   4. scripts/lancer-demo.sh: the agent's Chrome on NAMI_AGENT_CHROME_PORT (9333), the bridge `holo local browser`
#      restarted in a loop, Nami (next dev on 3000) with NAMI_MOCK_SITES=on and NAMI_DOCUMENTS_DIR=fixtures/test-documents.
# Keys come from the environment (the Devin organisation secrets: HAI_API_KEY, GLADIA_API_KEY, LINKUP_API_KEY) or
# from .env.local; they are never printed. Logs: $TMPDIR/nami-demo/ and $TMPDIR/nami-bench/.
# Usage: scripts/bench/setup.sh [--port 9333] [--no-nami]    (--no-nami: Chrome, bridge and mocks only)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_DIR="${TMPDIR:-/tmp}/nami-bench"
mkdir -p "$LOG_DIR"
say() { printf '[bench-setup] %s\n' "$*"; }
die() { printf '[bench-setup] %s\n' "$*" >&2; exit 1; }

PORT="${NAMI_AGENT_CHROME_PORT:-9333}"
NO_NAMI=0
while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; shift 2 ;;
    --port=*) PORT="${1#*=}"; shift ;;
    --no-nami) NO_NAMI=1; shift ;;
    -h | --help) sed -n '2,11p' "$0"; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done
export NAMI_AGENT_CHROME_PORT="$PORT"

# Node (nvm on the Devin VM)
if ! command -v node > /dev/null 2>&1 && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
fi
command -v node > /dev/null 2>&1 || die "node not found (install Node 22 or nvm)"

# --- 1. Chrome
find_chrome() {
  if [ -n "${CHROME_BIN:-}" ] && [ -x "${CHROME_BIN:-}" ]; then echo "$CHROME_BIN"; return; fi
  local mac="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  [ -x "$mac" ] && { echo "$mac"; return; }
  local c
  for c in google-chrome google-chrome-stable chromium chromium-browser "$HOME/.local/bin/google-chrome" "$HOME/.local/chrome/opt/google/chrome/google-chrome"; do
    if command -v "$c" > /dev/null 2>&1; then command -v "$c"; return; fi
    [ -x "$c" ] && { echo "$c"; return; }
  done
}
CHROME="$(find_chrome || true)"
if [ -z "$CHROME" ] && [ "$(uname -s)" = "Linux" ]; then
  say "Chrome not found: downloading google-chrome-stable to ~/.local/chrome (no sudo)"
  mkdir -p "$HOME/.local/chrome"
  curl -fsSL -o "$LOG_DIR/chrome.deb" "https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb"
  dpkg -x "$LOG_DIR/chrome.deb" "$HOME/.local/chrome"
  CHROME="$HOME/.local/chrome/opt/google/chrome/google-chrome"
fi
[ -n "$CHROME" ] || die "Chrome not found (set CHROME_BIN)"
# No display (a VM without a desktop): Chrome runs headless; H only needs the DevTools port.
if [ -z "${DISPLAY:-}" ] && [ "$(uname -s)" = "Linux" ]; then
  WRAPPER="$LOG_DIR/chrome-headless.sh"
  printf '#!/usr/bin/env bash\nexec %q --headless=new --window-size=1280,900 --no-sandbox "$@"\n' "$CHROME" > "$WRAPPER"
  chmod +x "$WRAPPER"
  CHROME="$WRAPPER"
  say "No DISPLAY: Chrome will run headless"
fi
export CHROME_BIN="$CHROME"

# --- 2. holo
HOLO="${HOLO_BIN:-$(command -v holo || true)}"
if [ -z "$HOLO" ] && [ -x "$HOME/.venvs/holo/bin/holo" ]; then HOLO="$HOME/.venvs/holo/bin/holo"; fi
if [ -z "$HOLO" ]; then
  say 'Installing hai-agents[cli,browser] in ~/.venvs/holo'
  python3 -m venv "$HOME/.venvs/holo"
  "$HOME/.venvs/holo/bin/pip" install -q "hai-agents[cli,browser]"
  HOLO="$HOME/.venvs/holo/bin/holo"
fi
export HOLO_BIN="$HOLO"

# --- keys (never printed)
env_local() {
  local line value=""
  [ -f "$ROOT/.env.local" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in "$1"=*) value="${line#"$1"=}"; value="${value%\"}"; value="${value#\"}" ;; esac
  done < "$ROOT/.env.local"
  printf '%s' "$value"
}
for key in HAI_API_KEY GLADIA_API_KEY LINKUP_API_KEY; do
  if [ -z "${!key:-}" ]; then value="$(env_local "$key")"; [ -n "$value" ] && export "$key=$value"; fi
done
[ -n "${HAI_API_KEY:-}" ] || die "HAI_API_KEY is missing (environment or .env.local): the agent cannot run"
[ -n "${GLADIA_API_KEY:-}" ] || say "GLADIA_API_KEY missing: the voice check of the bench will be skipped"

# --- 3. Mock official sites
export NAMI_MOCK_SITES=on
export NAMI_MOCK_SITES_PORT="${NAMI_MOCK_SITES_PORT:-3100}"
export NAMI_MOCK_RESULTS_DIR="${NAMI_MOCK_RESULTS_DIR:-$ROOT/bench/mock-results}"
export NAMI_DOCUMENTS_DIR="${NAMI_DOCUMENTS_DIR:-$ROOT/fixtures/test-documents}"
[ -f "$NAMI_DOCUMENTS_DIR/manifest.json" ] || say "No manifest.json in $NAMI_DOCUMENTS_DIR: the bench stops at the passport step until Samy's fixtures are in"
if curl -fsS --max-time 2 -H "Host: evoa.test.localhost" "http://127.0.0.1:$NAMI_MOCK_SITES_PORT/__mock/result" > /dev/null 2>&1; then
  say "Mock sites already on port $NAMI_MOCK_SITES_PORT"
else
  nohup node "$ROOT/scripts/bench/mock-sites.mjs" --port "$NAMI_MOCK_SITES_PORT" > "$LOG_DIR/mock-sites.log" 2>&1 &
  sleep 1
  curl -fsS --max-time 2 -H "Host: evoa.test.localhost" "http://127.0.0.1:$NAMI_MOCK_SITES_PORT/__mock/result" > /dev/null || die "Mock sites did not start (log: $LOG_DIR/mock-sites.log)"
  say "Mock sites on http://evoa.test.localhost:$NAMI_MOCK_SITES_PORT and http://allindonesia.test.localhost:$NAMI_MOCK_SITES_PORT"
fi

# --- 4. Chrome, bridge, Nami
say "Starting the agent's Chrome, the H bridge and Nami (scripts/lancer-demo.sh --port $PORT)"
if [ "$NO_NAMI" = 1 ]; then
  say "--no-nami: start Nami yourself with the same environment (NAMI_MOCK_SITES=on, NAMI_DOCUMENTS_DIR, NAMI_LOCAL_SESSION_ID from .env.local)"
fi
cd "$ROOT"
exec bash scripts/lancer-demo.sh --port "$PORT"
