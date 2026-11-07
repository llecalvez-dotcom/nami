import { nextQuestion } from "@/lib/planner";
import { isAgentActive, type Trip } from "@/lib/trip-state";

export type TripStatus = "planned" | "in_progress" | "ready";
export type CountryStatus = "home" | TripStatus | "wish";

export type ProgressStep = { id: string; label: string; detail: string; state: "done" | "current" | "todo" };

function noPapersNeeded(trip: Trip): boolean {
  return trip.modules.some((m) => m.module === "papers" && m.state === "none_needed");
}

export function tripStatus(trip: Trip): TripStatus {
  if (noPapersNeeded(trip)) return "ready";
  if (trip.formalities.length > 0 && trip.formalities.every((f) => f.status === "confirmed")) return "ready";
  const papersAccepted = trip.modules.some((m) => m.module === "papers" && m.state === "accepted");
  if (papersAccepted || trip.formalities.length > 0 || trip.agent_run) return "in_progress";
  return "planned";
}

// The path of a visa file, from the first sentence to the paper in hand.
export function visaSteps(trip: Trip): ProgressStep[] {
  const detailsDone = nextQuestion(trip.request) === null;
  const none = noPapersNeeded(trip);
  const papersFound = trip.formalities.length > 0 || none;
  const run = trip.agent_run;
  const agentDone = none || run?.state === "completed";
  const awaitingYou = trip.formalities.some((f) => f.status === "pending_approval");
  const allConfirmed = none || (trip.formalities.length > 0 && trip.formalities.every((f) => f.status === "confirmed"));

  const raw: { id: string; label: string; detail: string; done: boolean; active?: boolean }[] = [
    { id: "details", label: "Trip details", detail: "Dates, passport, landing time", done: detailsDone },
    {
      id: "papers",
      label: "Entry papers found",
      detail: none ? "No visa needed for this trip" : `${trip.formalities.length || "No"} paper${trip.formalities.length === 1 ? "" : "s"} on official sites`,
      done: papersFound,
    },
    {
      id: "agent",
      label: "Agent fills the forms",
      detail: run ? `Agent ${run.state.replaceAll("_", " ")}` : "Waits for your go",
      done: agentDone,
      active: isAgentActive(run),
    },
    {
      id: "check",
      label: "You check and pay",
      detail: awaitingYou ? "Waiting for you on the official site" : "Nami never pays for you",
      done: allConfirmed,
      active: awaitingYou,
    },
    { id: "ready", label: "Ready to travel", detail: "Every paper confirmed", done: allConfirmed },
  ];
  const firstOpen = raw.findIndex((s) => !s.done);
  return raw.map((s, i) => ({
    id: s.id,
    label: s.label,
    detail: s.detail,
    state: s.done ? "done" : s.active || i === firstOpen ? "current" : "todo",
  }));
}

export function progressRatio(trip: Trip): number {
  const steps = visaSteps(trip);
  return steps.filter((s) => s.state === "done").length / steps.length;
}

export function homeCountry(trips: (Pick<Trip, "request"> & { sample?: boolean })[], fallback = "FR"): string {
  const real = trips.filter((t) => !t.sample);
  const counts = new Map<string, number>();
  for (const t of real.length ? real : trips) {
    const iso = t.request.origin_country ?? t.request.nationality;
    if (iso) counts.set(iso, (counts.get(iso) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
}

export type MapCountry = { iso2: string; status: CountryStatus; trips: Trip[] };

const PRIORITY: CountryStatus[] = ["home", "in_progress", "ready", "planned", "wish"];

export function mapCountries(trips: Trip[], wishlist: string[], home: string): Record<string, MapCountry> {
  const out: Record<string, MapCountry> = {};
  const put = (iso2: string, status: CountryStatus, trip?: Trip) => {
    const current = out[iso2] ?? { iso2, status, trips: [] };
    if (PRIORITY.indexOf(status) < PRIORITY.indexOf(current.status)) current.status = status;
    if (trip) current.trips.push(trip);
    out[iso2] = current;
  };
  put(home, "home");
  for (const trip of trips) {
    if (trip.request.country_iso2) put(trip.request.country_iso2, tripStatus(trip), trip);
  }
  for (const iso2 of wishlist) put(iso2, "wish");
  return out;
}
