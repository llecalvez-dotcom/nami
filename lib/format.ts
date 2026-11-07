import { BALI_TIME_ZONE } from "@/lib/bali-papers";

export function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

export function formatDateTime(iso: string, timeZone: string = BALI_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

// A date-time with its own UTC offset ("2026-11-16T10:00+00:00"), shown in that local time: the destination's time.
export function formatLocalDateTime(iso: string): string {
  const match = iso.match(/([+-])(\d{2}):(\d{2})$|Z$/);
  const sign = match?.[1] === "-" ? -1 : 1;
  const offsetMinutes = match?.[2] ? sign * (Number(match[2]) * 60 + Number(match[3])) : 0;
  const shifted = new Date(new Date(iso).getTime() + offsetMinutes * 60_000);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(shifted);
}

export function formatTime(iso: string, timeZone: string = "Europe/Paris"): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));
}
