import { unbindSessionDocument } from "@/lib/agent-passport-upload";
import { forgetSession } from "@/lib/agent-stall";
import { cancelSession, createSession, getChanges, isTerminalStatus, sendSessionMessage, type CreateSessionInput, type ToolSpec } from "@/lib/h-agent";
import { disarmFlightsGuard, FLIGHTS_MAX_STEPS, FLIGHTS_MAX_TIME_S, FLIGHTS_TOOLS, unbindFlightsSession } from "@/lib/flights-agent";
import { HOTELS_MAX_STEPS, HOTELS_MAX_TIME_S, HOTELS_TOOLS } from "@/lib/hotels-agent";
import { freshBridgeBeforeSession, rememberBridgeForSession } from "@/lib/local-bridge";
import { PAPER_MAX_STEPS, PAPER_MAX_TIME_S, PAPER_TOOLS, unbindSessionPaper } from "@/lib/paper-agent";

// Ticket 20: one H session for the whole trip. The visa opens it (idle_timeout_s), the arrival card, the flights and
// the hotels are sent to it as new tasks (POST /sessions/{id}/messages) instead of a new session each, so the local
// bridge is neither restarted nor rested between them (35 to 55 s each time, docs/tests/2026-11-08-mesure-vitesse-visa.md).
// Each task keeps its own rules: the guards of the previous task are forgotten before the message goes out, and the
// route binds the new ones. Anything that fails on the open session ends it and takes today's path (new session).

export type SessionMode = "single" | "per_task";
export type TripTask = "visa" | "arrival_card" | "flights" | "hotels";
export type TripSessionState = "running" | "idle" | "ended";
export type TripSession = {
  session_id: string;
  opened_at: string;
  last_task_at: string;
  task: TripTask;
  state: TripSessionState;
  // H's event index after the last task: the panel polls the next task from there, not from the visa's first step.
  next_index: number;
};

export const DEFAULT_IDLE_TIMEOUT_S = 600;
// The session's budget covers the whole trip: every task's limit added up, plus the waits between them.
export const SINGLE_MAX_STEPS = PAPER_MAX_STEPS * 2 + FLIGHTS_MAX_STEPS + HOTELS_MAX_STEPS;
export const SINGLE_MAX_TIME_S = PAPER_MAX_TIME_S * 2 + FLIGHTS_MAX_TIME_S + HOTELS_MAX_TIME_S;
// H fixes a session's tools when it is created: the trip's session carries every task's tools, each task's rules say
// which ones it may call (the panel only acts on the tools of the running task, the others get an empty result).
export const SINGLE_TOOLS: ToolSpec[] = [...PAPER_TOOLS, ...FLIGHTS_TOOLS, ...HOTELS_TOOLS].filter((tool, i, all) => all.findIndex((t) => t.name === tool.name) === i);
// After report_ready the agent must only answer: a browser action then ends the session (and the next task starts anew).
export const SETTLE_MAX_MS = 60_000;

export function sessionMode(env: Record<string, string | undefined> = process.env): SessionMode {
  return env.NAMI_H_SESSION_MODE === "per_task" ? "per_task" : "single";
}

export function idleTimeoutS(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.NAMI_H_IDLE_TIMEOUT_S);
  return env.NAMI_H_IDLE_TIMEOUT_S && Number.isInteger(value) && value >= 30 && value <= 3600 ? value : DEFAULT_IDLE_TIMEOUT_S;
}

// Keyed by the local browser (the bridge's session id): one trip at a time per browser.
const shared = globalThis as typeof globalThis & { namiTripSessions?: Map<string, TripSession> };
const sessions = () => (shared.namiTripSessions ??= new Map());

export function startTripSession(browserId: string, sessionId: string, task: TripTask, now = new Date()): TripSession {
  const at = now.toISOString();
  const session: TripSession = { session_id: sessionId, opened_at: at, last_task_at: at, task, state: "running", next_index: 0 };
  sessions().set(browserId, session);
  return session;
}

