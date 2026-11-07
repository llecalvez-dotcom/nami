import { agentChromePort, connectChrome, type CdpConnection } from "@/lib/chrome-cdp";
import { getBaliPaper } from "@/lib/bali-papers";
import { getSessionStatus, isTerminalStatus } from "@/lib/h-agent";

type ActiveSession = { browserId: string; sessionId: string; idempotencyKey?: string };
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

const BUSY = "Another Nami agent is using this browser. Use Stop agent in its trip, then try again.";

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
      commit: (sessionId: string, idempotencyKey?: string) => current.active.set(port, { browserId, sessionId, idempotencyKey }),
      release,
    };
  } catch (error) {
    release();
    throw error;
  }
}
