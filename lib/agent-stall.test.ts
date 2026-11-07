import { afterEach, describe, expect, it } from "vitest";
import { abandonSession, isAbandoned, resetAgentStall, STALL_MS, trackProgress } from "@/lib/agent-stall";
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
  it("gives up a session whose last screenshot got no answer for STALL_MS", () => {
    expect(trackProgress("s", changes(["message_event", "observation_event"]), 0)).toBe(false);
    expect(trackProgress("s", null, STALL_MS - 1)).toBe(false);
    expect(trackProgress("s", null, STALL_MS)).toBe(true);
  });

  it("counts a tool result with no answer as a stall too", () => {
    trackProgress("s", changes(["state:running", "tool_result"]), 0);
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
    trackProgress("s", changes(["observation_event"]), 0);
    trackProgress("s", changes(["observation_event"]), STALL_MS - 5);
    expect(trackProgress("s", null, STALL_MS + 1)).toBe(false);
    trackProgress("d", changes(["observation_event"]), 0);
    expect(trackProgress("d", changes([], { status: "completed" }), STALL_MS)).toBe(false);
  });

  it("remembers the sessions it gave up", () => {
    expect(isAbandoned("s")).toBe(false);
    abandonSession("s");
    expect(isAbandoned("s")).toBe(true);
  });
});
