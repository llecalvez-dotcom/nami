import { API_LIMITS, guard, readJsonLimited } from "@/lib/api-guard";
import { getAvailableSessionSlots } from "@/lib/h-agent";
import { AgentPreflightError, preflightBrowser } from "@/lib/agent-preflight";
import { openSearchTab } from "@/lib/agent-tab";
import { fail, H_SLOTS_BUSY, hErrorResponse } from "@/lib/paper-agent";
import { startTask } from "@/lib/trip-session";
import {
  bindFlightsSession,
  buildFlightsInstructions,
  buildFlightsTask,
  FLIGHTS_MAX_STEPS,
  FLIGHTS_MAX_TIME_S,
  FLIGHTS_TOOLS,
  FlightsStartSchema,
  googleFlightsUrl,
} from "@/lib/flights-agent";

// Module Vol: starts the Google Flights session in the traveller's Chrome. Same machinery and same H budget as the papers.
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
  if ((typeof body.local_session_id !== "string" || !body.local_session_id.trim()) && serverSession) {
    body.local_session_id = serverSession;
  }
  if (typeof body.local_session_id !== "string" || !body.local_session_id.trim()) {
    return fail("Missing local browser session: set NAMI_LOCAL_SESSION_ID to the id printed by holo local browser, or paste it in the demo settings (?demo=1).", 400);
  }
  const input = FlightsStartSchema.safeParse(body);
  if (!input.success) {
    return fail(`Invalid request: ${input.error.issues.map((i) => i.path.join(".") || "body").join(", ")}.`, 400);
  }
  let browser: Awaited<ReturnType<typeof preflightBrowser>> | undefined;
  try {
    browser = await preflightBrowser(input.data.local_session_id);
    try {
      if (await getAvailableSessionSlots() <= 0) return fail(H_SLOTS_BUSY, 429);
    } catch {}
    const tabId = await openSearchTab(googleFlightsUrl(input.data));
    // Ticket 20: the trip's open session gets the flights as a new task; else a new session after a fresh bridge
    // (lib/trip-session.ts). Either way the guards of the previous task are gone before this one is bound.
    const session = await startTask(
      { kind: "flights", task: buildFlightsTask(input.data, tabId), instructions: buildFlightsInstructions(), tools: FLIGHTS_TOOLS, maxTimeS: FLIGHTS_MAX_TIME_S, maxSteps: FLIGHTS_MAX_STEPS },
      { localBrowserSessionId: input.data.local_session_id, idempotencyKey: input.data.idempotency_key },
    );
    browser.commit(session.id, input.data.idempotency_key);
    bindFlightsSession(session.id);
    return Response.json({ session_id: session.id, status: session.status, from_index: session.fromIndex, continued: session.continued }, { status: 201 });
  } catch (error) {
    if (error instanceof AgentPreflightError) return fail(error.message, error.status);
    return hErrorResponse(error);
  } finally {
    browser?.release();
  }
}
