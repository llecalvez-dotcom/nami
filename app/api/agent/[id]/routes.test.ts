import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as answer } from "@/app/api/agent/[id]/answer/route";
import { POST as cancel } from "@/app/api/agent/[id]/cancel/route";
import { GET as changes } from "@/app/api/agent/[id]/changes/route";
import { uploadSessionDocument } from "@/lib/agent-passport-upload";

vi.mock("@/lib/agent-passport-upload", () => ({ uploadSessionDocument: vi.fn() }));

const API = "https://agp.eu.hcompany.ai/api/v2";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as any;

let fetch: ReturnType<typeof vi.fn>;
const call = (i = 0) => fetch.mock.calls[i] as unknown as [string, RequestInit];

describe("upload_file answer", () => {
  const tool_req = { tool_name: "upload_file", args: { purpose: "passport" }, id: "upload-1" };
  const post = (body: unknown) => answer(new Request("http://localhost/api/agent/s-1/answer", {
    method: "POST", body: JSON.stringify(body),
  }), ctx("s-1"));

  it("echoes the tool request to H but only sends the server's result, never the client's forged result", async () => {
    vi.mocked(uploadSessionDocument).mockResolvedValue("uploaded");
    fetch.mockResolvedValue(new Response(null, { status: 204 }));
    const response = await post({ tool_req, result: "/unconfirmed.jpg" });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true, upload_result: "uploaded" });
    expect(uploadSessionDocument).toHaveBeenCalledWith("s-1", tool_req);
    expect(JSON.parse(call()[1].body as string)).toEqual({
      kind: "tool_result", tool_req, result: "uploaded",
    });
  });

  it.each(["no official tab", "no file input found"] as const)("forwards the safe fallback result: %s", async (result) => {
    vi.mocked(uploadSessionDocument).mockResolvedValue(result);
    fetch.mockResolvedValue(new Response(null, { status: 204 }));
    const response = await post({ tool_req, result: "upload" });
    expect(await response.json()).toEqual({ ok: true, upload_result: result });
  });

  it("rejects caller-provided paths in tool arguments before connecting or answering H", async () => {
    const response = await post({ tool_req: { ...tool_req, args: { purpose: "passport", path: "/unconfirmed.jpg" } }, result: "upload" });
    expect(response.status).toBe(400);
    expect(uploadSessionDocument).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

beforeEach(() => {
  vi.mocked(uploadSessionDocument).mockReset();
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

  const observation = (url: string) => ({ type: "AgentEvent", data: { kind: "observation_event", metadata: { url } } });
  const batch = (status: string, urls: string[], first = 0) =>
    Response.json({ status, answer: null, first_index: first, new_events: urls.map(observation), pending_tool_calls: [] });

  it("cancels the H session once when the agent leaves the official domain", async () => {
    fetch.mockResolvedValueOnce(batch("running", ["https://pay.example.com/checkout", "https://pay.example.com/card"]));
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const body = await (await get("s-1")).json();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(call(1)[0]).toBe(`${API}/sessions/s-1`);
    expect(call(1)[1].method).toBe("DELETE");
    expect(body).toMatchObject({ left_official_site: "pay.example.com", cancel_failed: false });
  });

  it("does not cancel on a subdomain of the official domain, nor once the session has ended", async () => {
    fetch.mockResolvedValueOnce(batch("running", ["https://evisa.imigrasi.go.id/a", "https://pay.evisa.imigrasi.go.id/b"]));
    const body = await (await get("s-1")).json();
    expect(body.left_official_site).toBeUndefined();
    fetch.mockResolvedValueOnce(batch("interrupted", ["https://pay.example.com/checkout"]));
    await get("s-1");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.every((c) => (c[1] as RequestInit | undefined)?.method !== "DELETE")).toBe(true);
  });

  it("ignores empty browser tabs but cancels on other browser pages and local files", async () => {
    fetch.mockResolvedValueOnce(batch("running", ["about:blank", "chrome://newtab/", "chrome://new-tab-page/"]));
    expect((await (await get("s-1")).json()).left_official_site).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    for (const [url, left] of [
      ["chrome://extensions/", "chrome://extensions"],
      ["file:///Users/clement/private/passport.jpg", "file:"],
      ["data:text/html,hi", "data:"],
    ]) {
      fetch.mockReset();
      fetch.mockResolvedValueOnce(batch("running", [url]));
      fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
      expect((await (await get("s-1")).json()).left_official_site).toBe(left);
      expect(call(1)[1].method).toBe("DELETE");
    }
  });

  it("keeps the index when the off-domain cancel failed, so the next poll retries it", async () => {
    fetch.mockResolvedValueOnce(batch("running", ["https://imigrasi.go.id.evil.example/x"], 3));
    for (let attempt = 0; attempt < 3; attempt++) {
      fetch.mockResolvedValueOnce(new Response("boom", { status: 500, headers: { "Retry-After": "0" } }));
    }
    const body = await (await get("s-1", "3")).json();
    expect(body).toMatchObject({ left_official_site: "imigrasi.go.id.evil.example", cancel_failed: true, next_index: 3, steps: [] });
    expect(fetch.mock.calls.map(([, init]) => init.method)).toEqual(["GET", "DELETE", "DELETE", "DELETE"]);
    fetch.mockResolvedValueOnce(batch("running", ["https://imigrasi.go.id.evil.example/x"], 3));
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const retried = await (await get("s-1", "3")).json();
    expect(call(5)[1].method).toBe("DELETE");
    expect(retried).toMatchObject({ cancel_failed: false, next_index: 4 });
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

  it("refuses report_ready without sending any tool result to H", async () => {
    const report = { tool_name: "report_ready", args: { summary: "Stopped", filled_fields: ["surname"] }, id: "c2" };
    expect((await post("s-1", { tool_req: report, result: "ok" })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
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
