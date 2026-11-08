import { BALI_TIME_ZONE } from "@/lib/bali-papers";
import type { TripRequest } from "@/lib/contracts";
import { nextDay } from "@/lib/planner/next-question";
import { isBali } from "@/lib/planner/suggest-modules";

// Asia/Makassar has no daylight saving time.
const BALI_UTC_OFFSET = "+08:00";
const HOUR_MS = 3_600_000;

export type FormalityWindowInput = { id: string; opens_hours_before_arrival: number | null };
export type FormalityWindow = { id: string; opens_at: string | null; closes_at: string | null };

export function toBaliTime(epochMs: number): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: BALI_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(epochMs))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}${BALI_UTC_OFFSET}`;
}

// Written rule when the landing time stays unknown: 00:00 Bali time on the arrival day.
export function defaultBaliArrival(arrivalDate: string): string {
  return `${arrivalDate}T00:00${BALI_UTC_OFFSET}`;
}

// The landing used for the paper windows. Nami no longer asks for it: when it is unknown, a Bali trip is assumed to
// land the day after the departure at 00:00 Bali time. The assumption is never written into the request nor said.
export function assumedArrival(request: {
  arrival_at?: string | null;
  departure_date?: string | null;
  destination?: string | null;
  country_iso2?: string | null;
}): string | null {
  if (request.arrival_at) return request.arrival_at;
  const { departure_date, destination, country_iso2 } = request;
  if (!departure_date || !destination || !country_iso2 || !isBali({ destination, country_iso2 })) return null;
  return defaultBaliArrival(nextDay(departure_date));
}

export function formalityWindows(
  request: { arrival_at: NonNullable<TripRequest["arrival_at"]> },
  formalities: readonly FormalityWindowInput[],
): FormalityWindow[] {
  const arrivalMs = Date.parse(request.arrival_at);
  return formalities.map(({ id, opens_hours_before_arrival: hours }) =>
    hours === null
      ? { id, opens_at: null, closes_at: null }
      : { id, opens_at: toBaliTime(arrivalMs - hours * HOUR_MS), closes_at: toBaliTime(arrivalMs) },
  );
}

export function isWindowOpen(window: Pick<FormalityWindow, "opens_at" | "closes_at">, now: Date): boolean {
  const t = now.getTime();
  if (window.opens_at !== null && t < Date.parse(window.opens_at)) return false;
  return window.closes_at === null || t <= Date.parse(window.closes_at);
}
