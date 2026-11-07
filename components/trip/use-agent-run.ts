"use client";

import { useEffect, useRef } from "react";
import type { AgentChanges } from "@/lib/agent-changes";
import type { ToolRequest } from "@/lib/h-agent";
import { getTrip, saveTrip, subscribeTrips } from "@/lib/trip-store";
import { agentStateMessage, postAgentState } from "@/lib/agent-overlay";
import { toolCallKey } from "@/lib/agent-changes";
import { applyAgentChanges, askUserFromAgent, markToolHandled, pushAgentMessage, reportReady, recordPassportUpload } from "@/lib/trip-state";
import { FLIGHTS_REREAD_MESSAGE, FLIGHTS_UNREADABLE_MESSAGE, offerFlights } from "@/lib/flights/flow";
import type { FlightOption } from "@/lib/contracts";

type Secrets = readonly (string | null | undefined)[];
const MAX_FAILURES = 5;
const RETRY_MS = 2_000;
const SLOW_RETRY_MS = 10_000;

// Raw ask_user calls, in memory only: the stored copy is masked, H expects the call echoed as received.
const rawCalls = new Map<string, ToolRequest>();

// Keyed by session too: H call ids such as "call_1" can repeat from one session to the next.
const rawKey = (sessionId: string, call: ToolRequest) => `${sessionId}\n${toolCallKey(call)}`;

export function rawToolReq(sessionId: string, stored: ToolRequest): ToolRequest {
  return rawCalls.get(rawKey(sessionId, stored)) ?? stored;
}

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `Request failed (${response.status})`;
}

export async function sendAgentAnswer(sessionId: string, toolReq: ToolRequest, result: string): Promise<string | null> {
  const response = await fetch(`/api/agent/${encodeURIComponent(sessionId)}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool_req: toolReq, result }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = await response.json() as { upload_result?: string };
  return body.upload_result ?? null;
}

// pick_option and fill_field act in the traveller's Chrome through Nami's server (routes pick and fill).
async function actInChrome(sessionId: string, toolReq: ToolRequest, route: "pick" | "fill"): Promise<void> {
  const response = await fetch(`/api/agent/${encodeURIComponent(sessionId)}/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool_req: toolReq }),
  });
  if (!response.ok) throw new Error(await readError(response));
}

// report_flights (module Vol): Nami's server checks the reported flights against the Google Flights tab (route flights).
// Without a choice H keeps waiting; the choice goes back through the same route (sendFlightChoice).
type FlightsReport = { flights: FlightOption[]; retry?: boolean; unreadable?: boolean };

