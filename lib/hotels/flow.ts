// Module Hôtel in the conversation: after "yes" to the hotel, the criterion, the hotels read on Google Hotels, the
// traveller's choice, and the end of the agent's run. Same path as the flights (lib/flights/flow.ts), and like them kept
// out of lib/trip-state.ts, which only branches here when a question or a run belongs to the hotels.

import { z } from "zod";
import { freshToolCalls, H_NOT_ANSWERING_MESSAGE, H_SLOW_RESTART_MESSAGE, redact, toolCallKey, wantsAutoRestart, type AgentChanges } from "@/lib/agent-changes";
import { AgentStateSchema, HotelCriterionSchema, HotelOptionSchema, type AgentRun, type HotelCriterion, type HotelOption } from "@/lib/contracts";
import { ORDINAL_WORDS, saidWord, spokenWords } from "@/lib/flights/flow";
import { isTerminalStatus, type ToolRequest } from "@/lib/h-agent";
import { describeHotel, formatHotelPrice, HOTEL_CRITERION_LABELS, hotelLabel, rankHotels } from "@/lib/hotels/rank";
import type { ConversationItem, Trip } from "@/lib/trip-state";

export const HOTEL_QUESTION_FIELDS = ["hotel_criterion", "hotel_choice"] as const;
export type HotelQuestionField = (typeof HOTEL_QUESTION_FIELDS)[number];
type HotelQuestion = Extract<ConversationItem, { kind: "question" }> & { field: HotelQuestionField };

export function isHotelQuestion(field: string): field is HotelQuestionField {
  return (HOTEL_QUESTION_FIELDS as readonly string[]).includes(field);
}

export const HOTELS_SEARCHING_MESSAGE = "I'm searching your hotels on Google, watch the tab on the left.";
export const HOTEL_READY_PREFIX = "Your hotel is found: ";
export const HOTELS_RETRY_PROPOSAL = { action: "hotels", text: "Shall I search your hotels again?", accept_label: "Search again", decline_label: "Not now" } as const;
export const HOTELS_UNREADABLE_MESSAGE = "I could not read the hotels on the page. Look at the tab on the left and choose one yourself.";
export const HOTELS_REREAD_MESSAGE = "The hotels are still loading, the agent is reading them again.";
const CRITERION_QUESTION = "What matters most for your hotel: the cheapest, the best rated, or the best compromise?";
const AGENT_STOPPED_ANSWER = "Agent stopped";
const CHEAP_WORDS = ["cheap", "price", "budget", "moins cher", "pas cher", "barato", "billig", "gunstig", "economico"];
const RATED_WORDS = ["rated", "rating", "reviews", "note", "noté", "avis", "valorado", "bewertet"].map((w) => spokenWords(w));
const COMPROMISE_WORDS = ["best", "balance", "compromise", "meilleur", "compromis", "mejor", "beste", "migliore"];
const GENERIC_HOTEL_WORDS = new Set(["hotel", "resort", "villa", "villas", "residence", "spa", "and", "the", "bali", "boutique", "inn", "beach"]);

export function isHotelReadyMessage(text: string): boolean {
  return text.startsWith(HOTEL_READY_PREFIX);
}

const HotelsRunResultSchema = z.object({
  url: z.string().optional(),
  criterion: HotelCriterionSchema.optional(),
  read: z.number().int().nonnegative().optional(),
  options: z.array(HotelOptionSchema).default([]),
  chosen: HotelOptionSchema.optional(),
  tool_req: z.object({ tool_name: z.string(), args: z.record(z.string(), z.unknown()), id: z.string().nullable() }).optional(),
  ready: z.boolean().optional(),
});
type HotelsRunResult = z.infer<typeof HotelsRunResultSchema>;

export function hotelsResult(run: AgentRun | null): HotelsRunResult | null {
  if (!run || run.kind !== "hotels") return null;
  const parsed = HotelsRunResultSchema.safeParse(run.result?.hotels ?? {});
  return parsed.success ? parsed.data : null;
}

