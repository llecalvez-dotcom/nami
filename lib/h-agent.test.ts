import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browserSettings, agentName, agentSettings, cancelSession, createSession, createSessionBody, getAvailableSessionSlots, getChanges, HAgentError, sendToolResult } from "@/lib/h-agent";
import { PAPER_ANSWER_FORMAT } from "@/lib/agent-answer";

const API = "https://agp.eu.hcompany.ai/api/v2";
const TOOL = { name: "ask_user", description: "Ask", input_schema: { type: "object" } };
const INPUT = { task: "Fill it", instructions: "Never submit or pay.", tools: [TOOL], localBrowserSessionId: "local-42", maxTimeS: 900, maxSteps: 80 };

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
  vi.stubEnv("NAMI_AGENT_MODEL", "");
  vi.stubEnv("NAMI_AGENT_REASONING", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("safe HTTP retries", () => {
  const input = { task: "Fictitious task", instructions: "Never submit or pay.", tools: [TOOL], localBrowserSessionId: "local-42", maxTimeS: 900, maxSteps: 80 };
  const key = "00000000-0000-4000-8000-000000000001";

  it.each([408, 429, 500, 502, 503, 599])("retries GET twice with backoff on %s", async (status) => {
    let attempt = 0;
    const fetch = mockFetch(() => ++attempt < 3 ? new Response("private response", { status }) : Response.json({ status: "running" }));
    const sleep = vi.fn(async () => {});
    expect(await getChanges("s-1", 0, { sleep })).toMatchObject({ status: "running" });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[250], [500]]);
    expect(fetch.mock.calls[0][1].signal).not.toBe(fetch.mock.calls[1][1].signal);
  });

  it.each([400, 401, 403, 404, 409, 410, 412, 413, 422])("does not retry GET on %s", async (status) => {
    const fetch = mockFetch(() => new Response("private response", { status, headers: { "Retry-After": "1" } }));
    const sleep = vi.fn(async () => {});
    await expect(getChanges("s-1", 0, { sleep })).rejects.toMatchObject({ status });
    expect(fetch).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries DELETE, capped at three attempts, without leaking the error body", async () => {
    const fetch = mockFetch(() => new Response("passport 24AB12345 private task", { status: 503 }));
    const sleep = vi.fn(async () => {});
    const error = await cancelSession("s-1", { sleep }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(HAgentError);
    expect(String(error)).not.toContain("24AB12345");
    expect(String(error)).not.toContain("private task");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("retries creation only with the same idempotency header and exact body", async () => {
    let attempt = 0;
    const fetch = mockFetch(() => ++attempt < 3 ? new Response(null, { status: 503 }) : Response.json({ id: "s-1" }));
    const sleep = vi.fn(async () => {});
    expect(await createSession({ ...input, idempotencyKey: key }, { sleep })).toMatchObject({ id: "s-1" });
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const [, init] of fetch.mock.calls) {
      expect(new Headers(init.headers).get("Idempotency-Key")).toBe(key);
      expect(init.body).toBe(fetch.mock.calls[0][1].body);
      expect(JSON.parse(init.body as string)).not.toHaveProperty("idempotencyKey");
    }
  });

  it("never retries creation without a key, or tool-results POST even with transient failures", async () => {
    const fetch = mockFetch(() => new Response(null, { status: 503 }));
    const sleep = vi.fn(async () => {});
    await expect(createSession(input, { sleep })).rejects.toMatchObject({ status: 503 });
    await expect(sendToolResult("s-1", { tool_name: "ask_user", args: {}, id: "c1" }, "fictitious", { sleep })).rejects.toMatchObject({ status: 503 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).not.toHaveBeenCalled();
  });

  it.each([["2", 2000], ["999", 10000], ["0", 0], ["not a date", 250], ["-1", 250]])(
    "honors bounded Retry-After %s", async (header, expected) => {
      let attempt = 0;
      mockFetch(() => ++attempt === 1 ? new Response(null, { status: 429, headers: { "Retry-After": String(header) } }) : Response.json({ status: "running" }));
      const sleep = vi.fn(async () => {});
      await getChanges("s-1", 0, { sleep });
      expect(sleep.mock.calls).toEqual([[expected]]);
    },
  );

  it.each([[-1000, 0], [5000, 5000], [60000, 10000]])("honors HTTP-date Retry-After offset %s", async (offset, expected) => {
    const now = Date.UTC(2026, 10, 8, 12);
    vi.spyOn(Date, "now").mockReturnValue(now);
    let attempt = 0;
    mockFetch(() => ++attempt === 1 ? new Response(null, { status: 503, headers: { "Retry-After": new Date(now + offset).toUTCString() } }) : Response.json({ status: "running" }));
    const sleep = vi.fn(async () => {});
    await getChanges("s-1", 0, { sleep });
    expect(sleep.mock.calls).toEqual([[expected]]);
  });

  it("reads only verified numeric availability from the quota endpoint", async () => {
    const fetch = mockFetch(() => Response.json({ scope: "organization", limit: 3, active: 1, available: 2 }));
    expect(await getAvailableSessionSlots()).toBe(2);
    expect(lastCall(fetch)[0]).toBe(`${API}/sessions/quota`);
    expect(lastCall(fetch)[1].method).toBe("GET");
  });

  it.each([null, {}, { available: "2" }])("rejects malformed quota data: %j", async (body) => {
    mockFetch(() => Response.json(body));
    await expect(getAvailableSessionSlots()).rejects.toMatchObject({ status: 502 });
  });
});

describe("createSession", () => {
  it("posts an inline agent on the local browser, with the tools and the caps", async () => {
    const fetch = mockFetch(() => Response.json({ id: "s-1", status: { status: "pending" } }, { status: 201 }));
    const session = await createSession(INPUT);
    expect(session).toEqual({ id: "s-1", status: "pending" });
    const [url, init] = lastCall(fetch);
    expect(url).toBe(`${API}/sessions`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer h-key");
    expect(JSON.parse(init.body as string)).toEqual({
      agent: {
        name: "hackathon-h",
        description: expect.any(String),
        model: "holo4-27b",
        reasoning_effort: "medium",
        instructions: "Never submit or pay.",
        environments: [{ id: "browser", kind: "web", host: "user_device", session_id: "local-42", settle_s: 2, mode: { type: "visual", markdown: true } }],
        tools: [TOOL],
        answer_format: PAPER_ANSWER_FORMAT,
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
    await expect(createSession(INPUT)).rejects.toMatchObject({ status: 503 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never puts the H error body in the error", async () => {
    mockFetch(() => new Response("echo: passport 24AB12345", { status: 422 }));
    const error = await createSession(INPUT).catch((e) => e);
    expect(error).toBeInstanceOf(HAgentError);
    expect(error.status).toBe(422);
    expect(error.message).not.toContain("24AB12345");
  });
});

describe("agent model and reasoning settings", () => {
  it("pins defaults independently of the trip parsing model", () => {
    expect(agentSettings({ HAI_MODEL: "holo4-35b-a3b" })).toEqual({ model: "holo4-27b", reasoning_effort: "medium" });
  });

  it.each(["holo4-27b", "holo4-35b-a3b", "holo3-1-35b-a3b"])("accepts documented model %s", (model) => {
    vi.stubEnv("NAMI_AGENT_MODEL", model);
    expect(createSessionBody(INPUT).agent.model).toBe(model);
  });

  it("refuses holo3-122b-a10b, which has no tools on H's models page", () => {
    vi.stubEnv("NAMI_AGENT_MODEL", "holo3-122b-a10b");
    expect(createSessionBody(INPUT).agent.model).toBe("holo4-27b");
  });

  it("keeps settle_s at 2 s and the page text by default, and takes the speed-run settings from the env", () => {
    expect(browserSettings({})).toEqual({ settle_s: 2, markdown: true });
    expect(browserSettings({ NAMI_AGENT_SETTLE_S: "0.5", NAMI_AGENT_MARKDOWN: "off" })).toEqual({ settle_s: 0.5, markdown: false });
    expect(browserSettings({ NAMI_AGENT_SETTLE_S: "11" }).settle_s).toBe(2);
    expect(browserSettings({ NAMI_AGENT_SETTLE_S: "x" }).settle_s).toBe(2);
    vi.stubEnv("NAMI_AGENT_SETTLE_S", "1");
    expect(createSessionBody(INPUT).agent.environments[0]).toMatchObject({ settle_s: 1, mode: { type: "visual", markdown: true } });
  });

  it.each(["disabled", "low", "medium", "xhigh"])("accepts documented Agents API reasoning %s", (effort) => {
    vi.stubEnv("NAMI_AGENT_REASONING", effort);
    expect(createSessionBody(INPUT).agent.reasoning_effort).toBe(effort);
  });

  it.each(["", "h/web-surfer-flash", "holo4-unknown", "/private/fictitious-model.jpg", "holo4-35b-a3b "])("falls back for invalid model %s", (model) => {
    vi.stubEnv("NAMI_AGENT_MODEL", model);
    expect(createSessionBody(INPUT).agent.model).toBe("holo4-27b");
  });

  it.each(["", "none", "high", "MEDIUM", "/private/fictitious-reasoning.jpg"])("falls back for invalid reasoning %s", (effort) => {
    vi.stubEnv("NAMI_AGENT_REASONING", effort);
    expect(createSessionBody(INPUT).agent.reasoning_effort).toBe("medium");
  });

  it("sends only validated defaults, never invalid environment values, to H", async () => {
    vi.stubEnv("NAMI_AGENT_MODEL", "/private/fictitious-model.jpg");
    vi.stubEnv("NAMI_AGENT_REASONING", "/private/fictitious-reasoning.jpg");
    const fetch = mockFetch(() => Response.json({ id: "s-1" }, { status: 201 }));
    await createSession(INPUT);
    const body = lastCall(fetch)[1].body as string;
    expect(JSON.parse(body).agent).toMatchObject({ model: "holo4-27b", reasoning_effort: "medium" });
    expect(body).not.toContain("/private/");
  });

  it("sends valid overrides with the standing instructions to H", async () => {
    vi.stubEnv("NAMI_AGENT_MODEL", "holo4-35b-a3b");
    vi.stubEnv("NAMI_AGENT_REASONING", "disabled");
    const fetch = mockFetch(() => Response.json({ id: "s-1" }, { status: 201 }));
    await createSession(INPUT);
    expect(JSON.parse(lastCall(fetch)[1].body as string).agent).toMatchObject({
      model: "holo4-35b-a3b", reasoning_effort: "disabled", instructions: INPUT.instructions,
    });
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
