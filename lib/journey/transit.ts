// Transit eligibility (P1, 2026-11-08): a flight with a stop abroad is a transit in that country, and a transit may
// need a visa for the traveller's passport. The countries are read from the legs Google Flights showed (the layover
// cities), the rules are searched on official sites only (lib/linkup.ts, lib/official-sites.ts), and anything not
// found there is flagged "needs verification": Nami never invents an exemption and never calls such a journey ready.

import { z } from "zod";
import type { FlightOption } from "@/lib/contracts";
import { countryName } from "@/lib/countries";
import { LinkupError, linkupStructuredSearch, type LinkupStructuredAnswer } from "@/lib/linkup";
import { governmentDomainsFor, isOfficialUrl } from "@/lib/official-sites";

export const TransitStatusSchema = z.enum(["not_needed", "exempt_verified", "visa_required", "needs_verification"]);
export type TransitStatus = z.infer<typeof TransitStatusSchema>;

// Airside: the traveller stays in the international zone. Landside: he passes immigration (separate tickets, a change of
// airport, a night in town). Google does not say which; separate tickets or a layover of a day are landside, the rest is
// assumed airside and the message says so.
export const ConnectionTypeSchema = z.enum(["airside", "landside"]);
export type ConnectionType = z.infer<typeof ConnectionTypeSchema>;

export const TransitCheckSchema = z.object({
  city: z.string(),
  country_iso2: z.string().length(2).nullable(),
  country: z.string(),
  connection: ConnectionTypeSchema,
  layover_min: z.number().int().nonnegative().nullable(),
  status: TransitStatusSchema,
  summary: z.string(),
  sources: z.array(z.string()),
  error: z.string().optional(),
});
export type TransitCheck = z.infer<typeof TransitCheckSchema>;

export const TransitInputSchema = z.object({
  nationality: z.string().length(2),
  city: z.string().trim().min(1).max(80),
  country_iso2: z.string().length(2),
  connection: ConnectionTypeSchema,
  layover_min: z.number().int().nonnegative().nullable(),
  destination: z.string().trim().min(1).max(120),
});
export type TransitInput = z.infer<typeof TransitInputSchema>;

export const LANDSIDE_LAYOVER_MIN = 24 * 60;

// The layover cities Google writes (lib/flights/extract.ts layoverCity) and their country. Unknown city: the country is
// null and the check says "needs verification" rather than guessing.
const CITY_COUNTRY: Record<string, string> = {
  doha: "QA", dubai: "AE", "abu dhabi": "AE", istanbul: "TR", singapore: "SG", "kuala lumpur": "MY", bangkok: "TH", "hong kong": "HK",
  canton: "CN", guangzhou: "CN", shanghai: "CN", beijing: "CN", shenzhen: "CN", tokyo: "JP", osaka: "JP", seoul: "KR", taipei: "TW",
  jakarta: "ID", denpasar: "ID", manila: "PH", "ho chi minh city": "VN", hanoi: "VN", colombo: "LK", mumbai: "IN", delhi: "IN",
  "new delhi": "IN", muscat: "OM", riyadh: "SA", jeddah: "SA", bahrain: "BH", manama: "BH", "kuwait city": "KW", "addis ababa": "ET",
  cairo: "EG", nairobi: "KE", johannesburg: "ZA", casablanca: "MA", tashkent: "UZ", almaty: "KZ", baku: "AZ", moscow: "RU",
  amsterdam: "NL", frankfurt: "DE", munich: "DE", zurich: "CH", geneva: "CH", london: "GB", manchester: "GB", milan: "IT", rome: "IT",
  madrid: "ES", barcelona: "ES", lisbon: "PT", helsinki: "FI", copenhagen: "DK", stockholm: "SE", oslo: "NO", vienna: "AT",
  brussels: "BE", dublin: "IE", warsaw: "PL", athens: "GR", paris: "FR", lyon: "FR", sydney: "AU", perth: "AU", "new york": "US",
  toronto: "CA", montreal: "CA",
};

