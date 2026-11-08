import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bindSessionDocument, unbindSessionDocument } from "@/lib/agent-passport-upload";
import { abandonSession, forgetSession, isAbandoned, isReleased, releaseSession, resetAgentStall, trackProgress } from "@/lib/agent-stall";
import { armFlightsGuard, bindFlightsSession, isFlightsGuardArmed, isFlightsSession } from "@/lib/flights-agent";
import type { HChanges } from "@/lib/h-agent";
import { bindSessionPaper, sessionPaper } from "@/lib/paper-agent";
import {
  continuationMessage,
  endTripSession,
  idleTimeoutS,
  isTripSession,
  noteTaskIndex,
  openTripSession,
  rearmGuards,
  resetTripSessions,
  sessionMode,
  settleTask,
  SINGLE_MAX_STEPS,
  SINGLE_TOOLS,
  startTask,
  startTripSession,
  taskIdle,
  tripSession,
  type StartDeps,
  type TaskSpec,
} from "@/lib/trip-session";

const spec = (kind: TaskSpec["kind"]): TaskSpec => ({ kind, task: `${kind} task`, instructions: `${kind} rules`, tools: [], maxTimeS: 600, maxSteps: 40 });
const now = new Date("2026-11-08T10:00:00Z");

function deps(overrides: Partial<StartDeps> = {}) {
  let created = 0;
  const d = {
    createSession: vi.fn(async () => ({ id: `s-${++created}`, status: "pending" })),
    sendSessionMessage: vi.fn(async () => {}),
    cancelSession: vi.fn(async () => {}),
    freshBridgeBeforeSession: vi.fn(async () => {}),
    rememberBridgeForSession: vi.fn(async () => {}),
    now: () => now,
    env: { NAMI_H_SESSION_MODE: "single" } as Record<string, string | undefined>,
    log: vi.fn(),
    ...overrides,
  };
  return d;
}

beforeEach(() => {
  resetTripSessions();
  resetAgentStall();
});
afterEach(() => vi.restoreAllMocks());

describe("the session mode", () => {
  it("is single by default and per_task on request", () => {
    expect(sessionMode({})).toBe("single");
    expect(sessionMode({ NAMI_H_SESSION_MODE: "per_task" })).toBe("per_task");
    expect(sessionMode({ NAMI_H_SESSION_MODE: "whatever" })).toBe("single");
  });

  it("keeps the session open 600 s unless told otherwise, within H's bounds", () => {
    expect(idleTimeoutS({})).toBe(600);
    expect(idleTimeoutS({ NAMI_H_IDLE_TIMEOUT_S: "900" })).toBe(900);
    expect(idleTimeoutS({ NAMI_H_IDLE_TIMEOUT_S: "5" })).toBe(600);
    expect(idleTimeoutS({ NAMI_H_IDLE_TIMEOUT_S: "abc" })).toBe(600);
  });
});

