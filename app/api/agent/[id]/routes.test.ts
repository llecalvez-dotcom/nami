import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as answer } from "@/app/api/agent/[id]/answer/route";
import { POST as cancel } from "@/app/api/agent/[id]/cancel/route";
import { GET as changes } from "@/app/api/agent/[id]/changes/route";

const API = "https://agp.eu.hcompany.ai/api/v2";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as any;

let fetch: ReturnType<typeof vi.fn>;
const call = (i = 0) => fetch.mock.calls[i] as unknown as [string, RequestInit];

beforeEach(() => {
  vi.stubEnv("HAI_API_KEY", "h-key");
  fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/agent/[id]/changes (route 6)", () => {
  const get = (id: string, from = "0") => changes(new Request(`http://localhost/api/agent/${id}/changes?from_index=${from}`), ctx(id));

  it("turns a 204 into no_change and keeps the index", async () => {
    fetch.mockResolvedValue(new Response(null, { status: 204 }));
    const body = await (await get("s-1", "5")).json();
    expect(call()[0]).toBe(`${API}/sessions/s-1/changes?from_index=5&wait_for_seconds=20`);
    expect(body).toMatchObject({ no_change: true, status: null, next_index: 5, steps: [], pending_tool_calls: [] });
  });

  it("summarises the events and returns state, pending tool calls, answer and metrics", async () => {
    fetch.mockResolvedValue(
      Response.json({
        status: "awaiting_tool_results",
        answer: null,
        metrics: { steps: 4, total_cost: 0.012, cost_per_model: [] },
        first_index: 2,
        new_events: [
          { type: "AgentEvent", data: { kind: "observation_event", metadata: { url: "https://evisa.imigrasi.go.id/web/visa-selection", text: "page" } } },
          { type: "AgentEvent", data: { kind: "policy_event", content: "Selecting the B1 visa", tool_reqs: [] } },
          {
            type: "ActiveStateChangeEvent",
            data: { state: "awaiting_tool_results", pending_tool_calls: [{ tool_name: "ask_user", args: { question: "Email?", field: "email" }, id: "c1" }] },
          },
        ],
        pending_tool_calls: [{ tool_name: "ask_user", args: { question: "Email?", field: "email" }, id: "c1" }],
      }),
    );
    const body = await (await get("s-1", "2")).json();
    expect(body).toEqual({
      no_change: false,
      status: "awaiting_tool_results",
      next_index: 5,
      steps: ["On evisa.imigrasi.go.id", "Selecting the B1 visa"],
      pending_tool_calls: [{ tool_name: "ask_user", args: { question: "Email?", field: "email" }, id: "c1" }],
      answer: null,
      outcome: null,
      error_code: null,
      metrics: { steps: 4, total_cost: 0.012 },
    });
  });

  it("refuses a bad id or index without calling H", async () => {
    expect((await get("../x")).status).toBe(400);
    expect((await get("s-1", "-1")).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("POST /api/agent/[id]/answer (route 7)", () => {
  const post = (id: string, body: unknown) =>
    answer(new Request(`http://localhost/api/agent/${id}/answer`, { method: "POST", body: JSON.stringify(body) }), ctx(id));
  const toolReq = { tool_name: "ask_user", args: { question: "Email?", field: "email" }, id: "c1" };

  it("sends the tool result to H", async () => {
    fetch.mockResolvedValue(new Response(null, { status: 202 }));
    const response = await post("s-1", { tool_req: toolReq, result: "me@example.com" });
    expect(response.status).toBe(202);
    expect(call()[0]).toBe(`${API}/sessions/s-1/tool_results`);
    expect(JSON.parse(call()[1].body as string)).toEqual({ kind: "tool_result", tool_req: toolReq, result: "me@example.com" });
  });

  it("answers report_ready with ok", async () => {
    fetch.mockResolvedValue(new Response(null, { status: 202 }));
    const report = { tool_name: "report_ready", args: { summary: "Stopped", filled_fields: ["surname"] }, id: "c2" };
    await post("s-1", { tool_req: report, result: "ok" });
    expect(JSON.parse(call()[1].body as string)).toMatchObject({ tool_req: report, result: "ok" });
  });

  it("refuses an unknown tool or an empty answer", async () => {
    expect((await post("s-1", { tool_req: { ...toolReq, tool_name: "pay_now" }, result: "x" })).status).toBe(400);
    expect((await post("s-1", { tool_req: toolReq, result: " " })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("answers 409 once the session has finished", async () => {
    fetch.mockResolvedValue(new Response("done", { status: 409 }));
    expect((await post("s-1", { tool_req: toolReq, result: "me@example.com" })).status).toBe(409);
  });
});

describe("POST /api/agent/[id]/cancel (route 8)", () => {
  it("cancels the H session with DELETE", async () => {
    fetch.mockResolvedValue(new Response(null, { status: 204 }));
    const response = await cancel(new Request("http://localhost/api/agent/s-1/cancel", { method: "POST" }), ctx("s-1"));
    expect(response.status).toBe(200);
    expect(call()[0]).toBe(`${API}/sessions/s-1`);
    expect(call()[1].method).toBe("DELETE");
  });
});
