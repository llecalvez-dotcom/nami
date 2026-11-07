// Per scope (a trip), the key of a start whose outcome is unknown: a lost response may hide a created session.
const unsettled = new Map<string, { input: string; key: string }>();
export const H_SLOTS_BUSY = "All H agent slots are busy. Stop another agent or wait, then try again.";
// Only the busy-slots 429 is definitive: H created nothing. Any other 429 (Nami's rate guard) says nothing about a lost start.
const AMBIGUOUS = (status: number, error?: string) => status === 408 || status >= 500 || (status === 429 && error !== H_SLOTS_BUSY);

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
      settle(response.ok || AMBIGUOUS(response.status, body?.error));
      throw new Error(body?.error ?? `The agent could not start (${response.status}).`);
    }
    settle(false);
    return body.session_id;
  };
}
