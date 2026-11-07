const LINKUP_SEARCH_URL = "https://api.linkup.so/v1/search";

export type LinkupSource = { name?: string; url: string; content?: string };
export type LinkupStructuredAnswer = { data: unknown; sources: LinkupSource[] };

export class LinkupError extends Error {
  constructor(
    message: string,
    readonly kind: "timeout" | "failed",
  ) {
    super(message);
    this.name = "LinkupError";
  }
}

type SearchInput = {
  q: string;
  includeDomains: string[];
  schema: Record<string, unknown>;
  depth?: "fast" | "standard" | "deep";
};

type Options = { apiKey: string; timeoutMs: number; fetch?: typeof fetch };

// structuredOutputSchema is sent as a JSON string; with includeSources the answer is { data, sources }.
export async function linkupStructuredSearch(input: SearchInput, options: Options): Promise<LinkupStructuredAnswer> {
  const { apiKey, timeoutMs, fetch: fetchImpl = fetch } = options;
  const signal = AbortSignal.timeout(timeoutMs);
  const deadline = Date.now() + timeoutMs;
  // Linkup sometimes answers 400 or 5xx to a request that succeeds right after: one retry within the same deadline.
  for (let attempt = 1; ; attempt++) {
    let response: Response;
    try {
      response = await fetchImpl(LINKUP_SEARCH_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          q: input.q,
          depth: input.depth ?? "standard",
          outputType: "structured",
          structuredOutputSchema: JSON.stringify(input.schema),
          includeSources: true,
          includeDomains: input.includeDomains,
        }),
        signal,
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new LinkupError(`Linkup did not answer within ${Math.round(timeoutMs / 1000)} s`, "timeout");
      }
      throw new LinkupError("Linkup is unreachable", "failed");
    }
    if (response.ok) return readAnswer(response);
    const retryable = response.status === 400 || response.status === 429 || response.status >= 500;
    if (attempt >= 2 || !retryable || deadline - Date.now() < 2_000) {
      throw new LinkupError(`Linkup returned ${response.status}`, "failed");
    }
    await response.body?.cancel().catch(() => {});
  }
}

async function readAnswer(response: Response): Promise<LinkupStructuredAnswer> {
  const body = (await response.json().catch(() => null)) as { data?: unknown; sources?: unknown } | null;
  if (!body || typeof body.data !== "object" || body.data === null) throw new LinkupError("Linkup returned no data", "failed");
  const sources = Array.isArray(body.sources)
    ? body.sources.filter((s): s is LinkupSource => typeof s === "object" && s !== null && typeof s.url === "string")
    : [];
  return { data: body.data, sources };
}
