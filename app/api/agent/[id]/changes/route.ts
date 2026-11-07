import { offDomainHost, toAgentChanges } from "@/lib/agent-changes";
import { captureAgentScreen, finishAgentScreen } from "@/lib/agent-screen";
import { getBaliPaper } from "@/lib/bali-papers";
import { cancelSession, getChanges, isTerminalStatus } from "@/lib/h-agent";
import { fail, hErrorResponse, SESSION_ID, sessionPaper } from "@/lib/paper-agent";
import { FLIGHTS_DOMAIN, isFlightsSession } from "@/lib/flights-agent";

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
    captureAgentScreen(id, changes);
    const summary = toAgentChanges(changes, fromIndex);
    const running = changes !== null && !(changes.status !== null && isTerminalStatus(changes.status));
    // Flight sessions are known in memory only: after a server restart one counts as the e-VOA and is cut on google.com.
    const left = running ? offDomainHost(changes.new_events, isFlightsSession(id) ? FLIGHTS_DOMAIN : getBaliPaper(sessionPaper(id)).domain) : null;
    if (!left) return Response.json(summary);
    const cancelled = await cancelSession(id).then(
      () => true,
      () => false,
    );
    if (cancelled) {
      finishAgentScreen(id);
      return Response.json({ ...summary, left_official_site: left, cancel_failed: false });
    }
    // Cancel refused: the index does not move, so the next poll reads the same page again and retries the cancel.
    return Response.json({ ...summary, next_index: fromIndex, steps: [], left_official_site: left, cancel_failed: true });
  } catch (error) {
    return hErrorResponse(error);
  }
}
