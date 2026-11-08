import { afterEach, describe, expect, it } from "vitest";
import {
  abandonSession, abandonedBeforeAction, FIRST_STALL_MS, NO_SCREEN_MS, hasActed, isAbandoned, isReleased, releaseSession, resetAgentStall, STALL_MS, trackProgress,
} from "@/lib/agent-stall";
import type { HChanges } from "@/lib/h-agent";

const changes = (kinds: string[], extra: Partial<HChanges> = {}): HChanges => ({
  status: "running", started_at: null, finished_at: null, error: null, error_code: null, outcome: null, answer: null, metrics: null,
  first_index: 0, pending_tool_calls: [],
  new_events: kinds.map((kind) => kind.startsWith("state:")
    ? { type: "ActiveStateChangeEvent", data: { state: kind.slice(6) } }
    : { type: "AgentEvent", data: { kind } }),
  ...extra,
});

afterEach(() => resetAgentStall());

describe("stalled H sessions (2026-11-08: the model never answered the first screenshot)", () => {
  it("gives up quickly when H starts and never takes its first screenshot (seen on the flights, 2026-11-08)", () => {
    expect(trackProgress("s", changes(["message_event"]), 0)).toBe(false);
    expect(trackProgress("s", null, NO_SCREEN_MS - 1)).toBe(false);
    expect(trackProgress("s", null, NO_SCREEN_MS)).toBe(true);
  });

  it("does not count a message of the agent as silence once it has acted", () => {
    trackProgress("s", changes(["observation_event", "policy_event", "message_event"]), 0);
    expect(trackProgress("s", null, STALL_MS * 3)).toBe(false);
  });

  it("gives up when the first screenshot gets no answer in FIRST_STALL_MS (30 s: the slowest working start took 22 s)", () => {
    expect(FIRST_STALL_MS).toBe(30_000);
    expect(trackProgress("s", changes(["message_event", "observation_event"]), 0)).toBe(false);
    expect(trackProgress("s", null, FIRST_STALL_MS - 1)).toBe(false);
    expect(trackProgress("s", null, FIRST_STALL_MS)).toBe(true);
  });

  it("is not a stall when the first action comes after 29 s", () => {
    trackProgress("s", changes(["observation_event"]), 0);
    expect(trackProgress("s", null, 29_000)).toBe(false);
    expect(trackProgress("s", changes(["policy_event", "tool_result"]), 29_000)).toBe(false);
    expect(hasActed("s")).toBe(true);
    expect(trackProgress("s", null, 29_000 + STALL_MS - 1)).toBe(false);
    expect(trackProgress("s", null, 29_000 + STALL_MS)).toBe(true);
  });

  it("waits STALL_MS once the agent has acted", () => {
    trackProgress("s", changes(["observation_event", "policy_event", "tool_result", "observation_event"]), 0);
    expect(trackProgress("s", null, STALL_MS - 1)).toBe(false);
    expect(trackProgress("s", null, STALL_MS)).toBe(true);
  });

  it("counts a tool result with no answer as a stall too", () => {
    trackProgress("s", changes(["policy_event", "state:running", "tool_result"]), 0);
    expect(trackProgress("s", null, STALL_MS)).toBe(true);
  });

  it("never gives up while the agent waits on purpose or waits for the human", () => {
    trackProgress("w", changes(["observation_event", "policy_event"]), 0);
    expect(trackProgress("w", null, STALL_MS * 2)).toBe(false);
    trackProgress("h", changes(["policy_event", "state:awaiting_tool_results"]), 0);
    expect(trackProgress("h", null, STALL_MS * 10)).toBe(false);
    trackProgress("p", changes(["observation_event"], { pending_tool_calls: [{ tool_name: "ask_user", args: {}, id: "1" }] }), 0);
    expect(trackProgress("p", changes([], { pending_tool_calls: [{ tool_name: "ask_user", args: {}, id: "1" }] }), STALL_MS)).toBe(false);
  });

  it("restarts the clock on every new event, and ignores finished sessions", () => {
    trackProgress("s", changes(["policy_event", "observation_event"]), 0);
    trackProgress("s", changes(["observation_event"]), STALL_MS - 5);
    expect(trackProgress("s", null, STALL_MS + 1)).toBe(false);
    trackProgress("d", changes(["observation_event"]), 0);
    expect(trackProgress("d", changes([], { status: "completed" }), STALL_MS)).toBe(false);
  });

  it("remembers the sessions it gave up, and whether they had acted (restart only those that had not)", () => {
    expect(isAbandoned("s")).toBe(false);
    expect(hasActed("s")).toBe(false);
    trackProgress("s", changes(["observation_event"]), 0);
    abandonSession("s");
    expect(isAbandoned("s")).toBe(true);
    expect(isReleased("s")).toBe(true);
    expect(abandonedBeforeAction("s")).toBe(true);
    trackProgress("a", changes(["observation_event", "policy_event", "tool_result"]), 0);
    abandonSession("a");
    expect(abandonedBeforeAction("a")).toBe(false);
    expect(abandonedBeforeAction("never")).toBe(false);
  });

  it("remembers the sessions the traveller stopped: released, not abandoned (no stall reported to the panel)", () => {
    releaseSession("c");
    expect(isReleased("c")).toBe(true);
    expect(isAbandoned("c")).toBe(false);
  });
});
