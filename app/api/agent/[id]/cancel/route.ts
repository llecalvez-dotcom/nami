import { cancelSession } from "@/lib/h-agent";
import { finishAgentScreen } from "@/lib/agent-screen";
import { fail, hErrorResponse, SESSION_ID } from "@/lib/paper-agent";

// Route 8: "Stop agent". The session ends interrupted on H.
export async function POST(_request: Request, ctx: RouteContext<"/api/agent/[id]/cancel">) {
  const { id } = await ctx.params;
  if (!SESSION_ID.safeParse(id).success) return fail("Invalid session id.", 400);
  try {
    await cancelSession(id);
    finishAgentScreen(id);
    return Response.json({ ok: true });
  } catch (error) {
    return hErrorResponse(error);
  }
}
