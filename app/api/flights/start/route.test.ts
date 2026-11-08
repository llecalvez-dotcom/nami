import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/flights/start/route";
import { resetGuards } from "@/lib/api-guard";
import { connectChrome } from "@/lib/chrome-cdp";
import { resetBrowserPreflight } from "@/lib/agent-preflight";
import { isFlightsGuardArmed, isFlightsSession, armFlightsGuard } from "@/lib/flights-agent";
import { bindSessionPaper, sessionPaper } from "@/lib/paper-agent";
import { noteTaskIndex, resetTripSessions, SINGLE_MAX_STEPS, SINGLE_MAX_TIME_S, SINGLE_TOOLS, startTripSession, taskIdle, tripSession } from "@/lib/trip-session";

vi.mock("@/lib/chrome-cdp", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/chrome-cdp")>(),
  connectChrome: vi.fn(),
}));

const BODY = { destination: "Bali", departure_date: "2026-11-23", return_date: "2026-12-03", travellers: 2, local_session_id: "local-42" };

const start = (body: unknown) =>
  POST(new Request("http://localhost/api/flights/start", { method: "POST", body: JSON.stringify(body) }));

let fetch: ReturnType<typeof vi.fn>;
let created = 0;
beforeEach(() => {
  resetGuards();
  resetBrowserPreflight();
  resetTripSessions();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NAMI_AGENT_CHROME_PORT", "9333");
  vi.stubEnv("NAMI_LOCAL_SESSION_ID", "");
  vi.mocked(connectChrome).mockReset().mockResolvedValue({ send: vi.fn(async () => ({ targetInfos: [] })), close: vi.fn() });
  vi.stubEnv("HAI_API_KEY", "h-key");
  vi.stubEnv("HAI_AGENT_NAME", "nami-agent");
  fetch = vi.fn(async (url: string) => url.endsWith("/quota")
    ? Response.json({ scope: "organization", limit: 3, active: 0, available: 3 })
    : Response.json({ id: `flights-${++created}`, status: { status: "pending" } }, { status: 201 }));
  vi.stubGlobal("fetch", fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const sentBody = () => JSON.parse((fetch.mock.calls.find(([, init]) => init.method === "POST") as unknown as [string, RequestInit])[1].body as string);

describe("POST /api/flights/start", () => {
  it("starts a Google Flights session with the flights task, tools and limits, and binds it as a flights session", async () => {
    const response = await start(BODY);
    expect(response.status).toBe(201);
    const { session_id } = await response.json();
    expect(isFlightsSession(session_id)).toBe(true);
    const body = sentBody();
    expect(body.messages[0].message).toContain("https://www.google.com/travel/flights?q=Flights+from+Paris+to+Bali+on+2026-11-23+through+2026-12-03+for+2+adults+economy&hl=en&curr=EUR");
    expect(body.agent.instructions).toContain("Never sign in");
    // Ticket 20: with no trip session open, a new one is created for the whole trip (every task's tools, the trip's budget).
    expect(body.agent.tools.map((t: { name: string }) => t.name)).toEqual(SINGLE_TOOLS.map((t) => t.name));
    expect(body.agent.tools.map((t: { name: string }) => t.name)).toEqual(expect.arrayContaining(["ask_user", "report_ready", "report_flights", "show_return_flight"]));
    expect(body.max_steps).toBe(SINGLE_MAX_STEPS);
    expect(body.max_time_s).toBe(SINGLE_MAX_TIME_S);
    expect(body.idle_timeout_s).toBe(600);
    expect(body.agent.environments[0].session_id).toBe("local-42");
  });

  it("per_task: one session per task with the flights tools and limits, as before", async () => {
    vi.stubEnv("NAMI_H_SESSION_MODE", "per_task");
    const response = await start(BODY);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ status: "pending", from_index: 0, continued: false });
    const body = sentBody();
    expect(body.agent.tools.map((t: { name: string }) => t.name)).toEqual(["ask_user", "report_ready", "report_flights", "show_return_flight"]);
    expect(body.max_steps).toBe(40);
    expect(body.max_time_s).toBe(600);
    expect(body.idle_timeout_s).toBeUndefined();
    expect(tripSession("local-42")).toBeNull();
  });

  it("continues the trip's open session instead of creating one, re-armed for the flights", async () => {
    startTripSession("local-42", "trip-1", "visa");
    bindSessionPaper("trip-1", "arrival_card");
    armFlightsGuard("trip-1");
    noteTaskIndex("trip-1", 33);
    taskIdle("trip-1");
    const response = await start(BODY);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ session_id: "trip-1", status: "running", from_index: 33, continued: true });
    const posts = fetch.mock.calls.filter(([, init]) => (init as RequestInit)?.method === "POST") as unknown as [string, RequestInit][];
    expect(posts.map(([url]) => url)).toEqual(["https://agp.eu.hcompany.ai/api/v2/sessions/trip-1/messages"]);
    const message = JSON.parse(posts[0][1].body as string);
    expect(message.type).toBe("user_message");
    expect(message.message).toMatch(/^New task\./);
    expect(message.message).toContain("Never sign in");
    expect(message.message).toContain("https://www.google.com/travel/flights");
    expect(isFlightsSession("trip-1")).toBe(true);
    expect(isFlightsGuardArmed("trip-1")).toBe(false);
    expect(sessionPaper("trip-1")).toBe("evoa");
    expect(tripSession("local-42")).toMatchObject({ session_id: "trip-1", task: "flights", state: "running" });
  });

  it("falls back to a new session when the open one refuses the message", async () => {
    startTripSession("local-42", "trip-1", "visa");
    taskIdle("trip-1");
    fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/quota")) return Response.json({ scope: "organization", limit: 3, active: 0, available: 3 });
      if (url.endsWith("/messages")) return Response.json({ detail: "session not found" }, { status: 404 });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return Response.json({ id: "flights-new", status: { status: "pending" } }, { status: 201 });
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await start(BODY);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ session_id: "flights-new", status: "pending", from_index: 0, continued: false });
    expect(fetch.mock.calls.some(([url, init]) => url.endsWith("/sessions/trip-1") && (init as RequestInit).method === "DELETE")).toBe(true);
    expect(tripSession("local-42")).toMatchObject({ session_id: "flights-new", task: "flights" });
  });

  it.each([
    ["no return date", { ...BODY, return_date: undefined }],
    ["a return before the departure", { ...BODY, return_date: "2026-11-01" }],
    ["no destination", { ...BODY, destination: "" }],
    ["too many travellers", { ...BODY, travellers: 12 }],
    ["an invalid idempotency key", { ...BODY, idempotency_key: "nope" }],
  ])("refuses %s before calling H", async (_, body) => {
    const response = await start(body);
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a non-object body", async () => {
    expect((await start(null)).status).toBe(400);
    expect((await start("x")).status).toBe(400);
  });

  it("uses NAMI_LOCAL_SESSION_ID when the body has no local session, and fails without either", async () => {
    const { local_session_id: _omit, ...noSession } = BODY;
    void _omit;
    expect((await start(noSession)).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("NAMI_LOCAL_SESSION_ID", "server-7");
    expect((await start(noSession)).status).toBe(201);
    expect(sentBody().agent.environments[0].session_id).toBe("server-7");
  });

  it("refuses when no H slot is free, after checking Chrome", async () => {
    fetch.mockResolvedValueOnce(Response.json({ available: 0 }));
    const response = await start(BODY);
    expect(response.status).toBe(429);
    expect(vi.mocked(connectChrome).mock.invocationCallOrder[0]).toBeLessThan(fetch.mock.invocationCallOrder[0]);
    expect((await start(BODY)).status).toBe(201);
  });

  it("forwards the idempotency key to H", async () => {
    const key = "00000000-0000-4000-8000-000000000001";
    expect((await start({ ...BODY, idempotency_key: key })).status).toBe(201);
    const post = fetch.mock.calls.find(([, init]) => init.method === "POST") as unknown as [string, RequestInit];
    expect(new Headers(post[1].headers).get("Idempotency-Key")).toBe(key);
  });

  it("maps H errors without echoing them", async () => {
    fetch.mockImplementation(async (url: string) => url.endsWith("/quota") ? Response.json({ available: 1 }) : new Response("private", { status: 401 }));
    const response = await start(BODY);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("private");
  });
});
