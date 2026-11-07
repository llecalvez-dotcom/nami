import { toAgentChanges } from "@/lib/agent-changes";
import { getChanges } from "@/lib/h-agent";
import { fail, hErrorResponse, SESSION_ID } from "@/lib/paper-agent";

// Route 6: long poll (20 s) on H, steps summarised for the browser.
export async function GET(request: Request, ctx: RouteContext<"/api/agent/[id]/changes">) {
  const { id } = await ctx.params;
  if (!SESSION_ID.safeParse(id).success) return fail("Invalid session id.", 400);
  const raw = new URL(request.url).searchParams.get("from_index") ?? "0";
  const fromIndex = Number(raw);
  if (!Number.isInteger(fromIndex) || fromIndex < 0) return fail("Invalid from_index.", 400);
  try {
    return Response.json(toAgentChanges(await getChanges(id, fromIndex), fromIndex));
  } catch (error) {
    return hErrorResponse(error);
  }
}
