// Bench only (ticket 17, measured on the Mac 2026-11-08): the H bridge `holo local browser` creates one chromedriver
// per process and keeps it after H sends `destroy` at the end of a session. Until H answers 410 on its long-poll
// (20 to 45 s later), the bridge is still there with a dead chromedriver: every session created meanwhile fails on
// each command ("Max retries exceeded" on the chromedriver port). So before a new H session, if the current bridge
// process already served one, Nami kills it: scripts/lancer-demo.sh restarts it in 1 s with the same session id.

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";

export const BRIDGE_READY_LINE = "Local web bridge serving session id";
// Written by the bridge when H ends a session: from then on its chromedriver is dead.
export const BRIDGE_DESTROY_LINE = "command destroy";
const NEW_PID_TIMEOUT_MS = 20_000;
const READY_TIMEOUT_MS = 20_000;
const READY_FALLBACK_MS = 4_000;
const POLL_MS = 500;

export type BridgeDeps = {
  pgrep: () => Promise<number | null>;
  kill: (pid: number) => Promise<void>;
  readLog: () => Promise<string | null>;
  chromeUp: () => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  log: (line: string) => void;
};

type BridgeState = { usedPid: number | null; usedAt: number | null };
const shared = globalThis as typeof globalThis & { namiBridgeState?: BridgeState };
const state = (shared.namiBridgeState ??= { usedPid: null, usedAt: null });

export function resetBridgeState(): void {
  state.usedPid = null;
  state.usedAt = null;
}

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 5_000 }, (error, stdout) => (error ? reject(error) : resolve(String(stdout))));
  });
}

export async function findBridgePid(): Promise<number | null> {
  try {
    const out = await run("pgrep", ["-f", "holo local browser"]);
    const pids = out.split(/\s+/).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n !== process.pid);
    return pids.length ? Math.min(...pids) : null;
  } catch {
    return null;
  }
}

export function bridgeManaged(env: Record<string, string | undefined> = process.env, platform = process.platform): boolean {
  return env.NODE_ENV !== "production" && !!env.NAMI_LOCAL_SESSION_ID?.trim() && (platform === "darwin" || platform === "linux");
}

export function defaultBridgeDeps(env: Record<string, string | undefined> = process.env): BridgeDeps {
  const port = env.NAMI_AGENT_CHROME_PORT?.trim() || "9333";
  return {
    pgrep: findBridgePid,
    kill: async (pid) => {
      process.kill(pid, "SIGTERM");
    },
    readLog: async () => {
      const path = env.NAMI_BRIDGE_LOG?.trim();
      if (!path) return null;
      try {
        return await readFile(path, "utf8");
      } catch {
        return null;
      }
    },
    chromeUp: async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2_000) });
        return response.ok;
      } catch {
        return false;
      }
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: Date.now,
    log: (line) => console.log(`[local-bridge] ${line}`),
  };
}

// The bridge log is the ground truth: a `destroy` since its last start line means its chromedriver is dead, whatever
// its pid (the bridge restarts by itself every 20 s or so at idle, so pids are not a reliable identity: seen on the
// Mac 2026-11-08, the arrival card started 2 s after the visa on a bridge Nami believed new).
export function usedSinceLastStart(log: string): boolean {
  const start = log.lastIndexOf(BRIDGE_READY_LINE);
  return log.slice(start === -1 ? 0 : start).includes(BRIDGE_DESTROY_LINE);
}

// True when the bridge process now running already served an H session: by its log when there is one, else by pid.
export async function bridgeIsUsed(deps: Pick<BridgeDeps, "pgrep" | "readLog"> = defaultBridgeDeps()): Promise<boolean> {
  const log = await deps.readLog();
  if (log !== null && usedSinceLastStart(log)) return true;
  if (state.usedPid === null) return false;
  const pid = await deps.pgrep();
  return pid !== null && pid === state.usedPid;
}

// Called right after createSession: the bridge that is up now serves this session, the next one needs a fresh one.
export async function markBridgeUsed(deps: Pick<BridgeDeps, "pgrep" | "now"> = defaultBridgeDeps()): Promise<void> {
  const pid = await deps.pgrep();
  state.usedPid = pid;
  state.usedAt = pid === null ? null : deps.now();
}

// Kills the running bridge (the caller decided it is used), waits for the restarted one (new pid), then for its ready
// line (or 4 s), then for Chrome. Never throws: on any doubt the session is created as before.
export async function refreshBridge(deps: BridgeDeps = defaultBridgeDeps()): Promise<"refreshed" | "skipped" | "timeout"> {
  const oldPid = await deps.pgrep();
  if (oldPid === null) return "skipped";
  const start = deps.now();
  const logBefore = (await deps.readLog())?.length ?? null;
  try {
    await deps.kill(oldPid);
  } catch {
    return "skipped";
  }
  let pid: number | null = null;
  while (deps.now() - start < NEW_PID_TIMEOUT_MS) {
    await deps.sleep(POLL_MS);
    const current = await deps.pgrep();
    if (current !== null && current !== oldPid) {
      pid = current;
      break;
    }
  }
  if (pid === null) {
    deps.log("the bridge did not come back within 20 s; creating the session anyway");
    state.usedPid = null;
    return "timeout";
  }
  const readyStart = deps.now();
  let ready = false;
  while (deps.now() - readyStart < READY_TIMEOUT_MS) {
    const log = await deps.readLog();
    if (log === null) {
      await deps.sleep(READY_FALLBACK_MS);
      ready = true;
      break;
    }
    if (log.slice(logBefore ?? 0).includes(BRIDGE_READY_LINE)) {
      ready = true;
      break;
    }
    await deps.sleep(POLL_MS);
  }
  for (let i = 0; i < 10 && !(await deps.chromeUp()); i += 1) await deps.sleep(POLL_MS);
  state.usedPid = null;
  deps.log(`bridge refreshed (pid ${oldPid} -> ${pid}, ${ready ? "ready" : "ready line not seen"}, ${deps.now() - start} ms)`);
  return ready ? "refreshed" : "timeout";
}

// What the start routes call: nothing outside the bench, never an error.
export async function freshBridgeBeforeSession(deps: BridgeDeps = defaultBridgeDeps()): Promise<void> {
  if (!bridgeManaged()) return;
  try {
    if (await bridgeIsUsed(deps)) await refreshBridge(deps);
  } catch {
    // The session is created as before.
  }
}

export async function rememberBridgeForSession(deps: BridgeDeps = defaultBridgeDeps()): Promise<void> {
  if (!bridgeManaged()) return;
  try {
    await markBridgeUsed(deps);
  } catch {}
}