describe("one H session per trip", () => {
  it("starts the trip's session with the visa, with idle_timeout_s, the trip's budget and every task's tools", async () => {
    const d = deps();
    const started = await startTask(spec("visa"), { localBrowserSessionId: "bridge-1" }, d);
    expect(started).toEqual({ id: "s-1", status: "pending", fromIndex: 0, continued: false });
    expect(d.freshBridgeBeforeSession).toHaveBeenCalledTimes(1);
    expect(d.rememberBridgeForSession).toHaveBeenCalledTimes(1);
    const input = vi.mocked(d.createSession).mock.calls[0][0] as { idleTimeoutS?: number; maxSteps: number; tools: { name: string }[] };
    expect(input.idleTimeoutS).toBe(600);
    expect(input.maxSteps).toBe(SINGLE_MAX_STEPS);
    expect(input.tools.map((t) => t.name)).toEqual(SINGLE_TOOLS.map((t) => t.name));
    expect(input.tools.map((t) => t.name)).toEqual(expect.arrayContaining(["fill_field", "report_flights", "report_hotels", "report_ready"]));
    expect(tripSession("bridge-1")).toMatchObject({ session_id: "s-1", task: "visa", state: "running", opened_at: now.toISOString(), last_task_at: now.toISOString() });
    expect(isTripSession("s-1")).toBe(true);
  });

  it("sends the arrival card, then the flights, as messages to the open session, without touching the bridge", async () => {
    const d = deps();
    await startTask(spec("visa"), { localBrowserSessionId: "bridge-1" }, d);
    noteTaskIndex("s-1", 57);
    taskIdle("s-1", now);
    const later = new Date(now.getTime() + 60_000);
    const card = await startTask(spec("arrival_card"), { localBrowserSessionId: "bridge-1" }, { ...d, now: () => later });
    expect(card).toEqual({ id: "s-1", status: "running", fromIndex: 57, continued: true });
    expect(d.createSession).toHaveBeenCalledTimes(1);
    expect(d.freshBridgeBeforeSession).toHaveBeenCalledTimes(1);
    expect(d.sendSessionMessage).toHaveBeenCalledWith("s-1", continuationMessage(spec("arrival_card")));
    expect(tripSession("bridge-1")).toMatchObject({ task: "arrival_card", state: "running", last_task_at: later.toISOString(), opened_at: now.toISOString() });

    noteTaskIndex("s-1", 120);
    taskIdle("s-1", later);
    const flights = await startTask(spec("flights"), { localBrowserSessionId: "bridge-1" }, { ...d, now: () => new Date(later.getTime() + 30_000) });
    expect(flights).toMatchObject({ id: "s-1", fromIndex: 120, continued: true });
    expect(d.sendSessionMessage).toHaveBeenCalledTimes(2);
    expect(vi.mocked(d.sendSessionMessage).mock.calls[1][1]).toContain("flights rules");
    expect(vi.mocked(d.sendSessionMessage).mock.calls[1][1]).toContain("New task");
  });

  it("does not continue a session that is still running, nor one idle for longer than H keeps it", async () => {
    const d = deps();
    await startTask(spec("visa"), { localBrowserSessionId: "bridge-1" }, d);
    expect(openTripSession("bridge-1", now)).toBeNull();
    taskIdle("s-1", now);
    expect(openTripSession("bridge-1", new Date(now.getTime() + 500_000))).not.toBeNull();
    expect(openTripSession("bridge-1", new Date(now.getTime() + 590_000))).toBeNull();
    const flights = await startTask(spec("flights"), { localBrowserSessionId: "bridge-1" }, { ...d, now: () => new Date(now.getTime() + 590_000) });
    expect(flights).toMatchObject({ id: "s-2", continued: false });
    expect(d.freshBridgeBeforeSession).toHaveBeenCalledTimes(2);
  });

  it("falls back to a new session, with the bridge refreshed, when the message fails, and ends the old one", async () => {
    const d = deps({ sendSessionMessage: vi.fn(async () => { throw new Error("404 session not found"); }) });
    await startTask(spec("visa"), { localBrowserSessionId: "bridge-1" }, d);
    taskIdle("s-1", now);
    const flights = await startTask(spec("flights"), { localBrowserSessionId: "bridge-1" }, d);
    expect(flights).toEqual({ id: "s-2", status: "pending", fromIndex: 0, continued: false });
    expect(d.cancelSession).toHaveBeenCalledWith("s-1");
    expect(d.freshBridgeBeforeSession).toHaveBeenCalledTimes(2);
    expect(d.rememberBridgeForSession).toHaveBeenCalledTimes(2);
    expect(isTripSession("s-1")).toBe(false);
    expect(tripSession("bridge-1")).toMatchObject({ session_id: "s-2", task: "flights", state: "running" });
    expect(d.log).toHaveBeenCalledWith(expect.stringContaining("new session instead"));
  });

  it("stops: an ended session is never continued, the next task opens a new one", async () => {
    const d = deps();
    await startTask(spec("visa"), { localBrowserSessionId: "bridge-1" }, d);
    taskIdle("s-1", now);
    endTripSession("s-1");
    expect(isTripSession("s-1")).toBe(false);
    expect(openTripSession("bridge-1", now)).toBeNull();
    const card = await startTask(spec("arrival_card"), { localBrowserSessionId: "bridge-1" }, d);
    expect(card).toMatchObject({ id: "s-2", continued: false });
    expect(d.sendSessionMessage).not.toHaveBeenCalled();
  });

  it("starts a new trip's visa on a new session and closes the one left idle by the previous trip", async () => {
    const d0 = deps();
    await startTask(spec("visa"), { localBrowserSessionId: "bridge-0" }, d0);
    await startTask(spec("visa"), { localBrowserSessionId: "bridge-0" }, d0);
    // Still running (stopped or given up elsewhere): forgotten, not cancelled again.
    expect(d0.cancelSession).not.toHaveBeenCalled();
    expect(tripSession("bridge-0")).toMatchObject({ session_id: "s-2" });
    const d = deps();
    await startTask(spec("visa"), { localBrowserSessionId: "bridge-1" }, d);
    taskIdle("s-1", now);
    const visa = await startTask(spec("visa"), { localBrowserSessionId: "bridge-1" }, d);
    expect(visa).toMatchObject({ id: "s-2", continued: false });
    expect(d.cancelSession).toHaveBeenCalledWith("s-1");
    expect(d.sendSessionMessage).not.toHaveBeenCalled();
  });

  it("per_task: one session per task, today's path, nothing remembered", async () => {
    const d = deps({ env: { NAMI_H_SESSION_MODE: "per_task" } });
    const visa = await startTask(spec("visa"), { localBrowserSessionId: "bridge-1" }, d);
    const flights = await startTask(spec("flights"), { localBrowserSessionId: "bridge-1" }, d);
    expect(visa).toMatchObject({ id: "s-1", continued: false });
    expect(flights).toMatchObject({ id: "s-2", continued: false });
    const input = vi.mocked(d.createSession).mock.calls[0][0] as { idleTimeoutS?: number; maxSteps: number; tools: unknown[] };
    expect(input.idleTimeoutS).toBeUndefined();
    expect(input.maxSteps).toBe(40);
    expect(input.tools).toEqual([]);
    expect(d.freshBridgeBeforeSession).toHaveBeenCalledTimes(2);
    expect(d.sendSessionMessage).not.toHaveBeenCalled();
    expect(tripSession("bridge-1")).toBeNull();
  });

  it("skips the bridge refresh on a resumed retry, as before", async () => {
    const d = deps();
    await startTask(spec("visa"), { localBrowserSessionId: "bridge-1", idempotencyKey: "k", resume: true }, d);
    expect(d.freshBridgeBeforeSession).not.toHaveBeenCalled();
  });
});

