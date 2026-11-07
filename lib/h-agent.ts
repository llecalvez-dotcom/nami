// REST client of the H Agents API (https://hub.hcompany.ai/agents-api), without the SDK's runSession.
// Field names follow sessions/create, your-browser, sessions/changes and sessions/tool-results.
// Nothing here logs the task, the tool arguments or the agent's answers.
import { PAPER_ANSWER_FORMAT } from "@/lib/agent-answer";

export const H_AGENTS_API = "https://agp.eu.hcompany.ai/api/v2";
const DEFAULT_AGENT_NAME = "nami-paper-agent";
const REQUEST_TIMEOUT_MS = 30_000;
export const CHANGES_WAIT_S = 20;
const AGENT_MODELS = ["holo4-27b", "holo4-35b-a3b", "holo3-1-35b-a3b", "holo3-122b-a10b"] as const;
const AGENT_REASONING = ["disabled", "low", "medium", "xhigh"] as const;

export function agentSettings(env: Record<string, string | undefined> = process.env) {
  return {
    model: AGENT_MODELS.find((model) => model === env.NAMI_AGENT_MODEL) ?? "holo4-27b",
    reasoning_effort: AGENT_REASONING.find((effort) => effort === env.NAMI_AGENT_REASONING) ?? "medium",
  };
}

export type JsonSchema = Record<string, unknown>;
export type ToolSpec = { name: string; description: string; input_schema: JsonSchema };
export type ToolRequest = { tool_name: string; args: Record<string, unknown>; id: string | null };

export type HEvent = { type: string; data: Record<string, unknown>; timestamp?: string };

export type HMetrics = {
  steps: number;
  total_cost: number | null;
  [key: string]: unknown;
};

export type HChanges = {
  status: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  error_code: string | null;
  outcome: string | null;
  answer: unknown;
  metrics: HMetrics | null;
  new_events: HEvent[];
  first_index: number | null;
  pending_tool_calls: ToolRequest[];
};

export class HAgentError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HAgentError";
  }
}

export type HClientOptions = { apiKey?: string; fetch?: typeof fetch; baseUrl?: string; sleep?: (ms: number) => Promise<void> };

function retryDelay(header: string | null, retry: number): number {
  if (header !== null && header.trim() !== "") {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return seconds >= 0 ? Math.min(seconds * 1000, 10_000) : 250 * 2 ** retry;
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.min(Math.max(0, date - Date.now()), 10_000);
  }
  return 250 * 2 ** retry;
}

function settings(options: HClientOptions) {
  const apiKey = options.apiKey ?? process.env.HAI_API_KEY;
  if (!apiKey) throw new HAgentError("HAI_API_KEY is not set", 503);
  return { apiKey, fetchImpl: options.fetch ?? fetch, baseUrl: options.baseUrl ?? H_AGENTS_API };
}

// The response body is never forwarded: a 422 may echo the request, which holds the passport.
async function call(path: string, init: RequestInit & { timeoutMs?: number }, options: HClientOptions): Promise<Response> {
  const { apiKey, fetchImpl, baseUrl } = settings(options);
  const { timeoutMs = REQUEST_TIMEOUT_MS, ...rest } = init;
  const method = rest.method ?? "GET";
  const retryable = method === "GET" || method === "DELETE"
    || (method === "POST" && path === "/sessions" && Boolean(new Headers(rest.headers).get("Idempotency-Key")));
  for (let retry = 0; ; retry++) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...rest,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...rest.headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) return response;
    await response.body?.cancel().catch(() => {});
    if (retryable && retry < 2 && (response.status === 408 || response.status === 429 || (response.status >= 500 && response.status < 600))) {
      const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
      await sleep(retryDelay(response.headers.get("Retry-After"), retry));
      continue;
    }
    throw new HAgentError(`H Agents API answered ${response.status} on ${init.method ?? "GET"} ${path.split("?")[0]}`, response.status);
  }
}

const sessionPath = (id: string) => `/sessions/${encodeURIComponent(id)}`;