type NewItem = ConversationItem extends infer T ? (T extends ConversationItem ? Omit<T, "id"> : never) : never;

function push(trip: Trip, ...items: NewItem[]): Trip {
  return items.reduce<Trip>(
    (t, item) => ({ ...t, conversation: [...t.conversation, { ...item, id: `${t.id}-${t.conversation.length + 1}` } as ConversationItem] }),
    trip,
  );
}

function answerItem(trip: Trip, id: string, answer: string): Trip {
  return { ...trip, conversation: trip.conversation.map((item) => (item.id === id ? ({ ...item, answer } as ConversationItem) : item)) };
}

function withResult(trip: Trip, patch: Partial<HotelsRunResult>, run: Partial<AgentRun> = {}): Trip {
  if (!trip.agent_run) return trip;
  const hotels = { ...(hotelsResult(trip.agent_run) ?? { options: [] }), ...patch };
  return { ...trip, agent_run: { ...trip.agent_run, ...run, result: { ...trip.agent_run.result, hotels } } };
}

const say = (trip: Trip, text: string) => push(trip, { kind: "agent", text });
const retry = (trip: Trip) =>
  trip.conversation.some((i) => i.kind === "proposal" && i.action === "hotels" && i.decision === null)
    ? trip
    : push(trip, { kind: "proposal", ...HOTELS_RETRY_PROPOSAL, decision: null });
const question = (field: HotelQuestionField, text: string, options: { label: string; value: string }[]): NewItem => ({
  kind: "question", from: "nami", field, question: text, options, input: null, answer: null,
});

function askCriterion(trip: Trip): Trip {
  return push(trip, question("hotel_criterion", CRITERION_QUESTION, HotelCriterionSchema.options.map((value) => ({ label: HOTEL_CRITERION_LABELS[value], value }))));
}

// The criterion the traveller chose, from the last criterion question answered; null when none was.
export function answeredHotelCriterion(trip: Trip): HotelCriterion | null {
  const item = trip.conversation.findLast((i) => i.kind === "question" && i.field === "hotel_criterion" && i.answer !== null && i.answer !== AGENT_STOPPED_ANSWER);
  if (item?.kind !== "question") return null;
  const parsed = HotelCriterionSchema.safeParse(item.options.find((o) => o.label === item.answer)?.value);
  return parsed.success ? parsed.data : null;
}

export const hotelsAnswered = (trip: Trip) => answeredHotelCriterion(trip) !== null;

// "Yes" to the hotel: the criterion, then the client starts the agent. "Search again" finds it answered and asks nothing.
export function startHotelsFlow(trip: Trip): Trip {
  return hotelsAnswered(trip) ? say(trip, HOTELS_SEARCHING_MESSAGE) : askCriterion(trip);
}

export const isHotelCriterionQuestion = (item: ConversationItem | undefined) => item?.kind === "question" && item.field === "hotel_criterion";
export const isHotelChoiceQuestion = (item: ConversationItem | undefined) => item?.kind === "question" && item.field === "hotel_choice";

export function openHotelQuestion(trip: Trip, field: HotelQuestionField): boolean {
  return trip.conversation.some((i) => i.kind === "question" && i.field === field && i.answer === null);
}

// A price and a rating named together, or the word compromise: the compromise. Nothing understood: null.
export function matchHotelCriterion(text: string): HotelCriterion | null {
  const said = spokenWords(text);
  const has = (words: string[]) => words.some((w) => saidWord(said, w));
  const cheap = has(CHEAP_WORDS);
  const rated = has(RATED_WORDS);
  if (cheap && rated) return "best";
  if (rated) return "best_rated";
  if (cheap) return "cheapest";
  return has(COMPROMISE_WORDS) ? "best" : null;
}

// The hotel named by an ordinal ("the second") or by a word of its name ("Alila"); null when it is unclear.
export function matchHotel(text: string, options: HotelOption[]): HotelOption | null {
  const said = spokenWords(text);
  const byOrdinal = options.filter((_, i) => ORDINAL_WORDS[i]?.some((w) => saidWord(said, w)));
  const byName = options.filter((h) => spokenWords(h.name).split(" ").some((w) => w.length >= 3 && !GENERIC_HOTEL_WORDS.has(w) && saidWord(said, w)));
  const hits = [...new Set([...byOrdinal, ...byName])];
  return hits.length === 1 ? hits[0] : null;
}

