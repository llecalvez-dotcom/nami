import type { HChanges } from "@/lib/h-agent";

// Measured on 2026-11-08 (2 sessions out of 14, both at the first step): H sent the first screenshot, then its model
// never answered, and the session ignored DELETE and its own max_time_s. Nami then waited forever, and its browser lock
// refused any new session. A session whose last event is a screenshot with no answer for STALL_MS is given up: Nami
// cancels it (best effort), reports it as failed (the traveller can try again), and lets a new session take the browser.
// A screenshot normally gets its answer in 2 to 4 s; waits chosen by the agent (wait_web) and tool calls waiting for
// the human are not counted: only the moments when H owes an answer (after a screenshot, a tool result, a restart).
export const STALL_MS = 40_000;
// Before its first action the agent has only the first screenshot to answer (about 3 s when it works): the 3 stalls
// seen on 2026-11-08 were all there. Nothing has been done yet, so starting over is safe, and the panel does it once
// by itself. 45 s and not 20: a slow H sometimes sends its first action after 30 s (bench, 2026-11-08 at 04:04).
export const FIRST_STALL_MS = 45_000;
// H has started but never took its first screenshot (about 1 s when it works): no command ever reached the browser and
// the tab stayed blank (flights, 2026-11-08 at 10:33; H answered "Error" only after 65 s). Nothing was done either.
// 35 s and not 20: on the same bench the first screenshot once came at 25.6 s, and the session then worked.
export const NO_SCREEN_MS = 35_000;
export const STALLED = "stalled";

type Progress = { lastKind: string | null; lastAt: number; acted: boolean };
// abandoned: given up by Nami as stalled, with whether the agent had acted (the panel restarts only a session that
// had not). released: cancelled by the traveller or abandoned; either way it no longer holds the browser, whatever H
// says of it (a stalled session stays "running" on H for over an hour after DELETE answered 204, bench 2026-11-08).
const shared = globalThis as typeof globalThis & {
  namiAgentProgress?: Map<string, Progress>;
  namiAbandonedSessions?: Map<string, { acted: boolean }>;
  namiReleasedSessions?: Set<string>;
};
const WAITING_ON_H = new Set(["observation_event", "tool_result", "state:running"]);
const progress = () => shared.namiAgentProgress ??= new Map();
// instanceof and not ??=: a dev server kept running across the change from Set to Map held the old Set (bench 2026-11-08).
const abandoned = () => shared.namiAbandonedSessions instanceof Map ? shared.namiAbandonedSessions : (shared.namiAbandonedSessions = new Map());
const released = () => shared.namiReleasedSessions ??= new Set();

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
  const noScreenYet = entry.lastKind === "message_event" && !entry.acted;
  if (noScreenYet) return running && !waitingForUs && now - entry.lastAt >= NO_SCREEN_MS;
  return running && !waitingForUs && entry.lastKind !== null && WAITING_ON_H.has(entry.lastKind) && now - entry.lastAt >= (entry.acted ? STALL_MS : FIRST_STALL_MS);
}

// True once the agent did something (a policy_event): fields may be filled, the session must not be redone blindly.
export function hasActed(sessionId: string): boolean {
  return progress().get(sessionId)?.acted ?? false;
}

export function abandonSession(sessionId: string): void {
  abandoned().set(sessionId, { acted: hasActed(sessionId) });
  released().add(sessionId);
  progress().delete(sessionId);
}

export function isAbandoned(sessionId: string): boolean {
  return abandoned().has(sessionId);
}

// Given up before the agent's first action: safe to start again with the same parameters.
export function abandonedBeforeAction(sessionId: string): boolean {
  const entry = abandoned().get(sessionId);
  return entry !== undefined && !entry.acted;
}

// Cancelled by Nami (Stop agent, or a new start that takes the browser over): it does not hold the browser any more.
export function releaseSession(sessionId: string): void {
  released().add(sessionId);
  progress().delete(sessionId);
}

export function isReleased(sessionId: string): boolean {
  return released().has(sessionId);
}

export function resetAgentStall(): void {
  delete shared.namiAgentProgress;
  delete shared.namiAbandonedSessions;
  delete shared.namiReleasedSessions;
}
