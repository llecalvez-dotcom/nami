import type { TripRequestDraft } from "@/lib/contracts";
import { countryName } from "@/lib/countries";

// A correction heard in any sentence ("non, Toulouse, pas Lyon", "finalement le 14"): what changed in the request,
// said back in one sentence, and which searches it touches. Pure.

export const CORRECTABLE_FIELDS = ["origin", "departure_date", "return_date", "destination", "travellers", "nationality"] as const;
export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];
export type RequestChange = { field: CorrectableField; from: string | number | null; to: string | number };
export type Search = "flights" | "hotels" | "papers";

// The fields the parsed request changes, apart from the one the open question asked (that one is an answer, not a
// correction). A field emptied by the model is never a change: Nami forgets nothing on a silence.
export function requestChanges(before: TripRequestDraft, after: TripRequestDraft, except?: string): RequestChange[] {
  const changes: RequestChange[] = [];
  for (const field of CORRECTABLE_FIELDS) {
    if (field === except) continue;
    const to = after[field];
    const from = before[field];
    if (to === null || to === undefined || to === from) continue;
    changes.push({ field, from: from ?? null, to });
  }
  return changes;
}

const longDate = (iso: string | number) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

function phrase(change: RequestChange): string {
  const { field, from, to } = change;
  const not = (text: string) => (from === null ? "" : `, not ${text}`);
  switch (field) {
    case "origin":
      return `you leave from ${to}${not(String(from))}`;
    case "departure_date":
      return `you leave on ${longDate(to)}${from === null ? "" : `, not ${longDate(from)}`}`;
    case "return_date":
      return `you come back on ${longDate(to)}${from === null ? "" : `, not ${longDate(from)}`}`;
    case "destination":
      return `you go to ${to}${not(String(from))}`;
    case "travellers":
      return `${to} traveller${Number(to) > 1 ? "s" : ""}${not(String(from))}`;
    case "nationality":
      return `your passport is ${countryName(String(to))}${from === null ? "" : `, not ${countryName(String(from))}`}`;
  }
}

export function changeSentence(changes: RequestChange[]): string | null {
  if (changes.length === 0) return null;
  return `Noted: ${changes.map(phrase).join("; ")}.`;
}

const TOUCHES: Record<CorrectableField, Search[]> = {
  origin: ["flights"],
  departure_date: ["flights", "hotels"],
  return_date: ["flights", "hotels"],
  destination: ["flights", "hotels", "papers"],
  travellers: ["flights"],
  nationality: ["papers"],
};

// Only the searches the change touches start again; the others keep their result.
export function affectedSearches(changes: RequestChange[]): Search[] {
  const out: Search[] = [];
  for (const c of changes) for (const s of TOUCHES[c.field]) if (!out.includes(s)) out.push(s);
  return out;
}
