// Shared by the changes route (server) and the Trip screen (browser): plain functions, no logging.
import type { HChanges, HEvent, ToolRequest } from "@/lib/h-agent";

export type AgentMetrics = { steps: number; total_cost: number | null };

// What GET /api/agent/[id]/changes returns to the browser: steps already summarised, no screenshots.
export type AgentChanges = {
  no_change: boolean;
  status: string | null;
  next_index: number;
  steps: string[];
  pending_tool_calls: ToolRequest[];
  answer: string | null;
  outcome: string | null;
  error_code: string | null;
  metrics: AgentMetrics | null;
  // Set by the changes route when the agent left the paper's official domain: the H session was cancelled.
  left_official_site?: string;
  cancel_failed?: boolean;
};

const MAX_STEP_LENGTH = 160;

function shorten(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_STEP_LENGTH ? `${flat.slice(0, MAX_STEP_LENGTH - 1)}…` : flat;
}

function hostOfUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isToolRequest(value: unknown): value is ToolRequest {
  return typeof value === "object" && value !== null && typeof (value as ToolRequest).tool_name === "string";
}

function toolRequests(value: unknown): ToolRequest[] {
  return Array.isArray(value)
    ? value.filter(isToolRequest).map((t) => ({ tool_name: t.tool_name, args: t.args ?? {}, id: t.id ?? null }))
    : [];
}

// FNV-1a: calls without an id are keyed by a digest, so a stored key never carries the args (passport data).
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function toolCallKey(call: ToolRequest): string {
  return call.id ?? `${call.tool_name}:${digest(JSON.stringify(call.args))}`;
}

function uniqueCalls(calls: ToolRequest[]): ToolRequest[] {
  const seen = new Set<string>();
  return calls.filter((c) => {
    const key = toolCallKey(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Host of the first page (observation_event metadata.url) outside the official domain and its subdomains.
export function offDomainHost(events: HEvent[], domain: string): string | null {
  for (const event of events) {
    if (event.type !== "AgentEvent" || event.data?.kind !== "observation_event") continue;
    const host = hostOfUrl((event.data.metadata as { url?: unknown } | undefined)?.url);
    if (host && host !== domain && !host.endsWith(`.${domain}`)) return host;
  }
  return null;
}

export function summarizeEvents(events: HEvent[]): string[] {
  const steps: string[] = [];
  let lastHost: string | null = null;
  for (const event of events) {
    const data = event.data ?? {};
    switch (event.type) {
      case "AgentStartedEvent":
        steps.push("Agent started in your Chrome");
        break;
      case "AgentErrorEvent":
        steps.push("Agent failed");
        break;
      case "AgentCompletionEvent":
        steps.push("Agent finished");
        break;
      case "AgentEvent": {
        if (data.kind === "observation_event") {
          const host = hostOfUrl((data.metadata as { url?: unknown } | undefined)?.url);
          if (host && host !== lastHost) steps.push(`On ${host}`);
          lastHost = host ?? lastHost;
        } else if (data.kind === "policy_event") {
          const content = typeof data.content === "string" ? data.content.trim() : "";
          const actions = toolRequests(data.tool_reqs).map((t) => t.tool_name);
          if (content) steps.push(shorten(content));
          else if (actions.length > 0) steps.push(`Action: ${actions.join(", ")}`);
        } else if (data.kind === "error_event") {
          steps.push("A step failed, the agent retries");
        }
        break;
      }
    }
  }
  return steps;
}

export function pendingToolCalls(changes: Pick<HChanges, "pending_tool_calls" | "new_events">): ToolRequest[] {
  const fromEvents = changes.new_events
    .filter((e) => e.type === "ActiveStateChangeEvent" && e.data?.state === "awaiting_tool_results")
    .flatMap((e) => toolRequests(e.data.pending_tool_calls));
  return uniqueCalls([...toolRequests(changes.pending_tool_calls), ...fromEvents]);
}

export function toAgentChanges(changes: HChanges | null, fromIndex: number): AgentChanges {
  if (changes === null) {
    return {
      no_change: true,
      status: null,
      next_index: fromIndex,
      steps: [],
      pending_tool_calls: [],
      answer: null,
      outcome: null,
      error_code: null,
      metrics: null,
    };
  }
  const answer = changes.answer === null || changes.answer === undefined ? null : typeof changes.answer === "string" ? changes.answer : JSON.stringify(changes.answer);
  return {
    no_change: changes.new_events.length === 0,
    status: changes.status,
    next_index: (changes.first_index ?? fromIndex) + changes.new_events.length,
    steps: summarizeEvents(changes.new_events),
    pending_tool_calls: pendingToolCalls(changes),
    answer,
    outcome: changes.outcome,
    error_code: changes.error_code,
    metrics: changes.metrics ? { steps: changes.metrics.steps ?? 0, total_cost: changes.metrics.total_cost ?? null } : null,
  };
}

// Tool calls not answered yet: a call id already handled is never answered twice.
export function freshToolCalls(calls: ToolRequest[], handledKeys: readonly string[]): ToolRequest[] {
  const handled = new Set(handledKeys);
  return uniqueCalls(calls).filter((c) => !handled.has(toolCallKey(c)));
}

// Masks the passport number and the birth date anywhere they appear (agent steps, questions, answers).
export function redact(text: string, secrets: readonly (string | null | undefined)[]): string {
  return secrets.reduce<string>((out, secret) => {
    if (!secret || secret.length < 4) return out;
    const masked = `${"•".repeat(Math.max(0, secret.length - 2))}${secret.slice(-2)}`;
    return out.split(secret).join(masked);
  }, text);
}
