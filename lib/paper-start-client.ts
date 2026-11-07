export function createVisaStartAttempt(
  input: Record<string, unknown>,
  options: { fetch?: typeof fetch; uuid?: () => string } = {},
): () => Promise<string> {
  const send = options.fetch ?? fetch;
  const payload = JSON.stringify({ ...input, idempotency_key: (options.uuid ?? (() => crypto.randomUUID()))() });
  return async () => {
    const response = await send("/api/papers/start", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: payload,
    });
    const body = await response.json().catch(() => null) as { session_id?: string; error?: string } | null;
    if (!response.ok || !body?.session_id) throw new Error(body?.error ?? `The agent could not start (${response.status}).`);
    return body.session_id;
  };
}