async function checkFlights(sessionId: string, toolReq: ToolRequest): Promise<FlightsReport> {
  const response = await fetch(`/api/agent/${encodeURIComponent(sessionId)}/flights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool_req: toolReq }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as FlightsReport;
}

export async function sendFlightChoice(sessionId: string, toolReq: ToolRequest, flight: FlightOption): Promise<void> {
  const response = await fetch(`/api/agent/${encodeURIComponent(sessionId)}/flights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool_req: toolReq, choice: { flight } }),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function cancelAgent(sessionId: string): Promise<void> {
  const response = await fetch(`/api/agent/${encodeURIComponent(sessionId)}/cancel`, { method: "POST" });
  if (!response.ok) throw new Error(await readError(response));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function handleToolCall(tripId: string, sessionId: string, call: ToolRequest, secrets: Secrets, failedAcks: Set<string>, signal?: AbortSignal) {
  const trip = getTrip(tripId);
  if (!trip || trip.agent_run?.session_id !== sessionId || trip.agent_run.drained) return;
  if (call.tool_name === "report_ready") {
    const key = toolCallKey(call);
    while (!signal?.aborted) {
      const current = getTrip(tripId);
      if (!current || current.agent_run?.session_id !== sessionId || current.agent_run.drained
        || current.agent_run.handled_tool_ids?.includes(key)) return;
      try {
        await cancelAgent(sessionId);
      } catch {
        const latest = getTrip(tripId);
        if (latest?.agent_run?.session_id === sessionId && !failedAcks.has(key)) {
          saveTrip(pushAgentMessage(latest, "Nami could not stop the agent at the payment page. Retrying. Do not pay yet. Watch Chrome, and run holo local stop if needed."));
        }
        failedAcks.add(key);
        await sleep(RETRY_MS);
        continue;
      }
      const latest = getTrip(tripId);
      if (latest?.agent_run?.session_id === sessionId) saveTrip(reportReady(latest, call, secrets));
      return;
    }
    return;
  }
  if (call.tool_name === "ask_user") {
    rawCalls.set(rawKey(sessionId, call), call);
    saveTrip(askUserFromAgent(trip, call, secrets));
    return;
  }
  if (call.tool_name === "report_flights") {
    let report: FlightsReport;
    try {
      report = await checkFlights(sessionId, call);
    } catch (error) {
      const latest = getTrip(tripId);
      if (latest) saveTrip(pushAgentMessage(latest, `Could not check the flights, retrying: ${(error as Error).message}`));
      await sleep(RETRY_MS);
      return;
    }
    const latest = getTrip(tripId);
    if (!latest) return;
    if (report.retry) saveTrip(pushAgentMessage(markToolHandled(latest, call), FLIGHTS_REREAD_MESSAGE));
    else if (report.unreadable) saveTrip(pushAgentMessage(markToolHandled(latest, call), FLIGHTS_UNREADABLE_MESSAGE));
    else saveTrip(offerFlights(latest, call, report.flights));
    return;
  }
  if (call.tool_name === "pick_option" || call.tool_name === "fill_field") {
    const picking = call.tool_name === "pick_option";
    try {
      await actInChrome(sessionId, call, picking ? "pick" : "fill");
    } catch (error) {
      const latest = getTrip(tripId);
      if (latest) saveTrip(pushAgentMessage(latest, `Could not ${picking ? "pick in the list" : "fill the field"}, retrying: ${(error as Error).message}`));
      await sleep(RETRY_MS);
      return;
    }
    const latest = getTrip(tripId);
    if (latest) saveTrip(markToolHandled(latest, call));
    return;
  }
  // The poll loop awaits this call, so the same call id is never sent twice at once. It is marked handled once H accepted it.
  let uploadResult: string | null = null;
  try {
    uploadResult = await sendAgentAnswer(sessionId, call,
      call.tool_name === "upload_file" ? "upload" : "Unknown tool: not available.");
  } catch (error) {
    const key = toolCallKey(call);
    const latest = getTrip(tripId);
    if (latest && !failedAcks.has(key)) saveTrip(pushAgentMessage(latest, `Could not confirm to the agent, retrying: ${(error as Error).message}`));
    failedAcks.add(key);
    await sleep(RETRY_MS);
    return;
  }
  const latest = getTrip(tripId);
  if (latest) saveTrip(call.tool_name === "upload_file" ? recordPassportUpload(latest, call, uploadResult) : markToolHandled(latest, call));
}

// Polls route 6 while the live session is not drained (terminal and every event read).
export function useAgentRun(tripId: string, sessionId: string | null, enabled: boolean, secrets: Secrets) {
  const secretsRef = useRef(secrets);
  useEffect(() => {
    secretsRef.current = secrets;
  }, [secrets]);

  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    let previous = "";
    const publish = () => {
      const trip = getTrip(tripId);
      const run = trip?.agent_run?.session_id === sessionId ? trip.agent_run : null;
      const message = agentStateMessage(run, trip?.agent_steps ?? [], secretsRef.current);
      if (!enabled) message.active = false;
      const signature = JSON.stringify([message, run?.state, trip?.agent_steps.length]);
      if (signature === previous) return;
      previous = signature;
      postAgentState(message);
    };
    publish();
    const unsubscribe = subscribeTrips(publish);
    return () => {
      unsubscribe();
      postAgentState({ type: "nami:agent-state", active: false, step: "" });
    };
  }, [tripId, sessionId, enabled]);

  useEffect(() => {
    if (!enabled || !sessionId) return;
    const controller = new AbortController();
    void (async () => {
      let failures = 0;
      const failedAcks = new Set<string>();
      while (!controller.signal.aborted) {
        const run = getTrip(tripId)?.agent_run;
        if (!run || run.session_id !== sessionId || run.drained) return;
        try {
          const response = await fetch(
            `/api/agent/${encodeURIComponent(sessionId)}/changes?from_index=${run.next_index ?? 0}`,
            { signal: controller.signal },
          );
          if (!response.ok) throw new Error(await readError(response));
          const changes = (await response.json()) as AgentChanges;
          const latest = getTrip(tripId);
          if (!latest || controller.signal.aborted || latest.agent_run?.session_id !== sessionId) return;
          const { trip, toolCalls } = applyAgentChanges(latest, changes, secretsRef.current);
          saveTrip(trip);
          failures = 0;
          if (changes.cancel_failed) await sleep(RETRY_MS);
          const ready = toolCalls.find((call) => call.tool_name === "report_ready");
          for (const call of ready ? [ready] : toolCalls) {
            if (controller.signal.aborted) return;
            await handleToolCall(tripId, sessionId, call, secretsRef.current, failedAcks, controller.signal);
            if (getTrip(tripId)?.agent_run?.drained) return;
          }
        } catch (error) {
          if (controller.signal.aborted) return;
          failures += 1;
          // Keeps polling, more slowly, so the screen catches up once the connection is back.
          if (failures === MAX_FAILURES) {
            const latest = getTrip(tripId);
            if (latest) {
              saveTrip(
                pushAgentMessage(
                  latest,
                  `Lost contact with the agent: ${(error as Error).message}. Still trying. Watch Chrome, and run holo local stop if needed.`,
                ),
              );
            }
          }
          await sleep(failures >= MAX_FAILURES ? SLOW_RETRY_MS : RETRY_MS);
        }
      }
    })();
    return () => controller.abort();
  }, [tripId, sessionId, enabled]);
}
