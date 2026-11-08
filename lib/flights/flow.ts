// Module Vol in the conversation (ticket 18): after "yes" to the flights, the dates, the criterion, the flights read on
// Google Flights, the traveller's choice, and the end of the agent's run. Kept out of lib/trip-state.ts, which only
// branches here when a question or a run belongs to the flights.

import { z } from "zod";
import { freshToolCalls, H_NOT_ANSWERING_MESSAGE, H_SLOW_RESTART_MESSAGE, redact, toolCallKey, wantsAutoRestart, type AgentChanges } from "@/lib/agent-changes";
import { AgentStateSchema, FlightCriterionSchema, FlightOptionSchema, type AgentRun, type FlightCriterion, type FlightOption, type TripRequestDraft } from "@/lib/contracts";
import { isTerminalStatus, type ToolRequest } from "@/lib/h-agent";
import { CRITERION_LABELS, describeFlight, flightLabel, formatPrice, introduceFlights, rankFlights } from "@/lib/flights/rank";
import { normalizeText } from "@/lib/flights/read";
import { applyPreferences, UNMET_PREFERENCE_TEXTS, unmetPreference } from "@/lib/journey/context";
import { HOTELS_PROPOSAL } from "@/lib/hotels/rank";
import { FLIGHTS_ORIGIN } from "@/lib/flights-agent";
import { shortAnswer } from "@/lib/voice/short-answers";
import { assumedArrival, formalityWindows, isBali, nextDay } from "@/lib/planner";
import { BALI_PAPERS } from "@/lib/bali-papers";
import { knownTransit, TransitCheckSchema, transitMessage, transitStops, type TransitCheck, type TransitInput } from "@/lib/journey/transit";
import type { ConversationItem, Trip } from "@/lib/trip-state";

// flight_relax: no direct flight while the traveller asked for direct only; the constraint is kept, Nami asks before
// showing the flights with a stop.
export const FLIGHT_QUESTION_FIELDS = ["origin", "return_date", "flight_criterion", "flight_choice", "flight_relax"] as const;
export type FlightQuestionField = (typeof FLIGHT_QUESTION_FIELDS)[number];
type FlightQuestion = Extract<ConversationItem, { kind: "question" }> & { field: FlightQuestionField };

export function isFlightQuestion(field: string): field is FlightQuestionField {
  return (FLIGHT_QUESTION_FIELDS as readonly string[]).includes(field);
}

export const FLIGHTS_SEARCHING_MESSAGE = "I'm searching your flights on Google Flights, watch the tab on the left.";
export const FLIGHT_READY_PREFIX = "Your flight is found: ";
export const FLIGHTS_RETRY_PROPOSAL = { action: "flights", text: "Shall I search your flights again?", accept_label: "Search again", decline_label: "Not now" } as const;
export const FLIGHTS_UNREADABLE_MESSAGE = "I could not read the flights on the page. Look at the tab on the left and choose one yourself.";
export const FLIGHTS_REREAD_MESSAGE = "I could not match the flights with the page, the agent is reading it again.";
const ORIGIN_QUESTION = "Which city do you fly from?";
const CRITERION_QUESTION = "What matters most for your flights: the cheapest, the fastest, no stop if possible, or the best compromise?";
export const BALANCED_CRITERIA_MESSAGE = "Several criteria: I will balance price, duration and stops.";
// The answer written on a flight question the agent's end closed (applyFlightsChanges, reportFlightsReady, stopAgent):
// not an answer of the traveller.
const AGENT_STOPPED_ANSWER = "Agent stopped";
// What a traveller says to name a flight or a criterion, in the languages Gladia transcribes for us.
export const ORDINAL_WORDS = [
  ["first", "1", "1st", "1er", "1ere", "premier", "premiere", "primero", "primera", "erste", "primo"],
  ["second", "2", "2nd", "2e", "2eme", "two", "deuxieme", "second", "seconde", "segundo", "segunda", "zweite", "secondo"],
  ["third", "3", "3rd", "3e", "3eme", "three", "troisieme", "tercero", "tercera", "dritte", "terzo"],
];
const CRITERION_WORDS: Record<FlightCriterion, string[]> = {
  cheapest: ["cheap", "cheapest", "price", "moins cher", "pas cher", "barato", "billig", "gunstig", "economico"],
  fastest: ["fast", "fastest", "quick", "quickest", "short", "rapide", "rapido", "schnell", "veloce"],
  fewest_stops: ["direct", "no stop", "nonstop", "non stop", "without stop", "fewest", "sans escale", "escale", "directo", "ohne", "diretto"],
  best: ["best", "balance", "compromise", "meilleur", "compromis", "mejor", "beste", "migliore"],
  direct_only: [],
};
// "Only direct flights", "vols directs uniquement", "pas d'escale": a direct word with an exclusive one is a hard
// constraint (direct_only), not a preference (fewest_stops). "Sans escale si possible" stays a preference.
const DIRECT_WORDS = CRITERION_WORDS.fewest_stops;
const ONLY_WORDS = ["only", "nothing but", "strictly", "exclusively", "must be", "uniquement", "seulement", "exclusivement", "strictement", "obligatoirement", "imperativement", "que des", "rien que", "pas d escale", "aucune escale", "solo", "solamente", "unicamente", "nur", "ausschliesslich", "soltanto"];

