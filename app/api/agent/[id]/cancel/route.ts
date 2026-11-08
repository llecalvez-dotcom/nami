import { cancelSession, sendToolResult, type ToolRequest } from "@/lib/h-agent";
import { releaseBrowser } from "@/lib/agent-preflight";
import { finishAgentScreen } from "@/lib/agent-screen";
import { releaseSession } from "@/lib/agent-stall";
import { fail, hErrorResponse, SESSION_ID } from "@/lib/paper-agent";
import { endTripSession, isTripSession, settleTask } from "@/lib/trip-session";

// What the agent is told when its task is done: it answers and the session waits, idle, for the next task.
export const TASK_DONE_RESULT = { ok: true, note: "Thank you, this task is done. Do not touch the browser any more: answer now with your summary and wait." };

type CancelBody = { reason?: "ready" | "stop"; tool_req?: ToolRequest };

async function readBody(request: Request): Promise<CancelBody> {
  try {
    const body = (await request.json()) as CancelBody | null;
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

// Route 8: "Stop agent", and the end of a task (report_ready). The session ends interrupted on H. The browser is free
// at once for the next session: a stalled session can stay "running" on H long after the DELETE (bench 2026-11-08), it
// must not cost a 409.
// Ticket 20, one session per trip: a task's end (reason "ready") keeps the trip's session open for the next task. The
// agent gets its tool result, must stop acting, and the session goes idle; Stop agent still ends it for good.
export async function POST(request: Request, ctx: RouteContext<"/api/agent/[id]/cancel">) {
  const { id } = await ctx.params;
  if (!SESSION_ID.safeParse(id).success) return fail("Invalid session id.", 400);
  const body = await readBody(request);
  try {
    if (body.reason === "ready" && isTripSession(id)) {
      if (body.tool_req && typeof body.tool_req === "object" && body.tool_req.tool_name === "report_ready") {
        await sendToolResult(id, body.tool_req, TASK_DONE_RESULT);
      }
      releaseSession(id);
      releaseBrowser(id);
      finishAgentScreen(id);
      void settleTask(id);
      return Response.json({ ok: true, kept_open: true });
    }
    await cancelSession(id);
    endTripSession(id);
    releaseSession(id);
    releaseBrowser(id);
    finishAgentScreen(id);
    return Response.json({ ok: true });
  } catch (error) {
    return hErrorResponse(error);
  }
}
