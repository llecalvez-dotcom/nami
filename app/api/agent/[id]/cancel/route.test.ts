import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, TASK_DONE_RESULT } from "@/app/api/agent/[id]/cancel/route";
import { isReleased, resetAgentStall } from "@/lib/agent-stall";
import { isTripSession, resetTripSessions, startTripSession, tripSession } from "@/lib/trip-session";

const call = (id: string, body?: unknown) =>
  POST(new Request(`http://localhost/api/agent/${id}/cancel`, { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) }), { params: Promise.resolve({ id }) });

const toolReq = { tool_name: "report_ready", args: { summary: "Step 1 done" }, id: "call_7" };

let fetch: ReturnType<typeof vi.fn>;
beforeEach(() => {
  resetTripSessions();
  resetAgentStall();
  vi.stubEnv("HAI_API_KEY", "h-key");
  fetch = vi.fn(async (url: string) => url.endsWith("/changes") || url.includes("/changes?")
    ? Response.json({ status: "idle", new_events: [], first_index: 0, pending_tool_calls: [] })
    : new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const calls = () => fetch.mock.calls.map(([url, init]) => `${(init as RequestInit)?.method ?? "GET"} ${(url as string).replace("https://agp.eu.hcompany.ai/api/v2", "")}`);

describe("POST /api/agent/[id]/cancel", () => {
  it("Stop agent ends the session on H and the trip's session with it", async () => {
    startTripSession("bridge-1", "s-1", "visa");
    const response = await call("s-1", { reason: "stop" });
    expect(response.status).toBe(200);
    expect(calls()).toEqual(["DELETE /sessions/s-1"]);
    expect(isTripSession("s-1")).toBe(false);
    expect(isReleased("s-1")).toBe(true);
  });

  it("with no body (the old panel), stops as before", async () => {
    startTripSession("bridge-1", "s-1", "visa");
    expect((await call("s-1")).status).toBe(200);
    expect(calls()).toEqual(["DELETE /sessions/s-1"]);
    expect(isTripSession("s-1")).toBe(false);
  });

  it("a task's end keeps the trip's session open: the agent gets its tool result, the browser is free, no DELETE", async () => {
    startTripSession("bridge-1", "s-1", "visa");
    const response = await call("s-1", { reason: "ready", tool_req: toolReq });
    expect(await response.json()).toEqual({ ok: true, kept_open: true });
    expect(calls()[0]).toBe("POST /sessions/s-1/tool_results");
    expect(JSON.parse((fetch.mock.calls[0][1] as RequestInit).body as string)).toEqual({ kind: "tool_result", tool_req: toolReq, result: TASK_DONE_RESULT });
    expect(calls()).not.toContain("DELETE /sessions/s-1");
    expect(isReleased("s-1")).toBe(true);
    await vi.waitFor(() => expect(tripSession("bridge-1")).toMatchObject({ state: "idle" }));
    expect(isTripSession("s-1")).toBe(true);
  });

  it("a task's end on a session that is not the trip's (per_task) still ends it", async () => {
    const response = await call("s-2", { reason: "ready", tool_req: toolReq });
    expect(response.status).toBe(200);
    expect(calls()).toEqual(["DELETE /sessions/s-2"]);
  });
});
