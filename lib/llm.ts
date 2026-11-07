export type JsonSchema = Record<string, unknown>;

// Single-shot JSON completion: returns the raw text content of the model's answer.
export type CompleteJson = (input: { system: string; user: string; schema: JsonSchema }) => Promise<string>;

const TIMEOUT_MS = 20_000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function readJson(response: Response, provider: string): Promise<unknown> {
  if (!response.ok) throw new Error(`${provider} returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

// H answers in 1 to 3 s, but a call sometimes hangs (seen twice on 2026-11-07, given up after 20 s): a short first
// try, then one more on a timeout, a network error or a 5xx/429 answer. Never on a 4xx: the request itself is wrong.
export const H_ATTEMPTS_MS = [8_000, 10_000];

function retryable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "TimeoutError" || error.name === "AbortError" || error.name === "TypeError") return true;
  return /returned (429|5\d\d)/.test(error.message);
}

const completeWithH: CompleteJson = async (input) => {
  let lastError: unknown;
  for (const timeoutMs of H_ATTEMPTS_MS) {
    try {
      return await completeWithHOnce(input, timeoutMs);
    } catch (error) {
      lastError = error;
      if (!retryable(error)) throw error;
    }
  }
  throw lastError;
};

async function completeWithHOnce({ system, user, schema }: Parameters<CompleteJson>[0], timeoutMs: number): Promise<string> {
  const response = await fetch("https://api.hcompany.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${requireEnv("HAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.HAI_MODEL || "holo4-27b",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_schema", json_schema: { name: "trip_request", schema } },
      chat_template_kwargs: { enable_thinking: false },
      temperature: 0,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = (await readJson(response, "H Models API")) as { choices?: { message?: { content?: string | null } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("H Models API returned no content");
  return content;
}

const completeWithAnthropic: CompleteJson = async ({ system, user, schema }) => {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": requireEnv("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",
      max_tokens: 1024,
      temperature: 0,
      system: `${system}\n\nAnswer with one JSON object only, matching this JSON Schema:\n${JSON.stringify(schema)}`,
      messages: [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await readJson(response, "Anthropic")) as { content?: { type: string; text?: string }[] };
  const text = body.content?.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("Anthropic returned no text");
  return text;
};

export function completeJson(): CompleteJson {
  return process.env.LLM_PROVIDER === "anthropic" ? completeWithAnthropic : completeWithH;
}
