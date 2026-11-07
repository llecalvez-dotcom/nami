import { describe, expect, it, vi } from "vitest";
import { agentStateMessage, postAgentState } from "./agent-overlay";
import type { AgentRun } from "./contracts";

const run = (state: AgentRun["state"]): AgentRun => ({ session_id: "s-1", kind: "paper", started_at: "2026-11-07T19:00:00Z", state });

describe("agent overlay state", () => {
  it("publishes only the latest displayed step while running", () => {
    expect(agentStateMessage(run("running"), ["Started", "Choosing FRANCE"])).toEqual({ type: "nami:agent-state", active: true, step: "Choosing FRANCE" });
  });
  it("clears the overlay without a run and accepts an empty step list", () => {
    expect(agentStateMessage(null, ["Old step"])).toEqual({ type: "nami:agent-state", active: false, step: "" });
    expect(agentStateMessage(run("pending"), [])).toMatchObject({ active: true, step: "" });
  });
  it.each(["pending", "queued", "running", "awaiting_tool_results", "paused", "idle"] as const)("keeps the active frame in nonterminal state %s", (state) => {
    expect(agentStateMessage(run(state), ["Last step"]).active).toBe(true);
    expect(agentStateMessage({ ...run(state), drained: true }, []).active).toBe(false);
    expect(agentStateMessage({ ...run(state), pending_question: { tool_req: "q", question: "Email?", field: "email" } }, []).active).toBe(false);
  });
  it.each(["interrupted", "completed", "failed", "timed_out"] as const)("removes the active frame in state %s", (state) => {
    expect(agentStateMessage(run(state), ["Last step"]).active).toBe(false);
  });
  it("removes the active frame for a pending question or drained run", () => {
    expect(agentStateMessage({ ...run("running"), drained: true }, []).active).toBe(false);
    expect(agentStateMessage({ ...run("running"), pending_question: { tool_req: "q", question: "Email?", field: "email" } }, []).active).toBe(false);
  });
  it("redacts secrets and never copies raw run fields into the message", () => {
    const message = agentStateMessage({ ...run("running"), result: { passport: "AB1234567" }, error: "1990-01-01" }, ["Typing AB1234567, born 1990-01-01"], ["AB1234567", "1990-01-01"]);
    expect(JSON.stringify(message)).not.toContain("AB1234567");
    expect(JSON.stringify(message)).not.toContain("1990-01-01");
    expect(Object.keys(message)).toEqual(["type", "active", "step"]);
  });
  it("normalizes forbidden UI dashes", () => {
    expect(agentStateMessage(run("running"), ["Choosing — France – now"]).step).not.toMatch(/[–—]/);
  });
  it("posts to the parent only inside a panel iframe", () => {
    const postMessage = vi.fn();
    const parent = { postMessage };
    const message = agentStateMessage(run("running"), ["Choosing FRANCE"]);
    postAgentState(message, { parent });
    expect(postMessage).toHaveBeenCalledExactlyOnceWith(message, "*");
    const top = { parent: null as unknown as typeof parent, postMessage };
    top.parent = top;
    postAgentState(message, top);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });
});