// The session a new task can continue: idle, and still within H's idle timeout (with a margin for the message).
export function openTripSession(browserId: string, now = new Date(), env: Record<string, string | undefined> = process.env): TripSession | null {
  const session = sessions().get(browserId);
  if (!session || session.state !== "idle") return null;
  const idleFor = now.getTime() - Date.parse(session.last_task_at);
  if (idleFor > (idleTimeoutS(env) - 15) * 1000) return null;
  return session;
}

export function tripSession(browserId: string): TripSession | null {
  return sessions().get(browserId) ?? null;
}

export function tripSessionOf(sessionId: string): TripSession | null {
  let found: TripSession | null = null;
  for (const session of sessions().values()) {
    if (session.session_id !== sessionId) continue;
    if (session.state !== "ended") return session;
    found = session;
  }
  return found;
}

export function isTripSession(sessionId: string): boolean {
  const session = tripSessionOf(sessionId);
  return session !== null && session.state !== "ended";
}

export function continueTripSession(browserId: string, task: TripTask, now = new Date()): TripSession | null {
  const session = sessions().get(browserId);
  if (!session) return null;
  session.task = task;
  session.state = "running";
  session.last_task_at = now.toISOString();
  return session;
}

// The panel's polls and the settle loop keep the index moving.
export function noteTaskIndex(sessionId: string, nextIndex: number): void {
  const session = tripSessionOf(sessionId);
  if (session && nextIndex > session.next_index) session.next_index = nextIndex;
}

export function taskIdle(sessionId: string, now = new Date()): void {
  const session = tripSessionOf(sessionId);
  if (!session || session.state === "ended") return;
  session.state = "idle";
  session.last_task_at = now.toISOString();
}

// Stop agent, a stall, a page outside the domain, a failed message: the trip's session is over.
export function endTripSession(sessionId: string): void {
  const session = tripSessionOf(sessionId);
  if (session) session.state = "ended";
}

export function resetTripSessions(): void {
  delete shared.namiTripSessions;
}

// Before a new task on the same session: no rule of the previous task survives. The route then binds the new ones
// (bindSessionPaper, bindFlightsSession, bindSessionDocument); the flights guard is armed again only once Google is seen.
export function rearmGuards(sessionId: string): void {
  unbindSessionPaper(sessionId);
  unbindFlightsSession(sessionId);
  disarmFlightsGuard(sessionId);
  unbindSessionDocument(sessionId);
  forgetSession(sessionId);
}

export type TaskSpec = { kind: TripTask; task: string; instructions: string; tools: ToolSpec[]; maxTimeS: number; maxSteps: number };
export type TaskStart = { id: string; status: string | null; fromIndex: number; continued: boolean };
export type StartDeps = {
  createSession: typeof createSession;
  sendSessionMessage: typeof sendSessionMessage;
  cancelSession: typeof cancelSession;
  freshBridgeBeforeSession: () => Promise<void>;
  rememberBridgeForSession: () => Promise<void>;
  now: () => Date;
  env: Record<string, string | undefined>;
  log: (message: string) => void;
};

const defaultDeps = (): StartDeps => ({
  createSession,
  sendSessionMessage,
  cancelSession,
  freshBridgeBeforeSession,
  rememberBridgeForSession,
  now: () => new Date(),
  env: process.env,
  log: (message) => console.error(message),
});

// The message of a continued task restates every rule: the session's instructions are the visa's, a new task cannot
// rely on them. Tools are those of the session (the union of all tasks' tools): a task's rules say which it may call.
export function continuationMessage(spec: TaskSpec): string {
  return [
    "New task. The previous task is over: forget its rules, its site and its stop condition. Only the rules below apply now.",
    spec.instructions,
    spec.task,
  ].join("\n\n");
}

