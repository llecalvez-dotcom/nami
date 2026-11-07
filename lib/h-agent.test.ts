import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentName, cancelSession, createSession, getChanges, HAgentError, sendToolResult } from "@/lib/h-agent";

const API = "https://agp.eu.hcompany.ai/api/v2";
const TOOL = { name: "ask_user", description: "Ask", input_schema: { type: "object" } };

type Call = [string, RequestInit];
function mockFetch(response: () => Response) {
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => response());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const lastCall = (fetch: ReturnType<typeof mockFetch>) => fetch.mock.calls.at(-1) as unknown as Call;

beforeEach(() => {
  vi.stubEnv("HAI_API_KEY", "h-key");
  vi.stubEnv("HAI_AGENT_NAME", "Hackathon H");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("createSession", () => {
  it("posts an inline agent on the local browser, with the tools and the caps", async () => {
    const fetch = mockFetch(() => Response.json({ id: "s-1", status: { status: "pending" } }, { status: 201 }));
    const session = await createSession({ task: "Fill it", tools: [TOOL], localBrowserSessionId: "local-42", maxTimeS: 900, maxSteps: 80 });
    expect(session).toEqual({ id: "s-1", status: "pending" });
    const [url, init] = lastCall(fetch);
    expect(url).toBe(`${API}/sessions`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer h-key");
    expect(JSON.parse(init.body as string)).toEqual({
      agent: {
        name: "hackathon-h",
        description: expect.any(String),
        environments: [{ id: "browser", kind: "web", host: "user_device", session_id: "local-42", settle_s: 2, mode: { type: "visual", markdown: true } }],
        tools: [TOOL],
      },
      messages: [{ type: "user_message", message: "Fill it" }],
      queue: false,
      max_time_s: 900,
      max_steps: 80,
    });
  });

  it("fails without HAI_API_KEY and makes no call", async () => {
    vi.stubEnv("HAI_API_KEY", "");
    const fetch = mockFetch(() => Response.json({}));
    await expect(createSession({ task: "t", tools: [], localBrowserSessionId: "l", maxTimeS: 1, maxSteps: 1 })).rejects.toMatchObject({ status: 503 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never puts the H error body in the error", async () => {
    mockFetch(() => new Response("echo: passport 24AB12345", { status: 422 }));
    const error = await createSession({ task: "t", tools: [], localBrowserSessionId: "l", maxTimeS: 1, maxSteps: 1 }).catch((e) => e);
    expect(error).toBeInstanceOf(HAgentError);
    expect(error.status).toBe(422);
    expect(error.message).not.toContain("24AB12345");
  });
});

describe("agentName", () => {
  it.each([
    ["Hackathon H", "hackathon-h"],
    ["nami-agent", "nami-agent"],
    ["", "nami-paper-agent"],
    ["h/web-surfer-flash", "nami-paper-agent"],
  ])("%s gives %s", (raw, expected) => {
    expect(agentName(raw)).toBe(expected);
  });
});

describe("getChanges", () => {
  it("long polls from the given index", async () => {
    const fetch = mockFetch(() =>
      Response.json({ status: "running", new_events: [{ type: "AgentStartedEvent", data: {} }], first_index: 3, pending_tool_calls: [] }),
    );
    const changes = await getChanges("s-1", 3);
    expect(lastCall(fetch)[0]).toBe(`${API}/sessions/s-1/changes?from_index=3&wait_for_seconds=20`);
    expect(lastCall(fetch)[1].method).toBe("GET");
    expect(changes).toMatchObject({ status: "running", first_index: 3, answer: null, metrics: null });
    expect(changes?.new_events).toHaveLength(1);
  });

  it("returns null on 204 (no new event)", async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    expect(await getChanges("s-1", 7)).toBeNull();
  });
});

describe("sendToolResult and cancelSession", () => {
  it("echoes the full tool request", async () => {
    const fetch = mockFetch(() => new Response(null, { status: 202 }));
    const toolReq = { tool_name: "ask_user", args: { question: "Email?", field: "email" }, id: "call_1" };
    await sendToolResult("s-1", toolReq, "me@example.com");
    const [url, init] = lastCall(fetch);
    expect(url).toBe(`${API}/sessions/s-1/tool_results`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ kind: "tool_result", tool_req: toolReq, result: "me@example.com" });
  });

  it("cancels with DELETE", async () => {
    const fetch = mockFetch(() => new Response(null, { status: 204 }));
    await cancelSession("s-1");
    expect(lastCall(fetch)[0]).toBe(`${API}/sessions/s-1`);
    expect(lastCall(fetch)[1].method).toBe("DELETE");
  });
});
