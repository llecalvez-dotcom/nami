import { offDomainHost, toAgentChanges } from "@/lib/agent-changes";
import { getBaliPaper } from "@/lib/bali-papers";
import { cancelSession, getChanges, isTerminalStatus } from "@/lib/h-agent";
import { fail, hErrorResponse, PILOT_PAPER_ID, SESSION_ID } from "@/lib/paper-agent";

// Route 6: long poll (20 s) on H, steps summarised for the browser. Not behind api-guard: polled for the whole session.
// The agent is stopped as soon as one of its pages is outside the paper's official domain.
export async function GET(request: Request, ctx: RouteContext<"/api/agent/[id]/changes">) {
  const { id } = await ctx.params;
  if (!SESSION_ID.safeParse(id).success) return fail("Invalid session id.", 400);
  const raw = new URL(request.url).searchParams.get("from_index") ?? "0";
  const fromIndex = Number(raw);
  if (!Number.isInteger(fromIndex) || fromIndex < 0) return fail("Invalid from_index.", 400);
  try {
    const changes = await getChanges(id, fromIndex);
    const summary = toAgentChanges(changes, fromIndex);
    const running = changes !== null && !(changes.status !== null && isTerminalStatus(changes.status));
    const left = running ? offDomainHost(changes.new_events, getBaliPaper(PILOT_PAPER_ID).domain) : null;
    if (!left) return Response.json(summary);
    const cancelled = await cancelSession(id).then(
      () => true,
      () => false,
    );
    if (cancelled) return Response.json({ ...summary, left_official_site: left, cancel_failed: false });
    // Cancel refused: the index does not move, so the next poll reads the same page again and retries the cancel.
    return Response.json({ ...summary, next_index: fromIndex, steps: [], left_official_site: left, cancel_failed: true });
  } catch (error) {
    return hErrorResponse(error);
  }
}
