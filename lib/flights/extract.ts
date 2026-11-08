import { FlightOptionSchema, type FlightOption } from "@/lib/contracts";

// Nami reads the Google Flights results herself, from the aria-labels of the results list (lib/flights/page.ts puts
// one per line after the body text). Each result row carries one sentence with the whole flight, in the language of
// the page. Samples read on the real page on 8 November 2026 (extract.test.ts), English and French:
//   "From 642 euros round trip total. 1 stop flight with Etihad. Leaves Aéroport de Paris-Charles de Gaulle at 9:55 AM
//    on Monday, November 23 and arrives at I Gusti Ngurah Rai International Airport at 11:35 AM on Tuesday, November 24.
//    Total duration 18 hr 40 min.  Layover (1 of 1) is a 2 hr 35 min layover at Zayed International Airport in Abu Dhabi.
//    Select flight"
//   "À partir de 733 euros aller-retour (prix total). Vol avec Etihad, 1 escale. Départ de I Gusti Ngurah Rai
//    International Airport à 01:35 le jeudi, décembre 3, arrivée à Aéroport de Paris-Charles de Gaulle à 12:25 le jeudi,
//    décembre 3. Durée totale : 17 h 50 min.  L'escale (1 sur 1) est une escale de 1 h 15 min à Abou Dabi (Zayed
//    International Airport). Sélectionner le vol"
// Nothing is computed from elsewhere: a row that does not carry price, airline, stops, times and duration is skipped.

export const MAX_EXTRACTED_FLIGHTS = 20;

const PRICE = /^(?:From|À partir de|A partir de)\s+([\d][\d .,]*)\s*(euros?|€|US dollars|dollars?|\$|pounds?|£|[A-Z]{3})(?![A-Za-z])[^.]*?(?:round trip|aller-retour)/i;
const AIRLINE_EN = /\b(?:(Nonstop|Non-stop|Direct)|(\d+) stops?) flight with (.+?)\./;
const AIRLINE_FR = /\bVol avec (.+?), (?:(sans escale|direct)|(\d+) escales?)\./i;
const TIMES_EN = /\bLeaves .+? at (\d{1,2}:\d{2}(?: ?[AP]M)?) on ([A-Za-z]+, [A-Za-z]+ \d{1,2}) and arrives at .+? at (\d{1,2}:\d{2}(?: ?[AP]M)?) on ([A-Za-z]+, [A-Za-z]+ \d{1,2})\./;
const TIMES_FR = /\bDépart de .+? à (\d{1,2}:\d{2}) le ([^,]+, [^\s,]+ \d{1,2}), arrivée à .+? à (\d{1,2}:\d{2}) le ([^,]+, [^\s,]+ \d{1,2})\./i;
const DURATION = /\b(?:Total duration|Durée totale)\s*:?\s*(?:(\d+) (?:hr|h)\b)?\s*(?:(\d+) min)?/i;
const LAYOVER_EN = /\bLayover \(\d+ of \d+\) is a (?:(\d+) hr)?\s?(?:(\d+) min)? layover (?:at (.+?) in (.+?)|in (.+?))\./g;
const LAYOVER_FR = /\bL'escale \(\d+ sur \d+\) est une escale de (?:(\d+) h)?\s?(?:(\d+) min)? à (.+?)(?: \((.+?)\))?\./gi;

const MONTHS_EN = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTHS_FR = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
const CURRENCIES: [RegExp, string][] = [[/^(euros?|€)$/i, "EUR"], [/^(us dollars|dollars?|\$)$/i, "USD"], [/^(pounds?|£)$/i, "GBP"]];

function currencyCode(sign: string): string {
  return CURRENCIES.find(([re]) => re.test(sign))?.[1] ?? sign.toUpperCase();
}

function minutes(hours: string | undefined, mins: string | undefined): number {
  return Number(hours ?? 0) * 60 + Number(mins ?? 0);
}

// "Monday, November 23" or "jeudi, décembre 3": day of year, so the arrival gets its "+1" like on the page.
function dayOfYear(date: string): number | null {
  const m = /^[^,]+,\s*([^\s]+)\s+(\d{1,2})$/.exec(date.trim());
  if (!m) return null;
  const month = m[1].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const index = MONTHS_EN.indexOf(month) >= 0 ? MONTHS_EN.indexOf(month) : MONTHS_FR.indexOf(month);
  if (index < 0) return null;
  return Math.round(Date.UTC(2001, index, Number(m[2])) / 86_400_000);
}

function arrivalSuffix(departDate: string, arriveDate: string): string {
  const from = dayOfYear(departDate);
  const to = dayOfYear(arriveDate);
  if (from === null || to === null) return departDate === arriveDate ? "" : "+1";
  const days = to >= from ? to - from : to + 365 - from;
  return days > 0 ? `+${days}` : "";
}

function layovers(line: string): FlightOption["layovers"] {
  const found: FlightOption["layovers"] = [];
  for (const m of line.matchAll(LAYOVER_EN)) found.push({ airport: (m[4] ?? m[5] ?? m[3]).trim(), duration_min: minutes(m[1], m[2]) });
  for (const m of line.matchAll(LAYOVER_FR)) found.push({ airport: m[3].trim(), duration_min: minutes(m[1], m[2]) });
  return found;
}

// One aria-label of a result row, or null when it is not a flight (a price alone, a button, a half-read row).
export function parseResultLabel(label: string, index: number): FlightOption | null {
  const line = label.replace(/[\u00a0\u202f\u2009]/g, " ").replace(/\s+/g, " ").trim();
  const price = PRICE.exec(line);
  if (!price) return null;
  const en = AIRLINE_EN.exec(line);
  const fr = en ? null : AIRLINE_FR.exec(line);
  const airline = en?.[3] ?? fr?.[1];
  if (!airline) return null;
  const stops = en ? (en[1] ? 0 : Number(en[2])) : fr![2] ? 0 : Number(fr![3]);
  const times = en ? TIMES_EN.exec(line) : TIMES_FR.exec(line);
  const duration = DURATION.exec(line);
  if (!times || !duration || (!duration[1] && !duration[2])) return null;
  const parsed = FlightOptionSchema.safeParse({
    index,
    airline: airline.replace(/\s+(?:and|et)\s+/g, ", "),
    price: Number(price[1].replace(/[ ,.]/g, "")),
    currency: currencyCode(price[2]),
    stops,
    duration_min: minutes(duration[1], duration[2]),
    depart_at: times[1],
    arrive_at: `${times[3]}${arrivalSuffix(times[2], times[4])}`,
    layovers: layovers(line),
  });
  return parsed.success ? parsed.data : null;
}

// The flights listed on the page, in the order of the list (index 1 = first row). A row repeated in the DOM counts once.
export function extractFlights(pageText: string, max = MAX_EXTRACTED_FLIGHTS): FlightOption[] {
  const seen = new Set<string>();
  const flights: FlightOption[] = [];
  for (const raw of pageText.split("\n")) {
    const label = raw.trim();
    if (!label || seen.has(label)) continue;
    const flight = parseResultLabel(label, flights.length + 1);
    if (!flight) continue;
    seen.add(label);
    flights.push(flight);
    if (flights.length >= max) break;
  }
  return flights;
}

// "Loading results" / "Chargement des résultats…": Google is still fetching the list.
export function resultsStillLoading(pageText: string): boolean {
  return /\b(?:Loading results|Chargement des r[ée]sultats)/i.test(pageText) && !/\b(?:\d+ results? returned|\d+ r[ée]sultats?\.)/i.test(pageText);
}