export function answerHotelQuestion(trip: Trip, item: HotelQuestion, value: string, label: string): Trip {
  const answered = answerItem(trip, item.id, label);
  return item.field === "hotel_criterion" ? say(answered, HOTELS_SEARCHING_MESSAGE) : chooseHotel(answered, value);
}

function askAgain(trip: Trip, item: HotelQuestion, text: string): Trip {
  return push(say(answerItem(trip, item.id, text), "Sorry, I didn't catch that."), question(item.field, item.question, item.options));
}

export function answerHotelQuestionWithText(trip: Trip, item: HotelQuestion, text: string): Trip {
  if (item.field === "hotel_criterion") {
    const criterion = matchHotelCriterion(text);
    return criterion ? answerHotelQuestion(trip, item, criterion, HOTEL_CRITERION_LABELS[criterion]) : askAgain(trip, item, text);
  }
  const hotel = matchHotel(text, hotelsResult(trip.agent_run)?.options ?? []);
  if (!hotel) return askAgain(trip, item, text);
  return answerHotelQuestion(trip, item, String(hotel.index), item.options.find((o) => o.value === String(hotel.index))?.label ?? describeHotel(hotel));
}

export type HotelsStartBody = { destination: string; checkin: string; checkout: string; criterion: HotelCriterion };

// From the trip's dates: the night of the landing is not known, so the stay is the trip itself.
export function hotelsStartBody(trip: Trip): HotelsStartBody | null {
  const { destination, departure_date, return_date } = trip.request;
  if (!destination || !departure_date || !return_date || return_date <= departure_date) return null;
  return { destination, checkin: departure_date, checkout: return_date, criterion: answeredHotelCriterion(trip) ?? "best" };
}

export function startHotelsSession(trip: Trip, sessionId: string, url: string, now: Date): Trip {
  return {
    ...trip,
    agent_run: {
      session_id: sessionId,
      kind: "hotels",
      started_at: now.toISOString(),
      state: "pending",
      next_index: 0,
      handled_tool_ids: [],
      drained: false,
      result: { hotels: { url, criterion: answeredHotelCriterion(trip) ?? "best", options: [] } },
    },
    agent_steps: [`Opened Google Hotels for ${trip.request.departure_date ?? "?"} to ${trip.request.return_date ?? "?"}`],
  };
}

export function offerHotels(trip: Trip, call: ToolRequest, hotels: HotelOption[]): Trip {
  const run = trip.agent_run;
  if (!run || run.kind !== "hotels" || (run.handled_tool_ids ?? []).includes(toolCallKey(call))) return trip;
  const criterion = answeredHotelCriterion(trip) ?? "best";
  const ranked = rankHotels(hotels, criterion);
  const marked = withResult(trip, { criterion, read: hotels.length, options: ranked, tool_req: call }, { handled_tool_ids: [...(run.handled_tool_ids ?? []), toolCallKey(call)] });
  const withStep = { ...marked, agent_steps: [...marked.agent_steps, `Read ${hotels.length} hotels`] };
  if (ranked.length === 0) return say(withStep, HOTELS_UNREADABLE_MESSAGE);
  const list = ranked.map(describeHotel).join("; then ");
  return push(withStep, question("hotel_choice", `${HOTEL_CRITERION_LABELS[criterion]} first: ${list}: which one shall I open?`, ranked.map((h) => ({ label: hotelLabel(h), value: String(h.index) }))));
}

function chooseHotel(trip: Trip, value: string): Trip {
  const chosen = hotelsResult(trip.agent_run)?.options.find((h) => String(h.index) === value);
  if (!chosen) return say(trip, "I lost that hotel. Look at the tab on the left and choose one yourself.");
  const next = withResult(trip, { chosen });
  return say({ ...next, agent_steps: [...next.agent_steps, `You chose ${chosen.name}, ${formatHotelPrice(chosen)} a night`] }, `I'm opening ${chosen.name}, watch the tab on the left.`);
}