describe("each task keeps its own rules on the shared session", () => {
  it("re-arms the guards: nothing of the previous task survives the new message", async () => {
    const d = deps();
    await startTask(spec("visa"), { localBrowserSessionId: "bridge-1" }, d);
    bindSessionPaper("s-1", "arrival_card");
    bindSessionDocument("s-1", "/tmp/passport.jpg");
    trackProgress("s-1", { status: "running", new_events: [{ type: "AgentEvent", data: { kind: "policy_event" } }], pending_tool_calls: [] } as unknown as HChanges);
    releaseSession("s-1");
    taskIdle("s-1", now);
    await startTask(spec("flights"), { localBrowserSessionId: "bridge-1" }, d);
    expect(sessionPaper("s-1")).toBe("evoa");
    expect(isFlightsSession("s-1")).toBe(false);
    expect(isFlightsGuardArmed("s-1")).toBe(false);
    expect(isReleased("s-1")).toBe(false);
    expect(isAbandoned("s-1")).toBe(false);
    unbindSessionDocument("s-1");
  });

  it("rearmGuards forgets the flights binding, its armed guard and a stall as well", () => {
    bindFlightsSession("s-9");
    armFlightsGuard("s-9");
    abandonSession("s-9");
    rearmGuards("s-9");
    expect(isFlightsSession("s-9")).toBe(false);
    expect(isFlightsGuardArmed("s-9")).toBe(false);
    expect(isAbandoned("s-9")).toBe(false);
    expect(isReleased("s-9")).toBe(false);
    forgetSession("s-9");
  });

  it("the continuation message restates the task's rules and says the previous ones are over", () => {
    const message = continuationMessage(spec("hotels"));
    expect(message).toMatch(/^New task\./);
    expect(message).toContain("hotels rules");
    expect(message).toContain("hotels task");
  });
});

describe("the end of a task on the trip's session", () => {
  const changes = (status: string, events: HChanges["new_events"] = [], firstIndex = 10): HChanges => ({
    status, started_at: null, finished_at: null, error: null, error_code: null, outcome: null, answer: null, metrics: null,
    new_events: events, first_index: firstIndex, pending_tool_calls: [],
  });

  it("waits for H to put the session idle, then the next task may continue it", async () => {
    startTripSession("bridge-1", "s-1", "visa", now);
    noteTaskIndex("s-1", 10);
    const getChanges = vi.fn()
      .mockResolvedValueOnce(changes("running", [{ type: "AgentEvent", data: { kind: "message_event" } }]))
      .mockResolvedValueOnce(changes("idle", [], 11));
    const cancelSession = vi.fn(async () => {});
    expect(await settleTask("s-1", { getChanges, cancelSession, now: () => 0 })).toBe("idle");
    expect(cancelSession).not.toHaveBeenCalled();
    expect(openTripSession("bridge-1", new Date(0))).toMatchObject({ session_id: "s-1", next_index: 11 });
  });

  it("cancels and ends the session if the agent acts after report_ready", async () => {
    startTripSession("bridge-1", "s-1", "visa", now);
    const getChanges = vi.fn().mockResolvedValueOnce(changes("running", [{ type: "AgentEvent", data: { kind: "policy_event" } }]));
    const cancelSession = vi.fn(async () => {});
    expect(await settleTask("s-1", { getChanges, cancelSession, now: () => 0, log: () => {} })).toBe("ended");
    expect(cancelSession).toHaveBeenCalledWith("s-1");
    expect(isTripSession("s-1")).toBe(false);
  });

  it("ends the session when H reports it finished, or when it never goes idle", async () => {
    startTripSession("bridge-1", "s-1", "visa", now);
    expect(await settleTask("s-1", { getChanges: vi.fn().mockResolvedValueOnce(changes("completed")), cancelSession: vi.fn(async () => {}), now: () => 0 })).toBe("ended");
    startTripSession("bridge-1", "s-2", "visa", now);
    let clock = 0;
    const cancelSession = vi.fn(async () => {});
    const getChanges = vi.fn(async () => { clock += 30_000; return null; });
    expect(await settleTask("s-2", { getChanges, cancelSession, now: () => clock, maxMs: 60_000, log: () => {} })).toBe("ended");
    expect(cancelSession).toHaveBeenCalledWith("s-2");
  });
});
