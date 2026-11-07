"use client";

import { useEffect, useRef } from "react";
import type { AgentChanges } from "@/lib/agent-changes";
import type { ToolRequest } from "@/lib/h-agent";
import { getTrip, saveTrip } from "@/lib/trip-store";
import { applyAgentChanges, askUserFromAgent, markToolHandled, pushAgentMessage, reportReady } from "@/lib/trip-state";

type Secrets = readonly (string | null | undefined)[];
const MAX_FAILURES = 5;
const RETRY_MS = 2_000;

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `Request failed (${response.status})`;
}

export async function sendAgentAnswer(sessionId: string, toolReq: ToolRequest, result: string): Promise<void> {
  const response = await fetch(`/api/agent/${encodeURIComponent(sessionId)}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool_req: toolReq, result }),
  });
  if (!response.ok) throw new Error(await readError(response));
}

export async function cancelAgent(sessionId: string): Promise<void> {
  const response = await fetch(`/api/agent/${encodeURIComponent(sessionId)}/cancel`, { method: "POST" });
  if (!response.ok) throw new Error(await readError(response));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function handleToolCall(tripId: string, sessionId: string, call: ToolRequest, secrets: Secrets) {
  const trip = getTrip(tripId);
  if (!trip) return;
  if (call.tool_name === "ask_user") {
    saveTrip(askUserFromAgent(trip, call, secrets));
    return;
  }
  // Marked as handled before sending, so the same call id is never answered twice.
  saveTrip(call.tool_name === "report_ready" ? reportReady(trip, call, secrets) : markToolHandled(trip, call));
  try {
    await sendAgentAnswer(sessionId, call, call.tool_name === "report_ready" ? "ok" : "Unknown tool: not available.");
  } catch (error) {
    const latest = getTrip(tripId);
    if (latest) saveTrip(pushAgentMessage(latest, `Could not confirm to the agent: ${(error as Error).message}`));
  }
}

// Polls route 6 while the live session is not drained (terminal and every event read).
export function useAgentRun(tripId: string, sessionId: string | null, enabled: boolean, secrets: Secrets) {
  const secretsRef = useRef(secrets);
  useEffect(() => {
    secretsRef.current = secrets;
  }, [secrets]);

  useEffect(() => {
    if (!enabled || !sessionId) return;
    const controller = new AbortController();
    void (async () => {
      let failures = 0;
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
          for (const call of toolCalls) await handleToolCall(tripId, sessionId, call, secretsRef.current);
        } catch (error) {
          if (controller.signal.aborted) return;
          failures += 1;
          if (failures >= MAX_FAILURES) {
            const latest = getTrip(tripId);
            if (latest) {
              saveTrip(
                pushAgentMessage(
                  latest,
                  `Lost contact with the agent: ${(error as Error).message}. Watch Chrome, and run holo local stop if needed.`,
                ),
              );
            }
            return;
          }
          await sleep(RETRY_MS);
        }
      }
    })();
    return () => controller.abort();
  }, [tripId, sessionId, enabled]);
}