export function asksDirectOnly(text: string): boolean {
  const said = spokenWords(text);
  return DIRECT_WORDS.some((w) => saidWord(said, w)) && ONLY_WORDS.some((w) => saidWord(said, w));
}
const RETURN_OFFSETS_DAYS = [7, 10, 14];

export function isFlightReadyMessage(text: string): boolean {
  return text.startsWith(FLIGHT_READY_PREFIX);
}

// What the run remembers about the flights: in AgentRun.result.flights, so it survives a reload like the rest.
const FlightsRunResultSchema = z.object({
  url: z.string().optional(),
  criterion: FlightCriterionSchema.optional(),
  read: z.number().int().nonnegative().optional(),
  options: z.array(FlightOptionSchema).default([]),
  chosen: FlightOptionSchema.optional(),
  tool_req: z.object({ tool_name: z.string(), args: z.record(z.string(), z.unknown()), id: z.string().nullable() }).optional(),
  ready: z.boolean().optional(),
  // The landing in request.arrival_at came from the chosen flight: cleared if the run ends without opening it.
  landing_from_flight: z.boolean().optional(),
  // The transit rules of the stops abroad of the chosen flight, once checked (lib/journey/transit.ts).
  transit: z.array(TransitCheckSchema).optional(),
});
export type FlightsRunResult = z.infer<typeof FlightsRunResultSchema>;

export function flightsResult(run: AgentRun | null): FlightsRunResult | null {
  if (!run || run.kind !== "flights") return null;
  const parsed = FlightsRunResultSchema.safeParse(run.result?.flights ?? {});
  return parsed.success ? parsed.data : null;
}

type NewItem = ConversationItem extends infer T ? (T extends ConversationItem ? Omit<T, "id"> : never) : never;

// Same ids as lib/trip-state.ts: the trip id and the position in the conversation.
function push(trip: Trip, ...items: NewItem[]): Trip {
  return items.reduce<Trip>(
    (t, item) => ({ ...t, conversation: [...t.conversation, { ...item, id: `${t.id}-${t.conversation.length + 1}` } as ConversationItem] }),
    trip,
  );
}

function answerItem(trip: Trip, id: string, answer: string): Trip {
  return { ...trip, conversation: trip.conversation.map((item) => (item.id === id ? ({ ...item, answer } as ConversationItem) : item)) };
}

function withResult(trip: Trip, patch: Partial<FlightsRunResult>, run: Partial<AgentRun> = {}): Trip {
  if (!trip.agent_run) return trip;
  const flights = { ...(flightsResult(trip.agent_run) ?? { options: [] }), ...patch };
  return { ...trip, agent_run: { ...trip.agent_run, ...run, result: { ...trip.agent_run.result, flights } } };
}

