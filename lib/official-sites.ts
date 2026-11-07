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
