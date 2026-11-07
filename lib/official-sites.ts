export const OBSERVED_ON = "2026-11-07";

export const OFFICIAL_HOSTS: Record<string, readonly string[]> = {
  ID: ["evisa.imigrasi.go.id", "allindonesia.imigrasi.go.id", "lovebali.baliprov.go.id"],
};

export const GOVERNMENT_SUFFIXES: readonly string[] = [
  "gov",
  "mil",
  "gouv.fr",
  "diplomatie.gouv.fr",
  "europa.eu",
  "admin.ch",
  "gc.ca",
];

const GOVERNMENT_SECOND_LEVEL = new Set(["gov", "go", "gouv", "gob", "govt"]);

function hostnameOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function endsWithLabels(labels: string[], suffix: string): boolean {
  const suffixLabels = suffix.split(".");
  if (labels.length <= suffixLabels.length) return false;
  return suffixLabels.every((label, i) => labels[labels.length - suffixLabels.length + i] === label);
}

function isGovernmentHost(hostname: string): boolean {
  const labels = hostname.split(".");
  if (GOVERNMENT_SUFFIXES.some((suffix) => endsWithLabels(labels, suffix))) return true;
  const [secondLevel, topLevel] = labels.slice(-2);
  return labels.length >= 3 && topLevel.length === 2 && GOVERNMENT_SECOND_LEVEL.has(secondLevel);
}

export function isWhitelistedUrl(url: string, countryIso2: string): boolean {
  const hostname = hostnameOf(url);
  return hostname !== null && (OFFICIAL_HOSTS[countryIso2] ?? []).includes(hostname);
}

export function isOfficialUrl(url: string): boolean {
  const hostname = hostnameOf(url);
  if (hostname === null) return false;
  return Object.values(OFFICIAL_HOSTS).some((hosts) => hosts.includes(hostname)) || isGovernmentHost(hostname);
}

export const DIPLOMATIE_DOMAIN = "diplomatie.gouv.fr";

const CC_TLD: Record<string, string> = { GB: "uk" };

// Linkup's includeDomains also matches subdomains, so "go.id" covers imigrasi.go.id.
export function governmentDomainsFor(countryIso2: string): string[] {
  const tld = CC_TLD[countryIso2] ?? countryIso2.toLowerCase();
  const secondLevel = [...GOVERNMENT_SECOND_LEVEL].map((label) => `${label}.${tld}`);
  return [...new Set([DIPLOMATIE_DOMAIN, ...(OFFICIAL_HOSTS[countryIso2] ?? []), ...secondLevel])];
}

export function hostOf(url: string): string | null {
  return hostnameOf(url);
}

export function homepageOf(url: string): string | null {
  const hostname = hostnameOf(url);
  return hostname === null ? null : `https://${hostname}/`;
}

export type CheckedLink = {
  url: string;
  // Only official links are rendered as clickable.
  official: boolean;
  // The HEAD request failed: the URL was replaced by the home page of its domain.
  replaced: boolean;
};

const HEAD_TIMEOUT_MS = 4_000;

async function answers(url: string, method: "HEAD" | "GET", fetchImpl: typeof fetch, timeoutMs: number): Promise<number> {
  const response = await fetchImpl(url, {
    method,
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Nami/0.1; official link check)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  await response.body?.cancel().catch(() => {});
  return response.status;
}

export async function checkOfficialLink(
  url: string,
  { fetch: fetchImpl = fetch, timeoutMs = HEAD_TIMEOUT_MS }: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<CheckedLink> {
  if (!isOfficialUrl(url)) return { url, official: false, replaced: false };
  try {
    let status = await answers(url, "HEAD", fetchImpl, timeoutMs);
    if (status === 405 || status === 501) status = await answers(url, "GET", fetchImpl, timeoutMs);
    if (status < 400) return { url, official: true, replaced: false };
  } catch {
    // Unreachable: fall through to the home page.
  }
  const homepage = homepageOf(url)!;
  return { url: homepage, official: true, replaced: homepage !== new URL(url).toString() };
}