export async function startTask(
  spec: TaskSpec,
  input: { localBrowserSessionId: string; idempotencyKey?: string; resume?: boolean },
  deps: Partial<StartDeps> = {},
): Promise<TaskStart> {
  const d = { ...defaultDeps(), ...deps };
  const base: Omit<CreateSessionInput, "idleTimeoutS"> = {
    task: spec.task, instructions: spec.instructions, tools: spec.tools, localBrowserSessionId: input.localBrowserSessionId,
    maxTimeS: spec.maxTimeS, maxSteps: spec.maxSteps, idempotencyKey: input.idempotencyKey,
  };
  const resumed = Boolean(input.resume && input.idempotencyKey);
  if (sessionMode(d.env) === "per_task") {
    // Today's path, unchanged: a fresh bridge, a new session per task.
    if (!resumed) await d.freshBridgeBeforeSession();
    const session = await d.createSession(base);
    await d.rememberBridgeForSession();
    return { ...session, fromIndex: 0, continued: false };
  }
  const browserId = input.localBrowserSessionId;
  const open = spec.kind === "visa" ? null : openTripSession(browserId, d.now(), d.env);
  if (open) {
    try {
      rearmGuards(open.session_id);
      await d.sendSessionMessage(open.session_id, continuationMessage(spec));
      continueTripSession(browserId, spec.kind, d.now());
      return { id: open.session_id, status: "running", fromIndex: open.next_index, continued: true };
    } catch (error) {
      d.log(`h-agent: could not continue session ${open.session_id} for ${spec.kind} (${(error as Error).message}), new session instead`);
      endTripSession(open.session_id);
      await d.cancelSession(open.session_id).catch(() => {});
    }
  } else if (!resumed) {
    // The visa starts the trip over: a session left idle by an earlier trip is closed, never continued. A session still
    // running was stopped or given up already (the browser preflight let this start through), nothing to cancel.
    const previous = tripSession(browserId);
    if (previous && previous.state !== "ended") {
      const idle = previous.state === "idle";
      endTripSession(previous.session_id);
      if (idle) void d.cancelSession(previous.session_id).catch(() => {});
    }
  }
  if (!resumed) await d.freshBridgeBeforeSession();
  const session = await d.createSession({ ...base, tools: SINGLE_TOOLS, maxTimeS: SINGLE_MAX_TIME_S, maxSteps: SINGLE_MAX_STEPS, idleTimeoutS: idleTimeoutS(d.env) });
  await d.rememberBridgeForSession();
  startTripSession(browserId, session.id, spec.kind, d.now());
  return { ...session, fromIndex: 0, continued: false };
}

// The task's end, after report_ready was answered: Nami watches the session until H puts it idle (the agent's answer).
// The agent must not touch the browser any more; if it does, the session is cancelled and the next task opens a new one.
export async function settleTask(
  sessionId: string,
  deps: Partial<Pick<StartDeps, "cancelSession" | "log"> & { getChanges: typeof getChanges; now: () => number; maxMs: number }> = {},
): Promise<TripSessionState> {
  const d = { cancelSession, getChanges, log: (message: string) => console.error(message), now: () => Date.now(), maxMs: SETTLE_MAX_MS, ...deps };
  const session = tripSessionOf(sessionId);
  if (!session || session.state === "ended") return "ended";
  const started = d.now();
  let index = session.next_index;
  while (d.now() - started < d.maxMs) {
    let changes: Awaited<ReturnType<typeof getChanges>>;
    try {
      changes = await d.getChanges(sessionId, index, { waitForSeconds: 5 });
    } catch (error) {
      d.log(`h-agent: lost the trip's session ${sessionId} while settling (${(error as Error).message})`);
      endTripSession(sessionId);
      return "ended";
    }
    if (changes === null) continue;
    index = (changes.first_index ?? index) + changes.new_events.length;
    noteTaskIndex(sessionId, index);
    if (changes.new_events.some((event) => event.type === "AgentEvent" && event.data?.kind === "policy_event")) {
      d.log(`h-agent: session ${sessionId} acted after report_ready, cancelled`);
      endTripSession(sessionId);
      await d.cancelSession(sessionId).catch(() => {});
      return "ended";
    }
    if (isTerminalStatus(changes.status)) {
      endTripSession(sessionId);
      return "ended";
    }
    if (changes.status === "idle") {
      taskIdle(sessionId, new Date(d.now()));
      return "idle";
    }
  }
  d.log(`h-agent: session ${sessionId} did not go idle after report_ready, cancelled`);
  endTripSession(sessionId);
  await d.cancelSession(sessionId).catch(() => {});
  return "ended";
}
