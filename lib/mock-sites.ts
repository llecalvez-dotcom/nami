// Ticket 0: local copies of the official forms (fixtures/sites, served by scripts/bench/mock-sites.mjs) stand in for
// the real sites on the test bench. Off by default; impossible in production. When on, the Bali papers point to the
// mock hosts and the domain guard, pick_option and fill_field accept them instead of the real ones.
export const MOCK_SITE_HOSTS = {
  evoa: "evoa.test.localhost",
  arrival_card: "allindonesia.test.localhost",
} as const;
export type MockSiteId = keyof typeof MOCK_SITE_HOSTS;

export const DEFAULT_MOCK_SITES_PORT = 3100;

type Env = Record<string, string | undefined>;

export function mockSitesEnabled(env: Env = process.env): boolean {
  return env.NODE_ENV !== "production" && env.NAMI_MOCK_SITES === "on";
}

export function mockSitesPort(env: Env = process.env): number {
  const port = Number(env.NAMI_MOCK_SITES_PORT);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_MOCK_SITES_PORT;
}

export function mockSiteUrl(id: MockSiteId, path: string, env: Env = process.env): string {
  return `http://${MOCK_SITE_HOSTS[id]}:${mockSitesPort(env)}${path.startsWith("/") ? path : `/${path}`}`;
}

// The hosts the CDP helpers (pick_option, fill_field, upload_file) may touch on top of the official ones: none unless on.
export function mockDomains(env: Env = process.env): string[] {
  return mockSitesEnabled(env) ? Object.values(MOCK_SITE_HOSTS) : [];
}
