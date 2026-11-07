import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleToolCall, useAgentRun } from "@/components/trip/use-agent-run";
import { getTrip, saveTrip } from "@/lib/trip-store";
import { createTripFromRequest, VISA_READY_MESSAGE, type Trip } from "@/lib/trip-state";
import { TripRequestDraftSchema } from "@/lib/contracts";
import { REPORT_READY_TOOL } from "@/lib/paper-agent";

vi.mock("@/lib/trip-store", () => ({ getTrip: vi.fn(), saveTrip: vi.fn() }));
vi.mock("react", () => ({
  useEffect: (effect: () => void) => effect(),
  useRef: (current: unknown) => ({ current }),
}));

const REPORT = { tool_name: "report_ready", args: { summary: "Stopped on payment", filled_fields: ["surname"] }, id: "ready-1" };
let trip: Trip | null;
let fetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  trip = createTripFromRequest("t1", TripRequestDraftSchema.parse({ raw_text: "A trip to Bali", destination: "Bali", country_iso2: "ID" }), new Date("2026-11-08T12:00:00Z"));
  trip.agent_run = { session_id: "s-1", kind: "paper", started_at: "2026-11-08T12:00:00Z", state: "awaiting_tool_results", next_index: 0, drained: false, handled_tool_ids: [] };
  vi.mocked(getTrip).mockImplementation(() => trip);
  vi.mocked(saveTrip).mockImplementation((next) => { trip = next; });
  fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const ready = () => trip?.conversation.some((item) => item.kind === "agent" && item.text === VISA_READY_MESSAGE);
const handle = (signal?: AbortSignal) => handleToolCall("t1", "s-1", REPORT, [], new Set(), signal);

describe("payment stop", () => {
  it("declares report_ready as the final action, without asking for another answer", () => {
    expect(REPORT_READY_TOOL.description).toContain("This is your last action");
    expect(REPORT_READY_TOOL.description).not.toContain("Then answer");
  });

  it("waits for successful cancellation before handover and ignores duplicate readiness", async () => {
    let resolve!: (response: Response) => void;
    fetch.mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
    const stopping = handle();
    expect(ready()).toBe(false);
    expect(trip?.agent_run?.drained).toBe(false);
    resolve(Response.json({ ok: true }));
    await stopping;
    expect(fetch).toHaveBeenCalledWith("/api/agent/s-1/cancel", { method: "POST" });
    expect(ready()).toBe(true);
    expect(trip?.agent_run).toMatchObject({ state: "interrupted", drained: true });
    const saved = trip;
    await handle();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(trip).toBe(saved);
  });

  it("retries a failed cancel without answering ok or showing handover", async () => {
    vi.useFakeTimers();
    fetch.mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const stopping = handle();
    await vi.advanceTimersByTimeAsync(0);
    expect(ready()).toBe(false);
    expect(trip?.conversation.at(-1)).toMatchObject({ text: expect.stringContaining("could not stop the agent") });
    expect(trip?.agent_run?.handled_tool_ids).toEqual([]);
    await vi.advanceTimersByTimeAsync(2000);
    await stopping;
    expect(ready()).toBe(true);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/agent/s-1/cancel", "/api/agent/s-1/cancel"]);
  });

  it("stops retries when polling is aborted and never hands over after failure", async () => {
    vi.useFakeTimers();
    fetch.mockRejectedValue(new Error("Network unavailable"));
    const controller = new AbortController();
    const stopping = handle(controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(2000);
    await stopping;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ready()).toBe(false);
  });

  it("does nothing for a missing trip or a replaced session", async () => {
    await handleToolCall("t1", "old-session", REPORT, [], new Set());
    trip = null;
    await handle();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("prioritises readiness over other calls and stops polling after cancel success", async () => {
    fetch.mockResolvedValueOnce(Response.json({
      no_change: false, status: "awaiting_tool_results", next_index: 1, steps: [], answer: null,
      outcome: null, error_code: null, metrics: null,
      pending_tool_calls: [{ tool_name: "upload_file", args: { purpose: "passport" }, id: "upload-1" }, REPORT, REPORT],
    })).mockResolvedValueOnce(Response.json({ ok: true }));
    useAgentRun("t1", "s-1", true, []);
    await vi.waitFor(() => expect(ready()).toBe(true));
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/agent/s-1/changes?from_index=0", "/api/agent/s-1/cancel",
    ]);
    expect(trip?.agent_steps.filter((step) => step.includes("Nami stopped the agent"))).toHaveLength(1);
  });
});
