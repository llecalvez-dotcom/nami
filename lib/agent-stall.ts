import type { HChanges } from "@/lib/h-agent";

// Measured on 2026-11-08 (2 sessions out of 14, both at the first step): H sent the first screenshot, then its model
// never answered, and the session ignored DELETE and its own max_time_s. Nami then waited forever, and its browser lock
// refused any new session. A session whose last event is a screenshot with no answer for STALL_MS is given up: Nami
// cancels it (best effort), reports it as failed (the traveller can try again), and lets a new session take the browser.
// A screenshot normally gets its answer in 2 to 4 s; waits chosen by the agent (wait_web) and tool calls waiting for
// the human are not counted: only the moments when H owes an answer (after a screenshot, a tool result, a restart).
export const STALL_MS = 40_000;
// Before its first action the agent has only the first screenshot to answer (about 3 s when it works): the 3 stalls
// seen on 2026-11-08 were all there, so the wait is shorter. Nothing has been done yet, so starting over is safe.
export const FIRST_STALL_MS = 20_000;
export const STALLED = "stalled";

type Progress = { lastKind: string | null; lastAt: number; acted: boolean };
const shared = globalThis as typeof globalThis & { namiAgentProgress?: Map<string, Progress>; namiAbandonedSessions?: Set<string> };
const WAITING_ON_H = new Set(["observation_event", "tool_result", "state:running"]);
const progress = () => shared.namiAgentProgress ??= new Map();
const abandoned = () => shared.namiAbandonedSessions ??= new Set();

function lastKind(changes: HChanges): string | null {
  for (let i = changes.new_events.length - 1; i >= 0; i -= 1) {
    const event = changes.new_events[i];
    if (event.type === "AgentEvent" && typeof event.data?.kind === "string") return event.data.kind;
    if (event.type === "ActiveStateChangeEvent") return `state:${String(event.data?.state)}`;
  }
  return null;
}

// Called with every answer of H's changes endpoint (null = nothing new). True once the session is stalled.
export function trackProgress(sessionId: string, changes: HChanges | null, now = Date.now()): boolean {
  const entries = progress();
  const entry = entries.get(sessionId) ?? { lastKind: null, lastAt: now, acted: false };
  if (changes && changes.new_events.length > 0) {
    const kind = lastKind(changes);
    if (kind) entry.lastKind = kind;
    if (changes.new_events.some((event) => event.type === "AgentEvent" && event.data?.kind === "policy_event")) entry.acted = true;
    entry.lastAt = now;
  }
  entries.set(sessionId, entry);
  while (entries.size > 50) entries.delete(entries.keys().next().value!);
  const running = changes === null || changes.status === "running";
  const waitingForUs = (changes?.pending_tool_calls.length ?? 0) > 0;
  return running && !waitingForUs && entry.lastKind !== null && WAITING_ON_H.has(entry.lastKind) && now - entry.lastAt >= (entry.acted ? STALL_MS : FIRST_STALL_MS);
}

export function abandonSession(sessionId: string): void {
  abandoned().add(sessionId);
  progress().delete(sessionId);
}

export function isAbandoned(sessionId: string): boolean {
  return abandoned().has(sessionId);
}

export function resetAgentStall(): void {
  delete shared.namiAgentProgress;
  delete shared.namiAbandonedSessions;
}
