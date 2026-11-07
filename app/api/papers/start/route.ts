import { API_LIMITS, guard, readJsonLimited } from "@/lib/api-guard";
import { createSession } from "@/lib/h-agent";
import {
  buildPilotTask,
  fail,
  hErrorResponse,
  PAPER_MAX_STEPS,
  PAPER_MAX_TIME_S,
  PAPER_TOOLS,
  PaperStartSchema,
  PILOT_PAPER_ID,
} from "@/lib/paper-agent";

// Route 5. The task holds the passport for the agent only: it is never logged nor sent back.
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
  if (body.paper_id !== PILOT_PAPER_ID) return fail("Only the Bali e-VOA can be filled in by the agent for now.", 400);
  if (typeof body.local_session_id !== "string" || !body.local_session_id.trim()) {
    return fail("Missing local browser session: run holo local browser and paste its id in the demo settings (?demo=1).", 400);
  }
  const input = PaperStartSchema.safeParse(body);
  if (!input.success) {
    return fail(`Invalid request: ${input.error.issues.map((i) => i.path.join(".") || "body").join(", ")}.`, 400);
  }

  try {
    const session = await createSession({
      task: buildPilotTask(input.data),
      tools: PAPER_TOOLS,
      localBrowserSessionId: input.data.local_session_id,
      maxTimeS: PAPER_MAX_TIME_S,
      maxSteps: PAPER_MAX_STEPS,
    });
    return Response.json({ session_id: session.id, status: session.status }, { status: 201 });
  } catch (error) {
    return hErrorResponse(error);
  }
}
