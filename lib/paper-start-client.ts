// Per scope (a trip), the key of a start whose outcome is unknown: a lost response may hide a created session.
const unsettled = new Map<string, { input: string; key: string }>();
export const H_SLOTS_BUSY = "All H agent slots are busy. Stop another agent or wait, then try again.";
// Only the busy-slots 429 is definitive: H created nothing. Any other 429 (Nami's rate guard) says nothing about a lost start.
const AMBIGUOUS = (status: number, error?: string) => status === 408 || status >= 500 || (status === 429 && error !== H_SLOTS_BUSY);

export function resetVisaStartAttempts(): void {
  unsettled.clear();
}

// A 409 right after Stop agent or a stall: the browser is being freed (bench 2026-11-08). Tried once more after 2 s
// instead of showing the error; the body of a 409 is the same on both tries, nothing was created.
// A 429 "busy" (a start of the same kind still waits for H, 30 s at most): said once, then tried again every 2 s for
// up to BUSY_WAIT_MS. A quota 429 ("Too many requests") is final and shown as it is.
export const BUSY_RETRY_MS = 2_000;
export const BUSY_WAIT_MS = 45_000;
export const STARTING_SLOW_MESSAGE = "Starting the agent, this can take up to 30 s with a slow H.";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function isBusy(response: Response): Promise<boolean> {
  if (response.status !== 429) return false;
  const body = await response.clone().json().catch(() => null) as { busy?: unknown } | null;
  return body?.busy === true;
}

export async function startWithBusyRetry(
  send: typeof fetch,
  url: string,
  init: RequestInit,
  busyRetryMs = BUSY_RETRY_MS,
  onBusy?: (message: string) => void,
  busyWaitMs = BUSY_WAIT_MS,
): Promise<Response> {
  let response = await send(url, init);
  if (response.status === 409) {
    await sleep(busyRetryMs);
    response = await send(url, init);
  }
  const start = Date.now();
  let told = false;
  while (await isBusy(response) && Date.now() - start < busyWaitMs) {
    if (!told) onBusy?.(STARTING_SLOW_MESSAGE);
    told = true;
    await sleep(busyRetryMs);
    response = await send(url, init);
  }
  return response;
}

export function createVisaStartAttempt(
  input: Record<string, unknown>,
  options: { fetch?: typeof fetch; uuid?: () => string; scope?: string; busyRetryMs?: number; onBusy?: (message: string) => void; busyWaitMs?: number; url?: string } = {},
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
      response = await startWithBusyRetry(send, options.url ?? "/api/papers/start", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: payload,
      }, options.busyRetryMs, options.onBusy, options.busyWaitMs);
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
