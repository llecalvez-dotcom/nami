import { cancelSession } from "@/lib/h-agent";
import { releaseBrowser } from "@/lib/agent-preflight";
import { finishAgentScreen } from "@/lib/agent-screen";
import { releaseSession } from "@/lib/agent-stall";
import { fail, hErrorResponse, SESSION_ID } from "@/lib/paper-agent";

// Route 8: "Stop agent". The session ends interrupted on H. The browser is free at once for the next session: a
// stalled session can stay "running" on H long after the DELETE (bench 2026-11-08), it must not cost a 409.
export async function POST(_request: Request, ctx: RouteContext<"/api/agent/[id]/cancel">) {
  const { id } = await ctx.params;
  if (!SESSION_ID.safeParse(id).success) return fail("Invalid session id.", 400);
  try {
    await cancelSession(id);
    releaseSession(id);
    releaseBrowser(id);
    finishAgentScreen(id);
    return Response.json({ ok: true });
  } catch (error) {
    return hErrorResponse(error);
  }
}