// Inline agent names are kebab-case (agents/create). HAI_AGENT_NAME may be a free label: slug it.
export function agentName(raw = process.env.HAI_AGENT_NAME): string {
  const slug = (raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return slug && !slug.startsWith("h-") ? slug : DEFAULT_AGENT_NAME;
}

export type CreateSessionInput = {
  task: string;
  instructions: string;
  tools: ToolSpec[];
  localBrowserSessionId: string;
  maxTimeS: number;
  maxSteps: number;
  idempotencyKey?: string;
};

export function createSessionBody(input: CreateSessionInput) {
  return {
    agent: {
      name: agentName(),
      description: "Nami: fills in an official travel form in the traveller's own Chrome and stops before payment.",
      ...agentSettings(),
      instructions: input.instructions,
      // "web" on "user_device", attached to the session_id printed by `holo local browser` (your-browser).
      environments: [
        { id: "browser", kind: "web", host: "user_device", session_id: input.localBrowserSessionId, settle_s: 2, mode: { type: "visual", markdown: true } },
      ],
      tools: input.tools,
      answer_format: PAPER_ANSWER_FORMAT,
    },
    messages: [{ type: "user_message", message: input.task }],
    queue: false,
    max_time_s: input.maxTimeS,
    max_steps: input.maxSteps,
  };
}

export async function createSession(input: CreateSessionInput, options: HClientOptions = {}): Promise<{ id: string; status: string | null }> {
  const response = await call("/sessions", {
    method: "POST", body: JSON.stringify(createSessionBody(input)),
    ...(input.idempotencyKey ? { headers: { "Idempotency-Key": input.idempotencyKey } } : {}),
  }, options);
  const body = (await response.json()) as { id?: string; status?: { status?: string } };
  if (!body.id) throw new HAgentError("H Agents API returned no session id", 502);
  return { id: body.id, status: body.status?.status ?? null };
}

export async function getAvailableSessionSlots(options: HClientOptions = {}): Promise<number> {
  const response = await call("/sessions/quota", { method: "GET" }, options);
  const body = await response.json() as { available?: unknown };
  if (typeof body?.available !== "number" || !Number.isFinite(body.available)) throw new HAgentError("H session quota is unavailable", 502);
  return body.available;
}

// null = 204, nothing new within the wait.
export async function getChanges(id: string, fromIndex: number, options: HClientOptions & { waitForSeconds?: number } = {}): Promise<HChanges | null> {
  const wait = options.waitForSeconds ?? CHANGES_WAIT_S;
  const query = new URLSearchParams({ from_index: String(fromIndex), wait_for_seconds: String(wait) });
  const response = await call(`${sessionPath(id)}/changes?${query}`, { method: "GET", timeoutMs: (wait + 15) * 1000 }, options);
  if (response.status === 204) return null;
  const body = (await response.json()) as Partial<HChanges>;
  return {
    status: body.status ?? "running",
    started_at: body.started_at ?? null,
    finished_at: body.finished_at ?? null,
    error: body.error ?? null,
    error_code: body.error_code ?? null,
    outcome: body.outcome ?? null,
    answer: body.answer ?? null,
    metrics: body.metrics ?? null,
    new_events: body.new_events ?? [],
    first_index: body.first_index ?? null,
    pending_tool_calls: body.pending_tool_calls ?? [],
  };
}

export async function sendToolResult(id: string, toolReq: ToolRequest, result: unknown, options: HClientOptions = {}): Promise<void> {
  await call(
    `${sessionPath(id)}/tool_results`,
    { method: "POST", body: JSON.stringify({ kind: "tool_result", tool_req: toolReq, result }) },
    options,
  );
}

export async function cancelSession(id: string, options: HClientOptions = {}): Promise<void> {
  await call(sessionPath(id), { method: "DELETE" }, options);
}

export async function getSessionStatus(id: string, options: HClientOptions = {}): Promise<string> {
  const response = await call(`${sessionPath(id)}/status`, { method: "GET" }, options);
  const body = await response.json() as { status?: unknown };
  if (typeof body.status !== "string") throw new HAgentError("H session status is unavailable", 502);
  return body.status;
}

export const TERMINAL_STATUSES = ["completed", "failed", "timed_out", "interrupted"] as const;

export function isTerminalStatus(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}
