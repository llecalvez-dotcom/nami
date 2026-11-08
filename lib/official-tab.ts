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

// The page of a paper: the one the agent opened (flights), the official form found for the trip, or the site's own page.
export function paperUrl(trip: Pick<Trip, "agent_run" | "formalities">, paper: Paper): string {
  if (paper === "flights") return flightsResult(trip.agent_run)?.url ?? PAPER_HOME_URLS.flights;
  const paperId = paper === "visa" ? "evoa" : "arrival_card";
  return trip.formalities.find((f) => f.id === paperId)?.official_url ?? PAPER_HOME_URLS[paper];
}

export function agentOfficialUrl(trip: Pick<Trip, "agent_run" | "formalities">): string | null {
  if (trip.agent_run?.kind === "flights") return flightsResult(trip.agent_run)?.url ?? null;
  if (trip.agent_run?.kind !== "paper") return null;
  const paper = trip.formalities.find((f) => f.id === "evoa") ?? trip.formalities.find((f) => f.required) ?? trip.formalities[0];
  return paper?.official_url ?? null;
}

// Only inside the side panel: brings the paper's tab to the front when a session starts, so the traveller sees the
// agent arrive (Clément, 2026-11-08: the flight search started while he was still looking at the previous page).
export function focusOfficialTab(url: string, host: Host = window): Promise<"focused" | "opened"> | null {
  if ((host.parent as unknown) === host) return null;
  return showOfficialSite(url, host);
}

type Host = Pick<Window, "open" | "addEventListener" | "removeEventListener" | "setTimeout" | "clearTimeout"> & {
  parent: unknown;
};

// Inside the Chrome extension side panel, the panel brings the agent's tab to the front.
// Anywhere else (or if the panel does not answer), the official site opens in a new tab.
export function showOfficialSite(url: string, host: Host = window, waitMs = 1000): Promise<"focused" | "opened"> {
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
    parent.postMessage({ type: FOCUS_OFFICIAL, url }, "*");
  });
}
