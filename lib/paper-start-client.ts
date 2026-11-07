// Per scope (a trip), the key of a start whose outcome is unknown: a lost response may hide a created session.
const unsettled = new Map<string, { input: string; key: string }>();
const AMBIGUOUS = (status: number) => status === 408 || status === 429 || status >= 500;

export function resetVisaStartAttempts(): void {
  unsettled.clear();
}

export function createVisaStartAttempt(
  input: Record<string, unknown>,
  options: { fetch?: typeof fetch; uuid?: () => string; scope?: string } = {},
): () => Promise<string> {
  const send = options.fetch ?? fetch;
  const serialized = JSON.stringify(input);
  const previous = options.scope === undefined ? undefined : unsettled.get(options.scope);
  const key = previous?.input === serialized ? previous.key : (options.uuid ?? (() => crypto.randomUUID()))();
  const payload = JSON.stringify({ ...input, idempotency_key: key, ...(previous?.input === serialized ? { resume: true } : {}) });
  const settle = (ambiguous: boolean) => {
    if (options.scope === undefined) return;
    if (ambiguous) unsettled.set(options.scope, { input: serialized, key });
    else unsettled.delete(options.scope);
  };
  return async () => {
    let response: Response;
    try {
      response = await send("/api/papers/start", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: payload,
      });
    } catch (error) {
      settle(true);
      throw error;
    }
    const body = await response.json().catch(() => null) as { session_id?: string; error?: string } | null;
    if (!response.ok || !body?.session_id) {
      settle(response.ok || AMBIGUOUS(response.status));
      throw new Error(body?.error ?? `The agent could not start (${response.status}).`);
    }
    settle(false);
    return body.session_id;
  };
}