const say = (trip: Trip, text: string) => push(trip, { kind: "agent", text });
// One retry proposal at a time: a second failure while the first one is still open does not ask twice.
const retry = (trip: Trip) =>
  trip.conversation.some((i) => i.kind === "proposal" && i.action === "flights" && i.decision === null)
    ? trip
    : push(trip, { kind: "proposal", ...FLIGHTS_RETRY_PROPOSAL, decision: null });

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// "Monday 23 November": said and shown in English, translated like the rest by /api/translate.
export function longDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${isoDate}T00:00:00Z`));
}

const question = (field: FlightQuestionField, text: string, options: { label: string; value: string }[], input: "text" | null): NewItem => ({
  kind: "question", from: "nami", field, question: text, options, input, answer: null,
});

// The departure city: asked first when the traveller named none, Paris proposed as a tap (Clément, real run
// 2026-11-08: it was fixed to Paris). A named city is kept as said, nothing is searched without one (flightsStartBody).
function askOrigin(trip: Trip): Trip {
  return push(trip, question("origin", ORIGIN_QUESTION, [{ label: FLIGHTS_ORIGIN, value: FLIGHTS_ORIGIN }], "text"));
}

const FILLER_WORDS = new Set(["euh", "heu", "hum", "hmm", "um", "uh", "er", "bah", "ben", "alors", "well", "so"]);

// A spoken city: the words after "from" / "de" when there are some, else the whole answer, if it looks like a name.
export function spokenCity(text: string): string | null {
  const cleaned = text.trim().replace(/[.!?]+$/g, "");
  const after = cleaned.match(/\b(?:from|de|depuis|desde|von|da)\s+(?:l[ae]\s+|the\s+)?(.+)$/i);
  const city = (after ? after[1] : cleaned).trim();
  if (!city || city.split(/\s+/).length > 4 || !/\p{L}/u.test(city) || /\d/.test(city) || shortAnswer("proposal", city)) return null;
  if (FILLER_WORDS.has(spokenWords(city))) return null;
  return city.charAt(0).toUpperCase() + city.slice(1);
}

function askReturnDate(trip: Trip): Trip {
  const { departure_date, return_date } = trip.request;
  const leave = trip.request.origin ? `You leave ${trip.request.origin} on` : "You leave on";
  if (!departure_date) return say(trip, "I need your departure date first.");
  if (return_date) {
    return push(trip, question("return_date",
      `${leave} ${longDate(departure_date)} and come back on ${longDate(return_date)}. Shall I search with those dates?`,
      [{ label: "Yes, those dates", value: return_date }], "text"));
  }
  const options = RETURN_OFFSETS_DAYS.map((days) => addDays(departure_date, days)).map((date) => ({ label: longDate(date), value: date }));
  return push(trip, question("return_date", `You leave on ${longDate(departure_date)}. When do you want to come back?`, options, "text"));
}

// The four usual criteria; "Direct flights only" added when the trip was asked that way ("que des vols directs").
function askCriterion(trip: Trip): Trip {
  const criteria = FlightCriterionSchema.options.filter((c) => c !== "direct_only" || asksDirectOnly(trip.request.raw_text));
  const options = criteria.map((value) => ({ label: CRITERION_LABELS[value], value }));
  return push(trip, question("flight_criterion", CRITERION_QUESTION, options, null));
}

// The last question of the field the traveller answered (not one the agent's end closed).
function answeredQuestion(trip: Trip, field: FlightQuestionField): FlightQuestion | undefined {
  const item = trip.conversation.findLast((i) => i.kind === "question" && i.field === field && i.answer !== null && i.answer !== AGENT_STOPPED_ANSWER);
  return item?.kind === "question" ? (item as FlightQuestion) : undefined;
}

// The dates are settled once the return date is known and the traveller confirmed or gave it.
const datesConfirmed = (trip: Trip) => !!trip.request.return_date && answeredQuestion(trip, "return_date") !== undefined;

// Everything the search needs was answered already (a search that failed or was stopped): the next "yes" asks nothing.
export function flightsAnswered(trip: Trip): boolean {
  return !!trip.request.origin && datesConfirmed(trip) && answeredCriterion(trip) !== null;
}

// "Yes" to the flights: the departure city (unless already given), the dates (unless confirmed), then the criterion
// (unless chosen), then the client starts the agent (startFlightsRun). After a failed search, "Search again" finds
// every answer in place and asks nothing: Nami announces the search, the client starts the session with the same
// origin, dates and criterion (Clément, real run 2026-11-08 04:30: the dates and the criterion were asked again).
export function startFlightsFlow(trip: Trip): Trip {
  if (!trip.request.origin) return askOrigin(trip);
  if (!datesConfirmed(trip)) return askReturnDate(trip);
  if (answeredCriterion(trip) === null) return askCriterion(trip);
  return say(trip, FLIGHTS_SEARCHING_MESSAGE);
}

// The criterion the traveller chose, from the last criterion question answered; null when none was.
export function answeredCriterion(trip: Trip): FlightCriterion | null {
  const answered = answeredQuestion(trip, "flight_criterion");
  if (!answered) return null;
  const option = answered.options.find((o) => o.label === answered.answer);
  // A criterion said, not tapped ("direct only" when the button was not there): its label was written as the answer.
  const byLabel = FlightCriterionSchema.options.find((c) => CRITERION_LABELS[c] === answered.answer);
  const parsed = FlightCriterionSchema.safeParse(option?.value ?? byLabel);
  return parsed.success ? parsed.data : null;
}

export function flightCriterion(trip: Trip): FlightCriterion {
  return answeredCriterion(trip) ?? "best";
}

// The criterion question: once it is answered, the client starts the Google Flights session (startFlightsRun).
export function isCriterionQuestion(item: ConversationItem | undefined): boolean {
  return item?.kind === "question" && item.field === "flight_criterion";
}

export function isChoiceQuestion(item: ConversationItem | undefined): boolean {
  return item?.kind === "question" && item.field === "flight_choice";
}

export const spokenWords = (text: string) => normalizeText(text).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
// "cheap" also covers "cheapest": a word of the list starts a word of what was said. A digit ("2") is a whole word,
// so "200" is a price, not the second flight.
export const saidWord = (said: string, word: string) =>
  new RegExp(`(^|\\s)${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${/^\d+$/.test(word) ? "(\\s|$)" : ""}`).test(said);

// "Qatar" for "Qatar Airways", "France" for "Air France", "Garuda" for "KLM, Garuda Indonesia".
const GENERIC_AIRLINE_WORDS = new Set(["air", "airways", "airlines", "airline", "lines", "fly", "jet"]);
const airlineWords = (airline: string) => spokenWords(airline).split(" ").filter((w) => w.length >= 3 && !GENERIC_AIRLINE_WORDS.has(w));

// Every criterion named in the answer ("le moins cher et le plus rapide": two).
export function matchCriteria(text: string): FlightCriterion[] {
  if (asksDirectOnly(text)) return ["direct_only"];
  const said = spokenWords(text);
  return FlightCriterionSchema.options.filter((c) => CRITERION_WORDS[c].some((w) => saidWord(said, w)));
}

// One criterion named: that one; several: the compromise ("best"); none: null.
export function matchCriterion(text: string): FlightCriterion | null {
  const hits = matchCriteria(text);
  return hits.length === 0 ? null : hits.length === 1 ? hits[0] : "best";
}

// "Le moins cher et le plus rapide": the compromise whatever path understood the words. The H model of
// /api/voice/intent sometimes keeps one criterion only (real run 2026-11-08 04:30: "cheapest"); the panel checks the
// words itself before trusting it.
export function namesSeveralCriteria(text: string): boolean {
  return matchCriteria(text).length > 1;
}

// The flight named by an ordinal ("the second", "2"), by its airline ("Qatar"), or by a criterion ("the cheapest one":
// the first when it is the criterion of the list, else the best of the proposed flights for that criterion).
export function matchFlight(text: string, options: FlightOption[], criterion: FlightCriterion): FlightOption | null {
  const said = spokenWords(text);
  const byOrdinal = options.filter((_, i) => ORDINAL_WORDS[i]?.some((w) => saidWord(said, w)));
  const byAirline = options.filter((f) => airlineWords(f.airline).some((w) => saidWord(said, w)));
  const hits = [...new Set([...byOrdinal, ...byAirline])];
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return null;
  const saidCriterion = matchCriterion(text);
  if (!saidCriterion) return null;
  return saidCriterion === criterion ? (options[0] ?? null) : (rankFlights(options, saidCriterion, 1)[0] ?? null);
}

export function openFlightQuestion(trip: Trip, field: FlightQuestionField): boolean {
  return trip.conversation.some((i) => i.kind === "question" && i.field === field && i.answer === null);
}

export function answerFlightQuestion(trip: Trip, item: FlightQuestion, value: string, label: string): Trip {
  const answered = answerItem(trip, item.id, label);
  switch (item.field) {
    case "origin":
      return askReturnDate({ ...answered, request: { ...answered.request, origin: value } });
    case "return_date":
      return askCriterion({ ...answered, request: { ...answered.request, return_date: value } });
    case "flight_criterion":
      return say(answered, FLIGHTS_SEARCHING_MESSAGE);
    case "flight_choice":
      return chooseFlight(answered, value);
    case "flight_relax":
      return value === "relax" ? offerWithStops(answered) : say(answered, DIRECT_ONLY_KEPT_MESSAGE);
  }
}

export const DIRECT_ONLY_KEPT_MESSAGE = "Understood, direct flights only: I open nothing. The Google Flights tab stays on the left, nothing is booked; say Stop agent to close it, or give me other dates.";

// The traveller agreed to see the flights with a stop: the fewest stops first, never called direct.
function offerWithStops(trip: Trip): Trip {
  const options = flightsResult(trip.agent_run)?.options ?? [];
  if (options.length === 0) return say(trip, FLIGHTS_UNREADABLE_MESSAGE);
  const list = options.map((f) => describeFlight(f)).join("; then ");
  const choices = options.map((f) => ({ label: flightLabel(f), value: String(f.index) }));
  return push(trip, question("flight_choice", `None of these is direct, the fewest stops first: ${list}: which one shall I open?`, choices, null));
}

// The same question again, with the same options: for the choice, the report_flights call H waits on stays attached.
// reason null: the sentence was a correction or a preference, already said back; the question just comes again.
function askAgain(trip: Trip, item: FlightQuestion, text: string, reason: string | null = "Sorry, I didn't catch that."): Trip {
  const told = reason === null ? answerItem(trip, item.id, text) : say(answerItem(trip, item.id, text), reason);
  return push(told, question(item.field, item.question, item.options, item.input === "text" ? "text" : null));
}

// A spoken or typed answer. The return date is understood by /api/trip/parse (it already reads a date or a duration);
// the criterion and the flight are matched here, on the words said. Nothing understood: the same question again.
export function answerFlightQuestionWithText(trip: Trip, item: FlightQuestion, text: string, request: TripRequestDraft, heard = false): Trip {
  const again = heard ? null : undefined;
  switch (item.field) {
    case "origin": {
      const parsed = request.origin && request.origin !== trip.request.origin ? request.origin : null;
      const origin = parsed ?? spokenCity(text);
      if (!origin) return askAgain(trip, item, text);
      return askReturnDate({ ...answerItem(trip, item.id, text), request: { ...request, origin } });
    }
    case "return_date": {
      const changed = !!request.return_date && request.return_date !== trip.request.return_date;
      // "No" to the proposed dates, without a new one: the dates are asked, not kept.
      if (!changed && shortAnswer("proposal", text) === "decline") {
        return askReturnDate(say({ ...answerItem(trip, item.id, text), request: { ...request, return_date: null } }, "Okay, tell me your return date."));
      }
      const answered = { ...answerItem(trip, item.id, text), request };
      if (!request.return_date) return askReturnDate(say(answered, "Sorry, I didn't catch that."));
      return askCriterion(answered);
    }
    case "flight_criterion": {
      const criterion = matchCriterion(text);
      if (!criterion) return askAgain(trip, item, text, again);
      const told = matchCriteria(text).length > 1 ? say(trip, BALANCED_CRITERIA_MESSAGE) : trip;
      return answerFlightQuestion(told, item, criterion, CRITERION_LABELS[criterion]);
    }
    case "flight_choice": {
      const flight = matchFlight(text, flightsResult(trip.agent_run)?.options ?? [], flightCriterion(trip));
      if (!flight) return askAgain(trip, item, text, again);
      const label = item.options.find((o) => o.value === String(flight.index))?.label ?? describeFlight(flight);
      return answerFlightQuestion(trip, item, String(flight.index), label);
    }
    case "flight_relax": {
      const short = shortAnswer("proposal", text);
      if (!short) return askAgain(trip, item, text, again);
      const option = item.options[short === "accept" ? 0 : 1];
      return answerFlightQuestion(trip, item, option.value, option.label);
    }
  }
}

export type FlightsStartBody = { origin: string; destination: string; departure_date: string; return_date: string; travellers: number; criterion: FlightCriterion };

// What the client sends to /api/flights/start, from the request; null while the departure city or a date is missing:
// the search is never made from Paris in the traveller's place.
export function flightsStartBody(trip: Trip): FlightsStartBody | null {
  const { origin, destination, departure_date, return_date, travellers } = trip.request;
  if (!origin || !destination || !departure_date || !return_date) return null;
  return { origin, destination, departure_date, return_date, travellers: travellers ?? 1, criterion: flightCriterion(trip) };
}

export function startFlightsSession(trip: Trip, sessionId: string, url: string, now: Date): Trip {
  const { departure_date, return_date } = trip.request;
  return {
    ...trip,
    agent_run: {
      session_id: sessionId,
      kind: "flights",
      started_at: now.toISOString(),
      state: "pending",
      next_index: 0,
      handled_tool_ids: [],
      drained: false,
      result: { flights: { url, criterion: flightCriterion(trip), options: [] } },
    },
    agent_steps: [`Opened Google Flights for ${departure_date ?? "?"} to ${return_date ?? "?"}`],
  };
}

// The flights Nami checked against the page: ranked by the criterion, at most three, asked as one question whose
// options are the flights (one short label each, "Scoot · 646 € · 1 stop Singapore · 22 h 05 · leaves 13:50"), so
// "the first", "Qatar" or a tap all work. Said aloud in one sentence, shorter (describeFlight).
export function offerFlights(trip: Trip, call: ToolRequest, flights: FlightOption[]): Trip {
  const run = trip.agent_run;
  if (!run || run.kind !== "flights" || (run.handled_tool_ids ?? []).includes(toolCallKey(call))) return trip;
  const criterion = flightCriterion(trip);
  // The preferences first (night flights set aside when a day flight exists), then the criterion.
  const preferred = applyPreferences(flights, trip.preferences).kept;
  const unmet = unmetPreference(flights, trip.preferences);
  const ranked = rankFlights(preferred, criterion);
  const marked = withResult(trip, { criterion, read: flights.length, options: ranked, tool_req: call }, { handled_tool_ids: [...(run.handled_tool_ids ?? []), toolCallKey(call)] });
  const withStep = { ...marked, agent_steps: [...marked.agent_steps, `Read ${flights.length} flights`] };
  if (criterion === "direct_only" && ranked.length === 0 && flights.length > 0) return explainNoDirect(withStep, flights);
  if (ranked.length === 0) return say(withStep, FLIGHTS_UNREADABLE_MESSAGE);
  const warned = unmet ? say(withStep, UNMET_PREFERENCE_TEXTS[unmet]) : withStep;
  const intro = introduceFlights(criterion, flights).replace(/\.$/, "");
  const list = ranked.map((f) => describeFlight(f)).join("; then ");
  const options = ranked.map((f) => ({ label: flightLabel(f), value: String(f.index) }));
  return push(warned, question("flight_choice", `${intro}: ${list}: which one shall I open?`, options, null));
}

// Direct only and nothing direct on the page: the constraint is said, not dropped. The flights with the fewest stops
// are kept aside and shown only if the traveller says so (flight_relax).
function explainNoDirect(trip: Trip, flights: FlightOption[]): Trip {
  const kept = withResult(trip, { options: rankFlights(flights, "fewest_stops") });
  const route = trip.request.origin && trip.request.destination ? ` from ${trip.request.origin} to ${trip.request.destination}` : "";
  return push(kept, question("flight_relax",
    `No direct flight${route} on those days: I read ${flights.length} flights, all with at least one stop. I keep your constraint. Do you want to see the ones with the fewest stops anyway?`,
    [{ label: "Show them anyway", value: "relax" }, { label: "Keep direct only", value: "keep" }], null));
}

function chooseFlight(trip: Trip, value: string): Trip {
  const result = flightsResult(trip.agent_run);
  const chosen = result?.options.find((f) => String(f.index) === value);
  if (!chosen) return say(trip, "I lost that flight. Look at the tab on the left and choose one yourself.");
  const landing = trip.request.arrival_at ? null : landingFromFlight(trip.request, chosen);
  const next = landing ? withLanding(withResult(trip, { chosen, landing_from_flight: true }), landing) : withResult(trip, { chosen });
  const stops = transitStops(chosen, trip.request);
  const transit = stops.length ? ` It stops in ${stops.map((s) => s.city).join(" and ")}: I'm checking the transit rules for your passport.` : "";
  return say(
    { ...next, agent_steps: [...next.agent_steps, `You chose ${chosen.airline}, ${formatPrice(chosen)}`] },
    `I'm opening ${describeFlight(chosen)}, watch the tab on the left.${transit}`,
  );
}

