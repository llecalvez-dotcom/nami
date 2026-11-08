import { API_LIMITS, guard, readJsonLimited } from "@/lib/api-guard";
import { getAvailableSessionSlots } from "@/lib/h-agent";
import { AgentPreflightError, preflightBrowser } from "@/lib/agent-preflight";
import { openSearchTab } from "@/lib/agent-tab";
import { fail, H_SLOTS_BUSY, hErrorResponse } from "@/lib/paper-agent";
import { startTask } from "@/lib/trip-session";
import { bindFlightsSession } from "@/lib/flights-agent";
import { buildHotelsInstructions, buildHotelsTask, googleHotelsUrl, HOTELS_MAX_STEPS, HOTELS_MAX_TIME_S, HOTELS_TOOLS, HotelsStartSchema } from "@/lib/hotels-agent";

// Module Hôtel: starts the Google Hotels session in the traveller's Chrome. Same machinery as the flights.
export async function POST(request: Request) {
  const lease = guard(request, "papers");
  if (lease instanceof Response) return lease;
  try {
    return await start(request);
  } finally {
    lease.release();
  }
}

async function start(request: Request): Promise<Response> {
  const read = await readJsonLimited(request, API_LIMITS.papers);
  if (read instanceof Response) return read;
  const body = read.value as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return fail("Invalid request.", 400);
  const serverSession = process.env.NAMI_LOCAL_SESSION_ID?.trim();
  if ((typeof body.local_session_id !== "string" || !body.local_session_id.trim()) && serverSession) body.local_session_id = serverSession;
  if (typeof body.local_session_id !== "string" || !body.local_session_id.trim()) return fail("Missing local browser session.", 400);
  const input = HotelsStartSchema.safeParse(body);
  if (!input.success) return fail(`Invalid request: ${input.error.issues.map((i) => i.path.join(".") || "body").join(", ")}.`, 400);
  let browser: Awaited<ReturnType<typeof preflightBrowser>> | undefined;
  try {
    browser = await preflightBrowser(input.data.local_session_id);
    try {
      if (await getAvailableSessionSlots() <= 0) return fail(H_SLOTS_BUSY, 429);
    } catch {}
    const tabId = await openSearchTab(googleHotelsUrl(input.data));
    // Ticket 20: a new task on the trip's open session, or a new session (lib/trip-session.ts).
    const session = await startTask(
      { kind: "hotels", task: buildHotelsTask(input.data, tabId), instructions: buildHotelsInstructions(), tools: HOTELS_TOOLS, maxTimeS: HOTELS_MAX_TIME_S, maxSteps: HOTELS_MAX_STEPS },
      { localBrowserSessionId: input.data.local_session_id, idempotencyKey: input.data.idempotency_key },
    );
    browser.commit(session.id, input.data.idempotency_key);
    // Same guard as the flights: the agent stays on google.com.
    bindFlightsSession(session.id);
    return Response.json({ session_id: session.id, status: session.status, from_index: session.fromIndex, continued: session.continued }, { status: 201 });
  } catch (error) {
    if (error instanceof AgentPreflightError) return fail(error.message, error.status);
    return hErrorResponse(error);
  } finally {
    browser?.release();
  }
}
