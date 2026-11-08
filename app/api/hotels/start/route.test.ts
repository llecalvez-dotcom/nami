import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/hotels/start/route";
import { resetGuards } from "@/lib/api-guard";
import { connectChrome } from "@/lib/chrome-cdp";
import { resetBrowserPreflight } from "@/lib/agent-preflight";
import { isFlightsSession } from "@/lib/flights-agent";
import { noteTaskIndex, resetTripSessions, SINGLE_MAX_STEPS, startTripSession, taskIdle, tripSession } from "@/lib/trip-session";

vi.mock("@/lib/chrome-cdp", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/chrome-cdp")>(),
  connectChrome: vi.fn(),
}));

const BODY = { destination: "Bali", checkin: "2026-11-23", checkout: "2026-12-03", local_session_id: "local-42" };

const start = (body: unknown) =>
  POST(new Request("http://localhost/api/hotels/start", { method: "POST", body: JSON.stringify(body) }));

let fetch: ReturnType<typeof vi.fn>;
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
    : Response.json({ id: "hotels-1", status: { status: "pending" } }, { status: 201 }));
  vi.stubGlobal("fetch", fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const posts = () => fetch.mock.calls.filter(([, init]) => (init as RequestInit)?.method === "POST") as unknown as [string, RequestInit][];

describe("POST /api/hotels/start (ticket 20: one session per trip)", () => {
  it("continues the trip's open session with the hotels task, guarded on google.com, polled from the previous task's end", async () => {
    startTripSession("local-42", "trip-1", "flights");
    noteTaskIndex("trip-1", 80);
    taskIdle("trip-1");
    const response = await start(BODY);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ session_id: "trip-1", status: "running", from_index: 80, continued: true });
    expect(posts().map(([url]) => url)).toEqual(["https://agp.eu.hcompany.ai/api/v2/sessions/trip-1/messages"]);
    const message = JSON.parse(posts()[0][1].body as string);
    expect(message.message).toContain("Google Hotels");
    expect(isFlightsSession("trip-1")).toBe(true);
    expect(tripSession("local-42")).toMatchObject({ task: "hotels", state: "running" });
  });

  it("creates the trip's session when none is open", async () => {
    const response = await start(BODY);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ session_id: "hotels-1", status: "pending", from_index: 0, continued: false });
    const body = JSON.parse(posts()[0][1].body as string);
    expect(body.max_steps).toBe(SINGLE_MAX_STEPS);
    expect(body.idle_timeout_s).toBe(600);
    expect(tripSession("local-42")).toMatchObject({ session_id: "hotels-1", task: "hotels" });
  });

  it("per_task: a new session with the hotels tools and limits, nothing remembered", async () => {
    vi.stubEnv("NAMI_H_SESSION_MODE", "per_task");
    startTripSession("local-42", "trip-1", "flights");
    taskIdle("trip-1");
    const response = await start(BODY);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ session_id: "hotels-1", status: "pending", from_index: 0, continued: false });
    const body = JSON.parse(posts()[0][1].body as string);
    expect(body.agent.tools.map((t: { name: string }) => t.name)).toEqual(["ask_user", "report_ready", "report_hotels"]);
    expect(body.max_steps).toBe(30);
    expect(body.idle_timeout_s).toBeUndefined();
    expect(posts().map(([url]) => url)).toEqual(["https://agp.eu.hcompany.ai/api/v2/sessions"]);
  });
});
