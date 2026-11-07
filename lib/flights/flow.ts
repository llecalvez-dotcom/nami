// Module Vol in the conversation (ticket 18): after "yes" to the flights, the dates, the criterion, the flights read on
// Google Flights, the traveller's choice, and the end of the agent's run. Kept out of lib/trip-state.ts, which only
// branches here when a question or a run belongs to the flights.

import { z } from "zod";
import { freshToolCalls, redact, toolCallKey, type AgentChanges } from "@/lib/agent-changes";
import { AgentStateSchema, FlightCriterionSchema, FlightOptionSchema, type AgentRun, type FlightCriterion, type FlightOption, type TripRequestDraft } from "@/lib/contracts";
import { isTerminalStatus, type ToolRequest } from "@/lib/h-agent";
import { CRITERION_LABELS, describeFlight, formatPrice, introduceFlights, rankFlights } from "@/lib/flights/rank";
import type { ConversationItem, Trip } from "@/lib/trip-state";

export const FLIGHT_QUESTION_FIELDS = ["return_date", "flight_criterion", "flight_choice"] as const;
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
const CRITERION_QUESTION = "What matters most for your flights: the cheapest, the fastest, no stop if possible, or the best balance?";
const ORDINALS = ["The first", "The second", "The third"];
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
const retry = (trip: Trip) => push(trip, { kind: "proposal", ...FLIGHTS_RETRY_PROPOSAL, decision: null });

