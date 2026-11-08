import { offDomainHost, onDomainIndex, toAgentChanges } from "@/lib/agent-changes";
import { abandonSession, abandonedBeforeAction, hasActed, isAbandoned, STALLED, trackProgress } from "@/lib/agent-stall";
import { captureAgentScreen, finishAgentScreen } from "@/lib/agent-screen";
import { getBaliPaper } from "@/lib/bali-papers";
import { cancelSession, getChanges, isTerminalStatus } from "@/lib/h-agent";
import { fail, hErrorResponse, SESSION_ID, sessionPaper } from "@/lib/paper-agent";
import { FLIGHTS_DOMAIN, armFlightsGuard, isFlightsGuardArmed, isFlightsSession } from "@/lib/flights-agent";
import { BALI_PAPERS } from "@/lib/bali-papers";
import { endTripSession, noteTaskIndex } from "@/lib/trip-session";

// The official sites a flights session may still show before the agent opens Google (the paper filled just before).
const BALI_DOMAINS = BALI_PAPERS.map((paper) => paper.domain);

// Route 6: long poll (20 s) on H, steps summarised for the browser. Not behind api-guard: polled for the whole session.
// The agent is stopped as soon as one of its pages is outside the paper's official domain.
export async function GET(request: Request, ctx: RouteContext<"/api/agent/[id]/changes">) {
  const { id } = await ctx.params;
  if (!SESSION_ID.safeParse(id).success) return fail("Invalid session id.", 400);
  const raw = new URL(request.url).searchParams.get("from_index") ?? "0";
  const fromIndex = Number(raw);
  if (!Number.isInteger(fromIndex) || fromIndex < 0) return fail("Invalid from_index.", 400);
  // Given up as stalled: H may still call it running, but Nami reports it failed for good, so the run ends.
  const stalled = () => Response.json({
    ...toAgentChanges(null, fromIndex), no_change: true, status: "failed", error_code: STALLED, stalled_before_action: abandonedBeforeAction(id),
  });
  if (isAbandoned(id)) return stalled();
  try {
    const changes = await getChanges(id, fromIndex);
    captureAgentScreen(id, changes);
    // Ticket 20: a trip's session goes idle between two tasks; for the panel's run that is the end of its task.
    const summary = { ...toAgentChanges(changes, fromIndex), ...(changes?.status === "idle" ? { status: "completed" } : {}) };
    noteTaskIndex(id, summary.next_index);
    if (trackProgress(id, changes)) {
      const beforeAction = !hasActed(id);
      abandonSession(id);
      endTripSession(id);
      finishAgentScreen(id);
      await cancelSession(id).catch(() => {});
      console.error(`h-agent: session stalled ${beforeAction ? "before its first action" : "after acting"}, given up`);
      return Response.json({
        ...summary, status: "failed", error_code: STALLED, stalled_before_action: beforeAction,
        steps: [...summary.steps, "The agent stopped answering"],
      });
    }
    const running = changes !== null && !(changes.status !== null && isTerminalStatus(changes.status));
    // Flight sessions are known in memory only: after a server restart one counts as the e-VOA and is cut on google.com.
    // A flights session starts on whatever tab is open (often the arrival card): its guard is armed only once Google
    // Flights has been seen, else the first observation would cut the agent before it opened Google (2026-11-08).
    // Before that, only the official tabs it may start on are tolerated; events before Google are not judged by its guard.
    const flights = isFlightsSession(id);
    let left: string | null = null;
    if (running && flights && !isFlightsGuardArmed(id)) {
      const reached = onDomainIndex(changes.new_events, FLIGHTS_DOMAIN);
      if (reached !== -1) armFlightsGuard(id);
      const before = reached === -1 ? changes.new_events : changes.new_events.slice(0, reached);
      left = offDomainHost(before, FLIGHTS_DOMAIN, BALI_DOMAINS);
      if (!left && reached !== -1) left = offDomainHost(changes.new_events.slice(reached), FLIGHTS_DOMAIN);
    } else if (running) {
      left = offDomainHost(changes.new_events, flights ? FLIGHTS_DOMAIN : getBaliPaper(sessionPaper(id)).domain);
    }
    if (!left) return Response.json(summary);
    const cancelled = await cancelSession(id).then(
      () => true,
      () => false,
    );
    if (cancelled) {
      endTripSession(id);
      finishAgentScreen(id);
      return Response.json({ ...summary, left_official_site: left, cancel_failed: false });
    }
    // Cancel refused: the index does not move, so the next poll reads the same page again and retries the cancel.
    return Response.json({ ...summary, next_index: fromIndex, steps: [], left_official_site: left, cancel_failed: true });
  } catch (error) {
    return hErrorResponse(error);
  }
}