export function pendingHotelChoice(trip: Trip): { tool_req: ToolRequest; hotel: HotelOption } | null {
  const result = hotelsResult(trip.agent_run);
  return result?.chosen && result.tool_req ? { tool_req: result.tool_req, hotel: result.chosen } : null;
}

function closeHotelQuestions(trip: Trip, answer: string): Trip {
  return { ...trip, conversation: trip.conversation.map((i) => (i.kind === "question" && isHotelQuestion(i.field) && i.answer === null ? { ...i, answer } : i)) };
}

export function applyHotelsChanges(trip: Trip, changes: AgentChanges, secrets: readonly (string | null | undefined)[]): { trip: Trip; toolCalls: ToolRequest[] } {
  const run = trip.agent_run;
  if (!run) return { trip, toolCalls: [] };
  const parsed = AgentStateSchema.safeParse(changes.status);
  const hStatus = parsed.success ? parsed.data : run.h_status;
  const hTerminal = hStatus !== undefined && isTerminalStatus(hStatus);
  const stoppedHere = run.state === "interrupted" && !(run.h_status && isTerminalStatus(run.h_status));
  const state = changes.left_official_site || (stoppedHere && !hTerminal) ? "interrupted" : (hStatus ?? run.state);
  const terminal = isTerminalStatus(state);
  const steps = changes.steps.map((s) => redact(s, secrets)).filter((s, i, all) => s !== (i === 0 ? trip.agent_steps.at(-1) : all[i - 1]));
  let next: Trip = {
    ...trip,
    agent_steps: [...trip.agent_steps, ...steps],
    agent_run: { ...run, state, h_status: hStatus, next_index: changes.next_index, metrics: changes.metrics ?? run.metrics, drained: hTerminal && changes.no_change, error: changes.error_code ?? run.error },
  };
  if (terminal && !isTerminalStatus(run.state)) {
    next = closeHotelQuestions({ ...next, agent_run: { ...next.agent_run!, pending_question: undefined } }, AGENT_STOPPED_ANSWER);
    if (wantsAutoRestart(run, changes)) next = say({ ...next, agent_run: { ...next.agent_run!, auto_restart: "due" } }, H_SLOW_RESTART_MESSAGE);
    else if (changes.error_code === "stalled") next = retry(say(next, H_NOT_ANSWERING_MESSAGE));
    else if (changes.left_official_site) next = retry(say(next, `Agent stopped: it left Google Hotels (${redact(changes.left_official_site, secrets)}). Nothing was booked.${changes.cancel_failed ? " Run holo local stop in a terminal to stop it." : ""}`));
    else next = retry(say(next, "The hotel search stopped before the end. Nothing was booked."));
  }
  return { trip: next, toolCalls: terminal ? [] : freshToolCalls(changes.pending_tool_calls, run.handled_tool_ids ?? []) };
}

export function reportHotelsReady(trip: Trip, call: ToolRequest, secrets: readonly (string | null | undefined)[]): Trip {
  const run = trip.agent_run;
  if (!run || (run.handled_tool_ids ?? []).includes(toolCallKey(call))) return trip;
  const summary = redact(typeof call.args.summary === "string" ? call.args.summary : "", secrets);
  const chosen = hotelsResult(run)?.chosen;
  const stopped = withResult(closeHotelQuestions(trip, AGENT_STOPPED_ANSWER), { ready: true }, {
    state: "interrupted", drained: true, pending_question: undefined, handled_tool_ids: [...(run.handled_tool_ids ?? []), toolCallKey(call)],
  });
  return say(
    { ...stopped, agent_steps: [...stopped.agent_steps, "Stopped on the hotel's prices, nothing clicked"] },
    `${HOTEL_READY_PREFIX}${chosen ? describeHotel(chosen) : summary || "see the tab on the left"}, book it when you want, Nami never pays.`,
  );
}