const SCHENGEN = new Set(["AT", "BE", "BG", "HR", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IS", "IT", "LV", "LI", "LT", "LU", "MT", "NL", "NO", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "CH"]);
const FREE_MOVEMENT_SOURCE = "https://europa.eu/youreurope/citizens/travel/entry-exit/eu-citizen/index_en.htm";

export function layoverCountry(city: string): string | null {
  return CITY_COUNTRY[city.trim().toLowerCase()] ?? null;
}

export function connectionType(flight: Pick<FlightOption, "self_transfer">, layover_min: number | null | undefined): ConnectionType {
  return flight.self_transfer || (layover_min ?? 0) >= LANDSIDE_LAYOVER_MIN ? "landside" : "airside";
}

export type TransitStop = { city: string; country_iso2: string | null; connection: ConnectionType; layover_min: number | null };

// The stops abroad of a chosen flight: not in the destination country, not in the country left from.
export function transitStops(flight: FlightOption, trip: { country_iso2: string | null; origin_country: string | null }): TransitStop[] {
  const stops: TransitStop[] = [];
  for (const layover of flight.layovers) {
    const country_iso2 = layoverCountry(layover.airport);
    if (country_iso2 && (country_iso2 === trip.country_iso2 || country_iso2 === trip.origin_country)) continue;
    if (stops.some((s) => s.city === layover.airport)) continue;
    stops.push({ city: layover.airport, country_iso2, connection: connectionType(flight, layover.duration_min), layover_min: layover.duration_min ?? null });
  }
  return stops;
}

// A stop whose rules need no search: an EU or Schengen passport in a Schengen country. Everything else is searched.
export function knownTransit(stop: TransitStop, nationality: string): TransitCheck | null {
  if (!stop.country_iso2) {
    return { ...stop, country: stop.city, status: "needs_verification", summary: `I do not know which country ${stop.city} is in: check the transit rules yourself.`, sources: [] };
  }
  const country = countryName(stop.country_iso2);
  if (SCHENGEN.has(nationality) && SCHENGEN.has(stop.country_iso2)) {
    return { ...stop, country, status: "not_needed", summary: `${stop.city} is in the Schengen area, like your passport: no transit visa.`, sources: [FREE_MOVEMENT_SOURCE] };
  }
  return null;
}

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    transit_visa_required: { type: ["boolean", "null"], description: "true if this traveller needs a transit visa for this connection, false if explicitly exempted, null if the official source does not say" },
    airside_only: { type: "boolean", description: "true if the exemption holds only when the traveller stays in the international transit area" },
    max_hours: { type: ["number", "null"], description: "Maximum layover duration in hours allowed without a visa, null if none is stated" },
    conditions: { type: "string", description: "Conditions of the exemption or of the visa (onward ticket, same airport, documents), in one sentence" },
    source_url: { type: "string", description: "URL of the official government page where this rule is stated" },
  },
  required: ["transit_visa_required", "airside_only", "max_hours", "conditions", "source_url"],
} as const;

const AnswerSchema = z.object({
  transit_visa_required: z.boolean().nullable().catch(null),
  airside_only: z.boolean().catch(true),
  max_hours: z.number().nullable().catch(null),
  conditions: z.string().catch(""),
  source_url: z.string().catch(""),
});

export function transitQuery(input: TransitInput): string {
  const where = `${input.city}, ${countryName(input.country_iso2)}`;
  const how = input.connection === "airside" ? "staying in the international transit area of the airport" : "leaving the transit area (separate tickets, change of airport or long layover)";
  const long = input.layover_min === null ? "" : ` with a layover of about ${Math.max(1, Math.round(input.layover_min / 60))} hours`;
  return `Does a holder of a passport issued by ${countryName(input.nationality)} need a transit visa to connect in ${where}${long}, ${how}, on the way to ${input.destination}? Official transit rules, visa exemption conditions and maximum duration.`;
}

type Deps = { apiKey?: string; fetch?: typeof fetch; timeoutMs?: number };
const LIVE_TIMEOUT_MS = 20_000;

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

