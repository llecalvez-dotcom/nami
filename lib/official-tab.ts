import type { Trip } from "@/lib/trip-state";

export const FOCUS_OFFICIAL = "nami:focus-official";
const DONE = `${FOCUS_OFFICIAL}:done`;

export function agentOfficialUrl(trip: Pick<Trip, "agent_run" | "formalities">): string | null {
  if (trip.agent_run?.kind !== "paper") return null;
  const paper = trip.formalities.find((f) => f.id === "evoa") ?? trip.formalities.find((f) => f.required) ?? trip.formalities[0];
  return paper?.official_url ?? null;
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