// The passport Nami checks the transits for: the nationality given, else French like the papers (passportLabel).
const passportOf = (trip: Trip) => trip.request.nationality ?? "FR";

// The stops abroad of the chosen flight still to check: what the client sends to /api/transit, one call per stop.
// Null once checked, or when the flight has no stop abroad.
export function pendingTransitChecks(trip: Trip): TransitInput[] | null {
  const result = flightsResult(trip.agent_run);
  const { destination } = trip.request;
  if (!result?.chosen || result.transit || !destination) return null;
  const stops = transitStops(result.chosen, trip.request);
  if (stops.length === 0) return null;
  return stops.map((s) => ({ nationality: passportOf(trip), city: s.city, country_iso2: s.country_iso2 ?? "ZZ", connection: s.connection, layover_min: s.layover_min, destination }));
}

// The stops whose rules need no search (lib/journey/transit.ts knownTransit): settled here, without the API.
export function knownTransitChecks(trip: Trip): TransitCheck[] {
  const chosen = flightsResult(trip.agent_run)?.chosen;
  if (!chosen) return [];
  return transitStops(chosen, trip.request).flatMap((s) => knownTransit(s, passportOf(trip)) ?? []);
}

// What was found, said in one message: clear, a visa, or "not verified": the journey is never called ready otherwise.
export function recordTransitChecks(trip: Trip, checks: TransitCheck[]): Trip {
  if (!trip.agent_run || checks.length === 0) return trip;
  const kept = withResult(trip, { transit: checks });
  return say({ ...kept, agent_steps: [...kept.agent_steps, `Checked the transit in ${checks.map((c) => c.city).join(", ")}`] }, transitMessage(checks));
}

