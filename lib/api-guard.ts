export const API_LIMITS = {
  parse: 16 * 1024,
  formalities: 16 * 1024,
  extract: 5 * 1024 * 1024 + 64 * 1024,
  transcribe: 10 * 1024 * 1024 + 64 * 1024,
} as const;

const QUOTA_LIMITS = {
  parse: 30,
  formalities: 20,
  transcribe: 20,
  extract: 5,
} as const;

const CONCURRENCY_LIMITS = {
  parse: 4,
  formalities: 3,
  transcribe: 2,
  extract: 1,
} as const;

const WINDOW_MS = 10 * 60 * 1000;
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

function clientKey(request: Request): string {
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    for (const item of cookieHeader.split(";")) {
      const separator = item.indexOf("=");
      if (separator < 0 || item.slice(0, separator).trim() !== "nami_access") continue;
      return `cookie:${item.slice(separator + 1).trim()}`;
    }
  }
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return forwardedFor ? `ip:${forwardedFor}` : "anonymous";
}

export function guard(request: Request, route: ApiRoute, now: () => number = Date.now): GuardResult {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > API_LIMITS[route])) return tooLarge();

  const timestamp = now();
  const key = JSON.stringify([route, clientKey(request)]);
  const currentQuota = quotas.get(key);
  const quota =
    currentQuota && timestamp < currentQuota.resetAt
      ? currentQuota
      : { count: 0, resetAt: timestamp + WINDOW_MS };
  if (quota.count >= QUOTA_LIMITS[route]) {
    const retryAfter = Math.max(1, Math.ceil((quota.resetAt - timestamp) / 1000));
    return Response.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const active = activeByRoute.get(route) ?? 0;
  if (active >= CONCURRENCY_LIMITS[route]) return Response.json({ error: "Busy, try again in a moment." }, { status: 429 });

  quotas.set(key, { count: quota.count + 1, resetAt: quota.resetAt });
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
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { value: null };
  }
  if (new TextEncoder().encode(text).byteLength > maxBytes) return tooLarge();
  try {
    return { value: JSON.parse(text) as unknown };
  } catch {
    return { value: null };
  }
}

export function resetGuards(): void {
  quotas.clear();
  activeByRoute.clear();
}
