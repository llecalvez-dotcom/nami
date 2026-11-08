import { agentChromePort, connectChrome, type CdpConnection } from "@/lib/chrome-cdp";
import { getBaliPaper } from "@/lib/bali-papers";
import { cancelSession, getSessionStatus, getSessionSteps, isTerminalStatus } from "@/lib/h-agent";
import { abandonSession, FIRST_STALL_MS, hasActed, isReleased } from "@/lib/agent-stall";

type ActiveSession = { browserId: string; sessionId: string; idempotencyKey?: string; startedAt: number };
type Store = { active: Map<number, ActiveSession>; pending: Set<string> };
type BrowserLease = { commit(sessionId: string, idempotencyKey?: string): void; release(): void };
const shared = globalThis as typeof globalThis & { namiBrowserPreflight?: Store };
const store = () => shared.namiBrowserPreflight ??= { active: new Map(), pending: new Set() };

export class AgentPreflightError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "AgentPreflightError";
  }
}

export function resetBrowserPreflight(): void {
  delete shared.namiBrowserPreflight;
}

export const BUSY = "Another Nami agent is using this browser. Use Stop agent in its trip, then try again.";

// Stop agent, or a session abandoned: the browser is free at once, whatever H still says of the session. Only the
// active record goes: a pending key belongs to a start under way, which keeps its reservation.
export function releaseBrowser(sessionId: string): void {
  const current = store();
  for (const [port, entry] of current.active) {
    if (entry.sessionId === sessionId) current.active.delete(port);
  }
}

// A session that never acted in FIRST_STALL_MS is the stall of 2026-11-08: H keeps it "running" with 0 steps for over an
// hour, DELETE or not. It is given up here, so the new start does not wait for it nor get a 409. Nami only learns of
// actions from the panel's polls, so when it saw none, H is asked for its step count: a session with steps is kept.
async function neverStarted(entry: ActiveSession, now: number): Promise<boolean> {
  if (hasActed(entry.sessionId) || now - entry.startedAt < FIRST_STALL_MS) return false;
  try {
    return await getSessionSteps(entry.sessionId) === 0;
  } catch {
    return false;
  }
}

export async function preflightBrowser(browserId: string, connect: (port: number) => Promise<CdpConnection> = connectChrome, resumeKey?: string): Promise<BrowserLease> {
  if (process.env.NODE_ENV === "production") return { commit: () => {}, release: () => {} };
  const port = agentChromePort();
  if (port === null) throw new AgentPreflightError("Set NAMI_AGENT_CHROME_PORT to a port from 1 to 65535, then try again.", 503);
  const current = store();
  const keys = [`port:${port}`, `bridge:${browserId}`];
  if (keys.some((key) => current.pending.has(key))) throw new AgentPreflightError(BUSY, 409);
  keys.forEach((key) => current.pending.add(key));
  const release = () => keys.forEach((key) => current.pending.delete(key));
  try {
    for (const [activePort, entry] of current.active) {
      if (activePort !== port && entry.browserId !== browserId) continue;
      if (resumeKey && entry.idempotencyKey === resumeKey && activePort === port && entry.browserId === browserId) continue;
      // A session given up or stopped by Nami no longer holds the browser: the new session takes it over without
      // asking H, which may call it "running" for a long time still (bench 2026-11-08, 409 after Stop agent).
      if (isReleased(entry.sessionId)) {
        current.active.delete(activePort);
        continue;
      }
      if (await neverStarted(entry, Date.now())) {
        abandonSession(entry.sessionId);
        void cancelSession(entry.sessionId).catch(() => {});
        current.active.delete(activePort);
        continue;
      }
      let status: string;
      try {
        status = await getSessionStatus(entry.sessionId);
      } catch {
        throw new AgentPreflightError("Could not check the previous Nami session. Try again before starting another agent.", 503);
      }
      if (!isTerminalStatus(status)) throw new AgentPreflightError(BUSY, 409);
      current.active.delete(activePort);
    }
    let client: CdpConnection | undefined;
    try {
      client = await connect(port);
      const result = await client.send("Target.getTargets") as { targetInfos: { type: string; url: string }[] };
      const domain = getBaliPaper("evoa").domain;
      const official = result.targetInfos.filter((target) => {
        if (target.type !== "page") return false;
        try {
          const url = new URL(target.url);
          return ["http:", "https:"].includes(url.protocol)
            && (url.hostname === domain || url.hostname.endsWith(`.${domain}`));
        } catch {
          return false;
        }
      });
      if (official.length > 1) throw new AgentPreflightError("Several official e-VOA tabs are open. Close the extra tabs, then try again.", 409);
      // With no tab at all, holo local browser stops on "unable to discover open pages" (seen twice on 2026-11-07).
      if (!result.targetInfos.some((target) => target.type === "page")) await client.send("Target.createTarget", { url: "about:blank" });
    } catch (error) {
      if (error instanceof AgentPreflightError) throw error;
      throw new AgentPreflightError(`Chrome DevTools is not ready. Run holo local browser --debug-port ${port} and keep it open, then try again.`, 503);
    } finally {
      client?.close();
    }
    return {
      commit: (sessionId: string, idempotencyKey?: string) => current.active.set(port, { browserId, sessionId, idempotencyKey, startedAt: Date.now() }),
      release,
    };
  } catch (error) {
    release();
    throw error;
  }
}
