import { z } from "zod";
import type { FlightOption, TripRequestDraft } from "@/lib/contracts";
import { countryName } from "@/lib/countries";
import { normalizeText } from "@/lib/flights/read";

// Traveller Context: what the traveller said (facts), what he prefers (preferences, soft: applied when possible and
// said when not) and what Nami assumes in the meantime (assumptions, said as such). Pure, no model call.

export const PreferenceSchema = z.object({
  kind: z.enum(["avoid_night_flights"]),
  // The sentence it was heard in, for the history; never shown as a quote of Nami.
  said: z.string().trim().min(1).max(500),
});
export type Preference = z.infer<typeof PreferenceSchema>;
export type PreferenceKind = Preference["kind"];

export const PREFERENCE_LABELS: Record<PreferenceKind, string> = { avoid_night_flights: "no night flights" };

// A departure between these hours is a night flight (local time shown on the page).
export const NIGHT_FROM_HOUR = 21;
export const NIGHT_UNTIL_HOUR = 6;

const words = (text: string) => normalizeText(text).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const has = (said: string, phrase: string) => ` ${said} `.includes(` ${words(phrase)} `);

const NIGHT_PHRASES = [
  "vol de nuit", "vols de nuit", "voler de nuit", "decoller la nuit", "partir la nuit", "depart de nuit",
  "night flight", "night flights", "red eye", "red eyes", "overnight flight", "fly at night", "leave at night",
  "vuelo nocturno", "vuelos nocturnos", "vuelo de noche", "volar de noche",
  "nachtflug", "nachtfluge", "nachts fliegen",
  "volo notturno", "voli notturni", "volo di notte", "volare di notte",
];
const AVOID_WORDS = [
  "eviter", "evite", "evitez", "pas de", "pas", "sans", "aucun", "aucune", "jamais", "plutot pas",
  "no", "not", "avoid", "without", "never", "rather not", "don t", "dont",
  "sin", "evitar", "evita", "nunca", "nada de",
  "keine", "kein", "nicht", "ohne", "vermeiden", "nie",
  "niente", "nessun", "nessuno", "evitare", "senza", "mai",
];

// "Au fait, je préfère éviter les vols de nuit": a preference, kept with the trip and applied to every flight list.
export function detectPreferences(text: string): Preference[] {
  const said = words(text);
  const night = NIGHT_PHRASES.some((p) => has(said, p));
  const avoid = AVOID_WORDS.some((w) => has(said, w));
  return night && avoid ? [{ kind: "avoid_night_flights", said: text.trim() }] : [];
}

// One preference per kind: the latest sentence wins.
export function mergePreferences(current: Preference[] | undefined, found: Preference[]): Preference[] {
  const merged = [...(current ?? [])];
  for (const p of found) {
    const at = merged.findIndex((m) => m.kind === p.kind);
    if (at === -1) merged.push(p);
    else merged[at] = p;
  }
  return merged;
}

export function newPreferences(current: Preference[] | undefined, found: Preference[]): Preference[] {
  return found.filter((p) => !(current ?? []).some((m) => m.kind === p.kind));
}

export function preferenceNoted(prefs: Preference[]): string | null {
  if (prefs.length === 0) return null;
  return `Noted, ${prefs.map((p) => PREFERENCE_LABELS[p.kind]).join(" and ")}: I keep them out of the flights I show you.`;
}

// The hour of a time as Google shows it ("13:50", "10:30 PM", "22h15"); null when unreadable, never guessed.
export function departureHour(departAt: string): number | null {
  const m = departAt.match(/(\d{1,2})\s*(?::|h)\s*(\d{2})?\s*(a\.?m\.?|p\.?m\.?)?/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const meridiem = m[3]?.toLowerCase().replace(/\./g, "");
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return hour > 23 ? null : hour;
}

export function isNightDeparture(departAt: string): boolean | null {
  const hour = departureHour(departAt);
  if (hour === null) return null;
  return hour >= NIGHT_FROM_HOUR || hour < NIGHT_UNTIL_HOUR;
}

export type PreferenceFilter = { kept: FlightOption[]; dropped: FlightOption[]; applied: PreferenceKind[] };

// Soft: the flights that break a preference are set aside, the others ranked. When every flight breaks it, nothing is
// hidden (kept = all) and the caller says so instead of pretending the preference was met. Unknown times are kept.
export function applyPreferences(options: FlightOption[], prefs: Preference[] | undefined): PreferenceFilter {
  const applied: PreferenceKind[] = [];
  let kept = options;
  let dropped: FlightOption[] = [];
  for (const p of prefs ?? []) {
    if (p.kind !== "avoid_night_flights") continue;
    const breaking = kept.filter((o) => isNightDeparture(o.depart_at) === true);
    if (breaking.length === 0 || breaking.length === kept.length) continue;
    applied.push(p.kind);
    dropped = [...dropped, ...breaking];
    kept = kept.filter((o) => !breaking.includes(o));
  }
  return { kept, dropped, applied };
}

// Every flight breaks a preference: what Nami says before the list, so the list is never read as compliant.
export function unmetPreference(options: FlightOption[], prefs: Preference[] | undefined): PreferenceKind | null {
  for (const p of prefs ?? []) {
    if (p.kind === "avoid_night_flights" && options.length > 0 && options.every((o) => isNightDeparture(o.depart_at) === true)) return p.kind;
  }
  return null;
}

export const UNMET_PREFERENCE_TEXTS: Record<PreferenceKind, string> = {
  avoid_night_flights: "Every flight I read leaves at night, none avoids it, so I show them anyway.",
};

export type TravellerContext = {
  facts: Partial<Record<"origin" | "destination" | "departure_date" | "return_date" | "nationality" | "travellers" | "purpose", string>>;
  preferences: Preference[];
  assumptions: string[];
};

// What Nami knows for sure, what she prefers to do, and what she assumes meanwhile.
export function travellerContext(request: TripRequestDraft, preferences: Preference[] | undefined): TravellerContext {
  const facts: TravellerContext["facts"] = {};
  if (request.origin) facts.origin = request.origin;
  if (request.destination) facts.destination = request.destination;
  if (request.departure_date) facts.departure_date = request.departure_date;
  if (request.return_date) facts.return_date = request.return_date;
  if (request.nationality) facts.nationality = countryName(request.nationality);
  if (request.travellers) facts.travellers = String(request.travellers);
  if (request.purpose) facts.purpose = request.purpose;
  const assumptions: string[] = [];
  if (!request.nationality) assumptions.push("French passport, until you say otherwise");
  if (!request.travellers) assumptions.push("1 traveller");
  if (!request.origin) assumptions.push("departure city not given yet, nothing is searched from Paris in your place");
  return { facts, preferences: preferences ?? [], assumptions };
}
