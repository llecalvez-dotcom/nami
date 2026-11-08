import { flightsResult } from "@/lib/flights/flow";
import type { Paper } from "@/lib/panel-focus";
import type { Trip } from "@/lib/trip-state";

export const FOCUS_OFFICIAL = "nami:focus-official";
const DONE = `${FOCUS_OFFICIAL}:done`;

// Where each paper lives in the agent's Chrome when nothing better is known.
export const PAPER_HOME_URLS: Record<Paper, string> = {
  visa: "https://evisa.imigrasi.go.id/web/visa-selection",
  arrival_card: "https://allindonesia.imigrasi.go.id/arrival-card-submission/personal-information",
  flights: "https://www.google.com/travel/flights",
};

// The page of a paper: the one the agent opened (flights), the official form found for the trip (elsewhere than Bali,
// the visa is the required paper found live), or for Indonesia the site's own page. Null when nothing is known.
export function paperUrl(trip: Pick<Trip, "agent_run" | "formalities" | "request">, paper: Paper): string | null {
  if (paper === "flights") return flightsResult(trip.agent_run)?.url ?? PAPER_HOME_URLS.flights;
  const exact = trip.formalities.find((f) => f.id === (paper === "visa" ? "evoa" : "arrival_card"));
  if (exact) return exact.official_url;
  if (paper === "visa") {
    const found = trip.formalities.find((f) => f.required) ?? trip.formalities[0];
    if (found) return found.official_url;
  }
  return trip.request.country_iso2 === "ID" ? PAPER_HOME_URLS[paper] : null;
}

export function agentOfficialUrl(trip: Pick<Trip, "agent_run" | "formalities">): string | null {
  if (trip.agent_run?.kind === "flights") return flightsResult(trip.agent_run)?.url ?? null;
  if (trip.agent_run?.kind !== "paper") return null;
  const paper = trip.formalities.find((f) => f.id === "evoa") ?? trip.formalities.find((f) => f.required) ?? trip.formalities[0];
  return paper?.official_url ?? null;
}

// Only inside the side panel, and only an existing tab, never a new one (the agent drives its own tab: a second one
// would compete with it): brings the agent's tab to the front once the agent is seen on the site, so the traveller
// sees it arrive (Clément, 2026-11-08: the flight search started while he was still looking at the previous page).
export function focusOfficialTab(url: string, host: Host = window, waitMs = 1000, paper?: Paper): Promise<"focused" | "missing"> | null {
  const parent = host.parent as Pick<Window, "postMessage">;
  if ((parent as unknown) === host) return null;
  return new Promise((resolve) => {
    const finish = (result: "focused" | "missing") => {
      host.removeEventListener("message", onMessage);
      host.clearTimeout(timer);
      resolve(result);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== parent || event.data?.type !== DONE) return;
      finish(event.data.result === "focused" ? "focused" : "missing");
    };
    host.addEventListener("message", onMessage);
    const timer = host.setTimeout(() => finish("missing"), waitMs);
    parent.postMessage({ type: FOCUS_OFFICIAL, url, open: false, ...(paper ? { paper } : {}) }, "*");
  });
}

type Host = Pick<Window, "open" | "addEventListener" | "removeEventListener" | "setTimeout" | "clearTimeout"> & {
  parent: unknown;
};

// Inside the Chrome extension side panel, the panel brings the agent's tab to the front: any tab of the site, as the
// agent has moved to deeper pages of the form, never a new one while one is left (Clément, 2026-11-08: a new tab
// loses everything filled in); the paper tells the panel which site the page belongs to when it has moved host.
// Anywhere else (or if the panel does not answer), the official site opens in a new tab. "opened" means the
// traveller lands on the site's first page, not where the agent stopped: the panel says so.
export function showOfficialSite(url: string, host: Host = window, waitMs = 1000, paper?: Paper): Promise<"focused" | "opened"> {
  const open = () => {
    host.open(url, "_blank", "noopener");
    return "opened" as const;
  };
  const parent = host.parent as Pick<Window, "postMessage">;
  if ((parent as unknown) === host) return Promise.resolve(open());

  return new Promise((resolve) => {
    const finish = (result: "focused" | "opened") => {
      host.removeEventListener("message", onMessage);
      host.clearTimeout(timer);
      resolve(result);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== parent || event.data?.type !== DONE) return;
      finish(event.data.result === "focused" || event.data.result === "opened" ? event.data.result : open());
    };
    host.addEventListener("message", onMessage);
    const timer = host.setTimeout(() => finish(open()), waitMs);
    parent.postMessage({ type: FOCUS_OFFICIAL, url, ...(paper ? { paper } : {}) }, "*");
  });
}
