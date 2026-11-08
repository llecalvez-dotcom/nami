export const API_LIMITS = {
  parse: 16 * 1024,
  formalities: 16 * 1024,
  extract: 5 * 1024 * 1024 + 64 * 1024,
  transcribe: 10 * 1024 * 1024 + 64 * 1024,
  access: 1024,
  papers: 16 * 1024,
  documents: 1024,
  // One passport, photo or return ticket file, written in NAMI_DOCUMENTS_DIR: same size cap as the files found there.
  upload: 10 * 1024 * 1024 + 64 * 1024,
  screen: 1024,
  translate: 32 * 1024,
  say: 4 * 1024,
  intent: 16 * 1024,
} as const;

const QUOTA_LIMITS = {
  parse: 30,
  formalities: 20,
  transcribe: 20,
  extract: 5,
  access: 10,
  // Each call starts a paid H agent session in the traveller's Chrome. 30 per 10 min: a full run (visa, arrival card,
  // flights) plus retries hit the former 5 on the bench (2026-11-08).
  papers: 30,
  documents: 100,
  upload: 20,
  screen: 180,
  // One call per new message of Nami or step of the agent, in the traveller's language.
  translate: 200,
  // Lines read aloud through the Mac's speakers, local only.
  say: 400,
  // One call per spoken answer the closed word lists do not understand.
  intent: 200,
} as const;

const CONCURRENCY_LIMITS = {
  parse: 4,
  formalities: 3,
  transcribe: 2,
  extract: 1,
  access: 2,
  papers: 1,
  documents: 4,
  upload: 2,
  screen: 2,
  translate: 4,
  say: 2,
  intent: 4,
} as const;

const WINDOW_MS = 10 * 60 * 1000;
const ACCESS_GLOBAL_QUOTA_LIMIT = 50;
type ApiRoute = keyof typeof API_LIMITS;
type Quota = { count: number; resetAt: number };
type Lease = { release: () => void };
type GuardResult = Lease | Response;

// Quotas and concurrency are in-memory, per server instance, and reset on restart.
const quotas = new Map<string, Quota>();
const activeByRoute = new Map<ApiRoute, number>();

function tooLarge(): Response {
  return Response.json({ error: "Request too large." }, { status: 413 });
}

function clientKey(request: Request, route: ApiRoute): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  if (route === "access") return forwardedFor ? `ip:${forwardedFor}` : "anonymous";

  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    for (const item of cookieHeader.split(";")) {
      const separator = item.indexOf("=");
      if (separator < 0 || item.slice(0, separator).trim() !== "nami_access") continue;
      return `cookie:${item.slice(separator + 1).trim()}`;
    }
  }
  return forwardedFor ? `ip:${forwardedFor}` : "anonymous";
}

export function guard(request: Request, route: ApiRoute, now: () => number = Date.now): GuardResult {
  const contentLength = request.headers.get("content-length");
  if (contentLength === null && (route === "extract" || route === "transcribe" || route === "upload")) {
    return Response.json({ error: "Length required." }, { status: 411 });
  }
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > API_LIMITS[route])) return tooLarge();

  const timestamp = now();
  const quotaKeys = [JSON.stringify([route, clientKey(request, route)])];
  if (route === "access") {
    // The per-IP key is only trustworthy behind a proxy that sets x-forwarded-for; the global cap bounds guessing regardless.
    quotaKeys.push(JSON.stringify(["access", "global"]));
  }
  const requestQuotas = quotaKeys.map((key, index) => {
    const currentQuota = quotas.get(key);
    const quota =
      currentQuota && timestamp < currentQuota.resetAt
        ? currentQuota
        : { count: 0, resetAt: timestamp + WINDOW_MS };
    const limit = route === "access" && index === 1 ? ACCESS_GLOBAL_QUOTA_LIMIT : QUOTA_LIMITS[route];
    return { key, quota, limit };
  });
  const exhaustedQuota = requestQuotas.find(({ quota, limit }) => quota.count >= limit);
  if (exhaustedQuota) {
    const retryAfter = Math.max(1, Math.ceil((exhaustedQuota.quota.resetAt - timestamp) / 1000));
    return Response.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const active = activeByRoute.get(route) ?? 0;
  if (active >= CONCURRENCY_LIMITS[route]) return Response.json({ error: "Busy, try again in a moment." }, { status: 429 });

  if (quotas.size >= 1000) {
    for (const [entry, value] of quotas) {
      if (value.resetAt <= timestamp) quotas.delete(entry);
    }
  }
  for (const { key, quota } of requestQuotas) {
    quotas.set(key, { count: quota.count + 1, resetAt: quota.resetAt });
  }
  activeByRoute.set(route, active + 1);
  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      activeByRoute.set(route, Math.max(0, (activeByRoute.get(route) ?? 1) - 1));
    },
  };
}

export async function readJsonLimited(request: Request, maxBytes: number): Promise<{ value: unknown } | Response> {
  const read = await readBodyLimited(request, maxBytes);
  if (read instanceof Response) return read;
  if (read.bytes === null) return { value: null };
  const text = new TextDecoder().decode(read.bytes);
  try {
    return { value: JSON.parse(text) as unknown };
  } catch {
    return { value: null };
  }
}

// The whole body, or 413 past maxBytes whatever the Content-Length header said; null when there is no readable body.
export async function readBodyLimited(request: Request, maxBytes: number): Promise<{ bytes: Uint8Array<ArrayBuffer> | null } | Response> {
  const stream = request.body;
  if (!stream) return { bytes: null };

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // Ignore stream cancellation errors; the request is already rejected.
        }
        return tooLarge();
      }
      chunks.push(value);
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      // Ignore stream cancellation errors; the request body is unusable.
    }
    return { bytes: null };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes };
}

export function resetGuards(): void {
  quotas.clear();
  activeByRoute.clear();
}

export function quotaEntryCount(): number {
  return quotas.size;
}
