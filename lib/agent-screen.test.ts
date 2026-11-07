import { afterEach, describe, expect, it, vi } from "vitest";
import { captureAgentScreen, finishAgentScreen, readAgentScreen, resetAgentScreens, SCREEN_TTL_MS } from "@/lib/agent-screen";
import type { HChanges } from "@/lib/h-agent";

const base: HChanges = {
  status: "running", started_at: null, finished_at: null, error: null, error_code: null, outcome: null,
  answer: null, metrics: null, new_events: [], first_index: 0, pending_tool_calls: [],
};
const image = (text: string) => ({ type: "base64", source: Buffer.from(text).toString("base64"), media_type: "image/png" });
const observation = (text: string) => ({ type: "AgentEvent", data: { kind: "observation_event", image: image(text) } });

afterEach(() => { resetAgentScreens(); vi.useRealTimers(); });

describe("private screenshot memory", () => {
  it("keeps only the latest observation screenshot and isolates sessions", async () => {
    captureAgentScreen("s-1", { ...base, new_events: [observation("first"), observation("latest"),
      { type: "AgentEvent", data: { kind: "policy_event", image: image("not an observation") } }] });
    expect(Buffer.from((await readAgentScreen("s-1"))!.bytes).toString()).toBe("latest");
    expect(await readAgentScreen("s-2")).toBeNull();
    captureAgentScreen("s-1", null);
    expect(Buffer.from((await readAgentScreen("s-1"))!.bytes).toString()).toBe("latest");
  });

  it.each(["completed", "failed", "interrupted", "timed_out"])("retains one final fetch after %s and never restores consumed pixels", async (status) => {
    captureAgentScreen("s-1", { ...base, status, new_events: [observation("final")] });
    expect(await readAgentScreen("s-1")).not.toBeNull();
    expect(await readAgentScreen("s-1")).toBeNull();
    captureAgentScreen("s-1", { ...base, new_events: [observation("late observation")] });
    expect(await readAgentScreen("s-1")).toBeNull();
  });

  it("expires unused images and terminal tombstones on the timer", async () => {
    vi.useFakeTimers();
    captureAgentScreen("s-1", { ...base, new_events: [observation("fictitious")] });
    await vi.advanceTimersByTimeAsync(SCREEN_TTL_MS);
    expect(await readAgentScreen("s-1")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds the number of cached sessions", async () => {
    for (let i = 0; i < 11; i++) captureAgentScreen(`s-${i}`, { ...base, new_events: [observation("fictitious")] });
    expect(await readAgentScreen("s-0")).toBeNull();
    expect(await readAgentScreen("s-10")).not.toBeNull();
  });

  it("retains a cancelled session's latest image for one final fetch", async () => {
    captureAgentScreen("s-1", { ...base, new_events: [observation("fictitious")] });
    finishAgentScreen("s-1");
    expect(await readAgentScreen("s-1")).not.toBeNull();
    expect(await readAgentScreen("s-1")).toBeNull();
  });
});