function addDays(isoDate: string, days: number): string {
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

function askReturnDate(trip: Trip): Trip {
  const { departure_date, return_date } = trip.request;
  if (!departure_date) return say(trip, "I need your departure date first.");
  if (return_date) {
    return push(trip, question("return_date",
      `You leave Paris on ${longDate(departure_date)} and come back on ${longDate(return_date)}. Shall I search with those dates?`,
      [{ label: "Yes, those dates", value: return_date }], "text"));
  }
  const options = RETURN_OFFSETS_DAYS.map((days) => addDays(departure_date, days)).map((date) => ({ label: longDate(date), value: date }));
  return push(trip, question("return_date", `You leave on ${longDate(departure_date)}. When do you want to come back?`, options, "text"));
}

function askCriterion(trip: Trip): Trip {
  const options = FlightCriterionSchema.options.map((value) => ({ label: CRITERION_LABELS[value], value }));
  return push(trip, question("flight_criterion", CRITERION_QUESTION, options, null));
}

// "Yes" to the flights: the dates first, then the criterion, then the client starts the agent (startFlightsRun).
export function startFlightsFlow(trip: Trip): Trip {
  return askReturnDate(trip);
}

// The criterion the traveller chose, from the conversation: the last answered criterion question.
export function flightCriterion(trip: Trip): FlightCriterion {
  const answered = trip.conversation.findLast((i) => i.kind === "question" && i.field === "flight_criterion" && i.answer !== null);
  if (answered?.kind !== "question") return "best";
  const option = answered.options.find((o) => o.label === answered.answer);
  const parsed = FlightCriterionSchema.safeParse(option?.value);
  return parsed.success ? parsed.data : "best";
}

// The criterion question: once it is answered, the client starts the Google Flights session (startFlightsRun).
export function isCriterionQuestion(item: ConversationItem | undefined): boolean {
  return item?.kind === "question" && item.field === "flight_criterion";
}

export function isChoiceQuestion(item: ConversationItem | undefined): boolean {
  return item?.kind === "question" && item.field === "flight_choice";
}

export function answerFlightQuestion(trip: Trip, item: FlightQuestion, value: string, label: string): Trip {
  const answered = answerItem(trip, item.id, label);
  switch (item.field) {
    case "return_date":
      return askCriterion({ ...answered, request: { ...answered.request, return_date: value } });
    case "flight_criterion":
      return say(answered, FLIGHTS_SEARCHING_MESSAGE);
    case "flight_choice":
      return chooseFlight(answered, value);
  }
}

// A spoken or typed answer, understood by /api/trip/parse (it already reads a return date or a duration).
export function answerFlightQuestionWithText(trip: Trip, item: FlightQuestion, text: string, request: TripRequestDraft): Trip {
  const answered = { ...answerItem(trip, item.id, text), request };
  if (item.field !== "return_date") return answered;
  if (!request.return_date) return askReturnDate(say(answered, "Sorry, I didn't catch that."));
  return askCriterion(answered);
}

export type FlightsStartBody = { destination: string; departure_date: string; return_date: string; travellers: number; criterion: FlightCriterion };

// What the client sends to /api/flights/start, from the request; null while a date is missing.
export function flightsStartBody(trip: Trip): FlightsStartBody | null {
  const { destination, departure_date, return_date, travellers } = trip.request;
  if (!destination || !departure_date || !return_date) return null;
  return { destination, departure_date, return_date, travellers: travellers ?? 1, criterion: flightCriterion(trip) };
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
// options are the flights ("The first: Scoot, 646 €, ..."), so "the first", "Qatar" or a tap all work.
export function offerFlights(trip: Trip, call: ToolRequest, flights: FlightOption[]): Trip {
  const run = trip.agent_run;
  if (!run || run.kind !== "flights" || (run.handled_tool_ids ?? []).includes(toolCallKey(call))) return trip;
  const criterion = flightCriterion(trip);
  const ranked = rankFlights(flights, criterion);
  const marked = withResult(trip, { criterion, read: flights.length, options: ranked, tool_req: call }, { handled_tool_ids: [...(run.handled_tool_ids ?? []), toolCallKey(call)] });
  const withStep = { ...marked, agent_steps: [...marked.agent_steps, `Read ${flights.length} flights`] };
  if (ranked.length === 0) return say(withStep, FLIGHTS_UNREADABLE_MESSAGE);
  const intro = introduceFlights(criterion, flights).replace(/\.$/, "");
  const list = ranked.map((f) => describeFlight(f)).join("; then ");
  const options = ranked.map((f, i) => ({ label: `${ORDINALS[i]}: ${describeFlight(f)}`, value: String(f.index) }));
  return push(withStep, question("flight_choice", `${intro}: ${list}: which one shall I open?`, options, null));
}

function chooseFlight(trip: Trip, value: string): Trip {
  const result = flightsResult(trip.agent_run);
  const chosen = result?.options.find((f) => String(f.index) === value);
  if (!chosen) return say(trip, "I lost that flight. Look at the tab on the left and choose one yourself.");
  const next = withResult(trip, { chosen });
  return say(
    { ...next, agent_steps: [...next.agent_steps, `You chose ${chosen.airline}, ${formatPrice(chosen)}`] },
    `I'm opening ${describeFlight(chosen)}, watch the tab on the left.`,
  );
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
    next = closeFlightQuestions({ ...next, agent_run: { ...next.agent_run!, pending_question: undefined } }, "Agent stopped");
    if (changes.left_official_site) {
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

  return { trip: next, toolCalls: terminal ? [] : freshToolCalls(changes.pending_tool_calls, run.handled_tool_ids ?? []) };
}

// report_ready on a flights session: the agent stopped on Google's booking options page. The end of the demo.
export function reportFlightsReady(trip: Trip, call: ToolRequest, secrets: readonly (string | null | undefined)[]): Trip {
  const run = trip.agent_run;
  if (!run || (run.handled_tool_ids ?? []).includes(toolCallKey(call))) return trip;
  const summary = redact(typeof call.args.summary === "string" ? call.args.summary : "", secrets);
  const chosen = flightsResult(run)?.chosen;
  const stopped = withResult(closeFlightQuestions(trip, "Agent stopped"), { ready: true }, {
    state: "interrupted",
    drained: true,
    pending_question: undefined,
    handled_tool_ids: [...(run.handled_tool_ids ?? []), toolCallKey(call)],
  });
  const found = chosen ? describeFlight(chosen) : summary || "see the tab on the left";
  return push(
    { ...stopped, agent_steps: [...stopped.agent_steps, "Stopped on the booking page, nothing clicked"] },
    // One item, so the panel's "ready" moment stays in focus; spoken short, the hotels line stays on the screen.
    { kind: "agent", text: `${FLIGHT_READY_PREFIX}${found}, book it when you want, Nami never pays. Hotels are coming soon.` },
  );
}