// The rules of one stop, from official sites of the transit country and of the traveller's own country. Not found on
// one: "needs verification", with the domains to look at.
export async function findTransitRequirements(input: TransitInput, deps: Deps = {}): Promise<TransitCheck> {
  const stop: TransitStop = { city: input.city, country_iso2: input.country_iso2, connection: input.connection, layover_min: input.layover_min };
  const known = knownTransit(stop, input.nationality);
  if (known) return known;
  const country = countryName(input.country_iso2);
  const domains = [...new Set([...governmentDomainsFor(input.country_iso2), ...governmentDomainsFor(input.nationality)])];
  const unverified = (error: string): TransitCheck => ({
    ...stop, country, status: "needs_verification", error,
    summary: `I could not verify on an official site whether your passport (${countryName(input.nationality)}) needs a transit visa for ${input.city} (${input.connection}). Check ${domains[0] ?? "the embassy"} before booking.`,
    sources: [],
  });
  if (!deps.apiKey) return unverified("LINKUP_API_KEY is not set");
  let answer: LinkupStructuredAnswer;
  try {
    answer = await linkupStructuredSearch(
      { q: transitQuery(input), includeDomains: domains, schema: OUTPUT_SCHEMA },
      { apiKey: deps.apiKey, fetch: deps.fetch, timeoutMs: deps.timeoutMs ?? LIVE_TIMEOUT_MS },
    );
  } catch (error) {
    return unverified(error instanceof LinkupError ? error.message : "Linkup failed");
  }
  const parsed = AnswerSchema.safeParse(answer.data);
  if (!parsed.success) return unverified("Linkup answer did not match the expected format");
  const data = parsed.data;
  const official = [data.source_url, ...answer.sources.map((s) => s.url)].filter((url) => url && isOfficialUrl(url));
  if (official.length === 0) return unverified("no official source in the answer");
  const sources = [...new Set(official)];
  const where = `${input.city} (${country})`;
  const per = `per ${hostOf(sources[0])}`;
  if (data.transit_visa_required === true) {
    return { ...stop, country, status: "visa_required", sources, summary: `Transit in ${where}: a transit visa is required for your passport (${countryName(input.nationality)}), ${per}. ${data.conditions}`.trim() };
  }
  if (data.transit_visa_required === false) {
    const hours = input.layover_min === null ? null : input.layover_min / 60;
    const tooLong = data.max_hours !== null && hours !== null && hours > data.max_hours;
    if (input.connection === "landside" && data.airside_only) {
      return { ...stop, country, status: "needs_verification", sources, summary: `Transit in ${where}: the exemption ${per} holds only in the transit area, and your connection leaves it. Check before booking.` };
    }
    if (tooLong) {
      return { ...stop, country, status: "needs_verification", sources, summary: `Transit in ${where}: the exemption ${per} is limited to ${data.max_hours} hours, your layover is longer. Check before booking.` };
    }
    const aside = input.connection === "airside" ? " (airside, assumed: you stay in the terminal)" : "";
    return { ...stop, country, status: "exempt_verified", sources, summary: `Transit in ${where}: no transit visa for your passport (${countryName(input.nationality)})${aside}, ${per}. ${data.conditions}`.trim() };
  }
  return { ...stop, country, status: "needs_verification", sources, summary: `Transit in ${where}: the official pages found do not settle it for your passport. Check ${hostOf(sources[0])} before booking.` };
}

// Everything checked and clear: the only case where the journey may be called ready for the transit part.
export const transitClear = (checks: TransitCheck[]) => checks.every((c) => c.status === "not_needed" || c.status === "exempt_verified");

export function transitMessage(checks: TransitCheck[]): string {
  if (checks.length === 0) return "";
  const lines = checks.map((c) => c.summary);
  if (transitClear(checks)) return lines.join(" ");
  const open = checks.some((c) => c.status === "visa_required") ? "Your journey is not ready until that transit visa is sorted." : "I do not call this journey ready until that is verified.";
  return `${lines.join(" ")} ${open}`;
}