// Writes the landing into the request and recomputes the windows of the Bali papers from it (null: back to the
// assumed landing, the day after the departure).
export function withLanding(trip: Trip, arrival_at: string | null): Trip {
  const request = { ...trip.request, arrival_at };
  const arrival = assumedArrival(request);
  const windows = arrival ? formalityWindows({ arrival_at: arrival }, BALI_PAPERS) : [];
  return {
    ...trip,
    request,
    formalities: trip.formalities.map((f) => {
      const window = windows.find((w) => w.id === f.id);
      return BALI_PAPERS.some((p) => p.id === f.id) ? { ...f, opens_at: window?.opens_at ?? null, closes_at: window?.closes_at ?? null } : f;
    }),
  };
}

// The landing time, once a flight is chosen: its arrival time on the departure day (+1 when the page says so),
// Bali time. Only for Bali, whose offset we know; elsewhere the landing stays unknown.
export function landingFromFlight(request: Trip["request"], flight: FlightOption): string | null {
  const time = /^(\d{2}:\d{2})(\+1)?$/.exec(flight.arrive_at.trim());
  const { departure_date, destination, country_iso2 } = request;
  if (!time || !departure_date || !destination || !country_iso2 || !isBali({ destination, country_iso2 })) return null;
  return `${time[2] ? nextDay(departure_date) : departure_date}T${time[1]}+08:00`;
}

