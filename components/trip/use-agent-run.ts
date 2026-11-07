"use client";

import { useEffect, useRef } from "react";
import type { AgentChanges } from "@/lib/agent-changes";
import type { ToolRequest } from "@/lib/h-agent";
import { getTrip, saveTrip } from "@/lib/trip-store";
import { toolCallKey } from "@/lib/agent-changes";
import { applyAgentChanges, askUserFromAgent, markToolHandled, pushAgentMessage, reportReady } from "@/lib/trip-state";

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

async function handleToolCall(tripId: string, sessionId: string, call: ToolRequest, secrets: Secrets, failedAcks: Set<string>) {
  const trip = getTrip(tripId);
  if (!trip) return;
  if (call.tool_name === "ask_user") {
    rawCalls.set(rawKey(sessionId, call), call);
    saveTrip(askUserFromAgent(trip, call, secrets));
    return;
  }
  // The poll loop awaits this call, so the same call id is never sent twice at once. It is marked handled once H accepted it.
  try {
    await sendAgentAnswer(sessionId, call, call.tool_name === "report_ready" ? "ok" : "Unknown tool: not available.");
  } catch (error) {
    const key = toolCallKey(call);
    const latest = getTrip(tripId);
    if (latest && !failedAcks.has(key)) saveTrip(pushAgentMessage(latest, `Could not confirm to the agent, retrying: ${(error as Error).message}`));
    failedAcks.add(key);
    await sleep(RETRY_MS);
    return;
  }
  const latest = getTrip(tripId);
  if (latest) saveTrip(call.tool_name === "report_ready" ? reportReady(latest, call, secrets) : markToolHandled(latest, call));
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
          for (const call of toolCalls) {
            if (controller.signal.aborted) return;
            await handleToolCall(tripId, sessionId, call, secretsRef.current, failedAcks);
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
