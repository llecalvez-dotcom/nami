import { API_LIMITS, guard, readJsonLimited } from "@/lib/api-guard";
import { createSession, getAvailableSessionSlots } from "@/lib/h-agent";
import { documentFilePaths } from "@/lib/documents";
import { bindSessionDocument } from "@/lib/agent-passport-upload";
import { AgentPreflightError, preflightBrowser } from "@/lib/agent-preflight";
import {
  buildPilotTask,
  buildPilotInstructions,
  fail,
  H_SLOTS_BUSY,
  hErrorResponse,
  PAPER_MAX_STEPS,
  PAPER_MAX_TIME_S,
  PAPER_TOOLS,
  PaperStartSchema,
  AGENT_PAPER_IDS,
  type AgentPaperId,
  bindSessionPaper,
} from "@/lib/paper-agent";
import { getBaliPaper } from "@/lib/bali-papers";

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
  if (!AGENT_PAPER_IDS.includes(body.paper_id as AgentPaperId)) {
    return fail("Only the Bali e-VOA and the All Indonesia arrival card can be filled in by the agent for now.", 400);
  }
  // The side panel (/panel) shows no settings: the server's NAMI_LOCAL_SESSION_ID fills the gap.
  const serverSession = process.env.NAMI_LOCAL_SESSION_ID?.trim();
  if ((typeof body.local_session_id !== "string" || !body.local_session_id.trim()) && serverSession) {
    body.local_session_id = serverSession;
  }
  if (typeof body.local_session_id !== "string" || !body.local_session_id.trim()) {
    return fail("Missing local browser session: set NAMI_LOCAL_SESSION_ID to the id printed by holo local browser, or paste it in the demo settings (?demo=1).", 400);
  }
  const input = PaperStartSchema.safeParse(body);
  if (!input.success) {
    if (input.error.issues.some((issue) => issue.path[0] === "document_id" || issue.path[0] === "photo_document_id")) {
      return fail("The passport document is no longer available. Search for your passport again.", 400);
    }
    return fail(`Invalid request: ${input.error.issues.map((i) => i.path.join(".") || "body").join(", ")}.`, 400);
  }

  const documentPaths = input.data.document_id === undefined ? [] : await documentFilePaths([input.data.document_id]);
  if (documentPaths === null) {
    return fail("The passport document is no longer available. Search for your passport again.", 400);
  }
  const photoPaths = input.data.photo_document_id === undefined ? [] : await documentFilePaths([input.data.photo_document_id], "photo");
  if (photoPaths === null) {
    return fail("The identity photo is no longer available. Search for your photo again.", 400);
  }
  let browser: Awaited<ReturnType<typeof preflightBrowser>> | undefined;
  try {
    browser = await preflightBrowser(input.data.local_session_id, undefined, input.data.resume ? input.data.idempotency_key : undefined);
    // A keyed retry may belong to a session that already holds the last slot: let H return it.
    if (!(input.data.resume && input.data.idempotency_key)) {
      try {
        if (await getAvailableSessionSlots() <= 0) return fail(H_SLOTS_BUSY, 429);
      } catch {}
    }
    const session = await createSession({
      task: buildPilotTask(input.data, getBaliPaper(input.data.paper_id)),
      instructions: buildPilotInstructions(getBaliPaper(input.data.paper_id)),
      tools: PAPER_TOOLS,
      localBrowserSessionId: input.data.local_session_id,
      maxTimeS: PAPER_MAX_TIME_S,
      maxSteps: PAPER_MAX_STEPS,
      idempotencyKey: input.data.idempotency_key,
    });
    browser.commit(session.id, input.data.idempotency_key);
    bindSessionPaper(session.id, input.data.paper_id);
    if (input.data.document_id) bindSessionDocument(session.id, documentPaths[0], photoPaths[0]);
    return Response.json({ session_id: session.id, status: session.status }, { status: 201 });
  } catch (error) {
    if (error instanceof AgentPreflightError) return fail(error.message, error.status);
    return hErrorResponse(error);
  } finally {
    browser?.release();
  }
}