// The choice still to send to H (the report_flights call it is waiting on), once the traveller has picked a flight.
export function pendingFlightChoice(trip: Trip): { tool_req: ToolRequest; flight: FlightOption } | null {
  const result = flightsResult(trip.agent_run);
  if (!result?.chosen || !result.tool_req) return null;
  return { tool_req: result.tool_req, flight: result.chosen };
}

function closeFlightQuestions(trip: Trip, answer: string): Trip {
  return {
    ...trip,
    conversation: trip.conversation.map((i) => (i.kind === "question" && isFlightQuestion(i.field) && i.answer === null ? { ...i, answer } : i)),
  };
}

export function applyFlightsChanges(trip: Trip, changes: AgentChanges, secrets: readonly (string | null | undefined)[]): { trip: Trip; toolCalls: ToolRequest[] } {
  const run = trip.agent_run;
  if (!run) return { trip, toolCalls: [] };
  const parsed = AgentStateSchema.safeParse(changes.status);
  const hStatus = parsed.success ? parsed.data : run.h_status;
  const hTerminal = hStatus !== undefined && isTerminalStatus(hStatus);
  const stoppedHere = run.state === "interrupted" && !(run.h_status && isTerminalStatus(run.h_status));
  const state = changes.left_official_site || (stoppedHere && !hTerminal) ? "interrupted" : (hStatus ?? run.state);
  const wasTerminal = isTerminalStatus(run.state);
  const terminal = isTerminalStatus(state);
  const steps = changes.steps
    .map((s) => redact(s, secrets))
    .filter((s, i, all) => s !== (i === 0 ? trip.agent_steps.at(-1) : all[i - 1]));
  if (stoppedHere && hTerminal) steps.push("H confirmed the session is stopped");

  let next: Trip = {
    ...trip,
    agent_steps: [...trip.agent_steps, ...steps],
    agent_run: {
      ...run,
      state,
      h_status: hStatus,
      next_index: changes.next_index,
      metrics: changes.metrics ?? run.metrics,
      drained: hTerminal && changes.no_change,
      error: changes.error_code ?? run.error,
    },
  };

  if (terminal && !wasTerminal) {
    next = closeFlightQuestions({ ...next, agent_run: { ...next.agent_run!, pending_question: undefined } }, AGENT_STOPPED_ANSWER);
    // H never opened Google Flights: the same search starts again by itself (same dates, origin and criterion), once.
    if (wantsAutoRestart(run, changes)) {
      next = say({ ...next, agent_run: { ...next.agent_run!, auto_restart: "due" } }, H_SLOW_RESTART_MESSAGE);
    } else if (changes.error_code === "stalled") {
      next = retry(say(next, H_NOT_ANSWERING_MESSAGE));
    } else if (changes.left_official_site) {
      const host = redact(changes.left_official_site, secrets);
      next = retry(say(next, `Agent stopped: it left Google Flights (${host}). Nothing was booked.${changes.cancel_failed ? " Run holo local stop in a terminal to stop it." : ""}`));
    } else if (state === "timed_out") {
      next = retry(say(next, "The flight search took too long and the agent stopped. Nothing was booked."));
    } else if (state === "failed") {
      next = retry(say(next, `The flight search stopped before the end (${changes.error_code ?? state}). Nothing was booked.`));
    } else if (state === "completed") {
      next = retry(say(next, "The agent finished without opening a flight. Nothing was booked."));
    } else {
      next = retry(say(next, "The flight search was closed. Nothing was booked."));
    }
  }

  // The run ended without opening the flight (here, or by Stop before this poll): its landing time goes, the papers
  // get back their assumed windows. Once only: the flag is cleared.
  if (terminal && flightsResult(run)?.landing_from_flight && !flightsResult(run)?.ready) {
    next = withLanding(withResult(next, { landing_from_flight: false }), null);
  }

  return { trip: next, toolCalls: terminal ? [] : freshToolCalls(changes.pending_tool_calls, run.handled_tool_ids ?? []) };
}

// report_ready on a flights session: the agent stopped on Google's booking options page. The end of the demo.
export function reportFlightsReady(trip: Trip, call: ToolRequest, secrets: readonly (string | null | undefined)[]): Trip {
  const run = trip.agent_run;
  if (!run || (run.handled_tool_ids ?? []).includes(toolCallKey(call))) return trip;
  const summary = redact(typeof call.args.summary === "string" ? call.args.summary : "", secrets);
  const chosen = flightsResult(run)?.chosen;
  const stopped = withResult(closeFlightQuestions(trip, AGENT_STOPPED_ANSWER), { ready: true }, {
    state: "interrupted",
    drained: true,
    pending_question: undefined,
    handled_tool_ids: [...(run.handled_tool_ids ?? []), toolCallKey(call)],
  });
  const found = chosen ? describeFlight(chosen) : summary || "see the tab on the left";
  return push(
    { ...stopped, agent_steps: [...stopped.agent_steps, "Stopped on the booking page, nothing clicked"] },
    { kind: "agent", text: `${FLIGHT_READY_PREFIX}${found}, book it when you want, Nami never pays.` },
    HOTELS_PROPOSAL,
  );
}
