import { describe, expect, it } from "vitest";
import type { FlightOption } from "@/lib/contracts";
import type { ToolRequest } from "@/lib/h-agent";
import { asksDirectOnly, DIRECT_ONLY_KEPT_MESSAGE, knownTransitChecks, pendingTransitChecks, recordTransitChecks } from "@/lib/flights/flow";
import {
  applyFlightsChanges,
  BALANCED_CRITERIA_MESSAGE,
  FLIGHT_READY_PREFIX,
  FLIGHTS_SEARCHING_MESSAGE,
  flightCriterion,
  flightsAnswered,
  flightsResult,
  flightsStartBody,
  isChoiceQuestion,
  isCriterionQuestion,
  isFlightReadyMessage,
  landingFromFlight,
  longDate,
  matchCriterion,
  matchFlight,
  namesSeveralCriteria,
  openFlightQuestion,
  offerFlights,
  pendingFlightChoice,
  spokenCity,
  startFlightsSession,
} from "@/lib/flights/flow";
import { H_NOT_ANSWERING_MESSAGE, H_SLOW_RESTART_MESSAGE, type AgentChanges } from "@/lib/agent-changes";
import { agentOfficialUrl } from "@/lib/official-tab";
import { paperInFocus, readyPaper, agentChecklist } from "@/lib/panel-focus";
import { answerQuestion, answerQuestionWithText, applyAgentChanges, ARRIVAL_CARD_READY_MESSAGE, createTripFromRequest, decideProposal, markAutoRestart, needsPassportReconfirm, pushProposal, reportReady, stopAgent, type Trip } from "@/lib/trip-state";
import { spokenShort } from "@/lib/voice/conversation-speech";
import { matchOption } from "@/lib/voice/short-answers";

const NOW = new Date("2026-11-07T20:00:00Z");
const REQUEST = {
  raw_text: "Je pars à Bali le 23 novembre pour dix jours",
  nationality: "FR",
  origin_country: "FR",
  origin: "Paris" as string | null,
  destination: "Bali",
  country_iso2: "ID",
  departure_date: "2026-11-23",
  arrival_at: "2026-11-24T18:00+08:00" as string | null,
  return_date: "2026-12-03" as string | null,
  purpose: "tourism",
  travellers: 2,
  status: "planning" as const,
};

const flight = (index: number, airline: string, price: number, stops: number, duration_min: number): FlightOption => ({
  airline, price, currency: "EUR", stops, duration_min, depart_at: "13:50", arrive_at: "14:55+1", layovers: stops ? [{ airport: "Doha" }] : [], index,
});
const FLIGHTS = [flight(1, "Qatar Airways", 912, 1, 1110), flight(2, "Scoot", 646, 1, 1325), flight(3, "Emirates", 980, 1, 1180), flight(4, "KLM", 1030, 2, 1110)];
const REPORT: ToolRequest = { tool_name: "report_flights", args: { flights: FLIGHTS }, id: "call_1" };

const last = (trip: Trip) => trip.conversation.at(-1)!;
const agentTexts = (trip: Trip) => trip.conversation.filter((i) => i.kind === "agent").map((i) => (i as { text: string }).text);

// A trip with the flights proposal open, like after the arrival card.
function proposed(request = REQUEST): Trip {
  const trip = createTripFromRequest("t1", request, NOW);
  return pushProposal(trip, "flights", "Do you also want me to help you find your flights?", "Find my flight", "Not now");
}

function searching(request = REQUEST): Trip {
  let trip = decideProposal(proposed(request), last(proposed(request)).id, true, NOW);
  const dates = last(trip);
  if (dates.kind !== "question") throw new Error("no date question");
  trip = answerQuestion(trip, dates.id, dates.options[0].value, dates.options[0].label);
  const criterion = last(trip);
  if (criterion.kind !== "question") throw new Error("no criterion question");
  const cheapest = criterion.options.find((o) => o.value === "cheapest")!;
  trip = answerQuestion(trip, criterion.id, cheapest.value, cheapest.label);
  return startFlightsSession(trip, "s-flights", "https://www.google.com/travel/flights?q=x", NOW);
}

type Question = Extract<Trip["conversation"][number], { kind: "question" }>;
const proposals = (trip: Trip) => trip.conversation.filter((i) => i.kind === "proposal" && i.action === "flights");

describe("the departure city", () => {
  it("is asked first when the request has none, Paris proposed; a tap keeps it and goes to the dates", () => {
    const trip = decideProposal(proposed({ ...REQUEST, origin: null }), last(proposed()).id, true, NOW);
    const item = last(trip) as Question;
    expect(item).toMatchObject({ kind: "question", field: "origin", question: "Which city do you fly from?", input: "text" });
    expect(item.options).toEqual([{ label: "Paris", value: "Paris" }]);
    const dates = answerQuestion(trip, item.id, "Paris", "Paris");
    expect(dates.request.origin).toBe("Paris");
    expect(last(dates)).toMatchObject({ field: "return_date", question: expect.stringContaining("You leave Paris on Monday 23 November") });
  });

  it("is not asked when the traveller already said it; the dates then name that city, and the start body carries it", () => {
    const trip = decideProposal(proposed({ ...REQUEST, origin: "Lyon" }), last(proposed()).id, true, NOW);
    expect(last(trip)).toMatchObject({ field: "return_date", question: expect.stringContaining("You leave Lyon on") });
    expect(flightsStartBody(searching({ ...REQUEST, origin: "Lyon" }))?.origin).toBe("Lyon");
    expect(flightsStartBody(searching())?.origin).toBe("Paris");
  });

  it("a spoken city comes from the parsed request, else from the words said; nothing usable asks again", () => {
    const trip = decideProposal(proposed({ ...REQUEST, origin: null }), last(proposed()).id, true, NOW);
    const item = last(trip) as Question;
    const parsed = answerQuestionWithText(trip, item.id, "je pars de Lyon", { ...REQUEST, origin: "Lyon" });
    expect(parsed.request.origin).toBe("Lyon");
    expect(last(parsed)).toMatchObject({ field: "return_date" });
    const words = answerQuestionWithText(trip, item.id, "from Brussels please", { ...REQUEST, origin: null });
    expect(words.request.origin).toBe("Brussels please");
    const plain = answerQuestionWithText(trip, item.id, "marseille", { ...REQUEST, origin: null });
    expect(plain.request.origin).toBe("Marseille");
    const unclear = answerQuestionWithText(trip, item.id, "euh", { ...REQUEST, origin: null });
    expect(agentTexts(unclear)).toContain("Sorry, I didn't catch that.");
    expect(last(unclear)).toMatchObject({ field: "origin", answer: null });
    expect(spokenCity("yes")).toBeNull();
    expect(spokenCity("I fly from Nice.")).toBe("Nice");
    expect(spokenCity("le 23 novembre")).toBeNull();
  });
});

describe("one flight proposal only", () => {
  const arrivalCardRun = (trip: Trip): Trip => ({
    ...trip,
    agent_run: { session_id: "s-card", kind: "paper", paper_id: "arrival_card", started_at: NOW.toISOString(), state: "running", next_index: 0, handled_tool_ids: [], drained: false },
  });
  const ready = (id: string): ToolRequest => ({ tool_name: "report_ready", args: { summary: "Arrival card filled" }, id });

  it("the arrival card's report_ready proposes the flights once; a second call, a declined card or a late ready do not", () => {
    const base = createTripFromRequest("t1", REQUEST, NOW);
    const once = reportReady(arrivalCardRun(base), ready("call_a"), []);
    expect(agentTexts(once)).toContain(ARRIVAL_CARD_READY_MESSAGE);
    expect(proposals(once)).toHaveLength(1);
    expect(proposals(reportReady({ ...once, agent_run: { ...once.agent_run!, drained: false } }, ready("call_b"), []))).toHaveLength(1);
    const cardDeclined = pushProposal(once, "create_arrival_card", "Shall I fill in your arrival card too?", "Yes", "Not now");
    expect(proposals(decideProposal(cardDeclined, last(cardDeclined).id, false, NOW))).toHaveLength(1);
    expect(pushProposal(once, "flights", "Do you also want me to help you find your flights?", "Find my flight", "Not now")).toBe(once);
  });

  it("never proposes again once the flights are accepted, searched or found", () => {
    const accepted = decideProposal(proposed(), last(proposed()).id, true, NOW);
    expect(proposals(reportReady(arrivalCardRun(accepted), ready("call_c"), []))).toHaveLength(1);
    const inSearch = searching();
    expect(proposals(inSearch)).toHaveLength(1);
    const cardDeclined = pushProposal(inSearch, "create_arrival_card", "Shall I fill in your arrival card too?", "Yes", "Not now");
    expect(proposals(decideProposal(cardDeclined, last(cardDeclined).id, false, NOW))).toHaveLength(1);
    // A declined proposal may come back later (the arrival card is done): it is the only case.
    const declined = decideProposal(proposed(), last(proposed()).id, false, NOW);
    expect(proposals(reportReady(arrivalCardRun(declined), ready("call_d"), []))).toHaveLength(2);
  });
});

describe("yes to the flights", () => {
  it("confirms both dates when the return is known, as one question answered by yes or by a new date", () => {
    const trip = decideProposal(proposed(), last(proposed()).id, true, NOW);
    const item = last(trip);
    expect(item.kind).toBe("question");
    if (item.kind !== "question") return;
    expect(item.field).toBe("return_date");
    expect(item.question).toBe("You leave Paris on Monday 23 November and come back on Thursday 3 December. Shall I search with those dates?");
    expect(item.options).toEqual([{ label: "Yes, those dates", value: "2026-12-03" }]);
    expect(item.input).toBe("text");
    expect(trip.modules.find((m) => m.module === "flights")?.state).toBe("accepted");
  });

  it("asks for the return date with three dates to tap when it is unknown", () => {
    const trip = decideProposal(proposed({ ...REQUEST, return_date: null }), last(proposed()).id, true, NOW);
    const item = last(trip);
    if (item.kind !== "question") throw new Error("no question");
    expect(item.question).toBe("You leave on Monday 23 November. When do you want to come back?");
    expect(item.options.map((o) => o.value)).toEqual(["2026-11-30", "2026-12-03", "2026-12-07"]);
    expect(item.options[1].label).toBe("Thursday 3 December");
  });

  it("declined: no search, module declined", () => {
    const trip = decideProposal(proposed(), last(proposed()).id, false, NOW);
    expect(trip.conversation.at(-2)).toMatchObject({ kind: "agent", text: "Okay, no flight search for now." });
    expect(last(trip)).toMatchObject({ kind: "proposal", action: "hotels", decision: null });
    expect(trip.modules.find((m) => m.module === "flights")?.state).toBe("declined");
  });

  it("the date answer sets return_date and asks the criterion, with four options understood by voice", () => {
    let trip = decideProposal(proposed({ ...REQUEST, return_date: null }), last(proposed()).id, true, NOW);
    const dates = last(trip) as Extract<Trip["conversation"][number], { kind: "question" }>;
    trip = answerQuestion(trip, dates.id, "2026-12-03", "Thursday 3 December");
    expect(trip.request.return_date).toBe("2026-12-03");
    const criterion = last(trip);
    if (criterion.kind !== "question") throw new Error("no criterion");
    expect(isCriterionQuestion(criterion)).toBe(true);
    expect(criterion.options.map((o) => o.value)).toEqual(["cheapest", "fastest", "fewest_stops", "best"]);
    expect(matchOption("the cheapest", criterion.options)?.value).toBe("cheapest");
    expect(matchOption("no stop if possible", criterion.options)?.value).toBe("fewest_stops");
    expect(matchOption("best compromise", criterion.options)?.value).toBe("best");
    // "price" or "stops" said alone must not land on the compromise label (Devin Review on #96).
    expect(matchOption("price", criterion.options)).toBeNull();
    expect(matchOption("stops", criterion.options)).toBeNull();
    expect(spokenShort(criterion.question)).toBe(criterion.question);
  });

  it("a spoken date goes through the parsed request; nothing understood asks again", () => {
    let trip = decideProposal(proposed({ ...REQUEST, return_date: null }), last(proposed()).id, true, NOW);
    const dates = last(trip);
    trip = answerQuestionWithText(trip, dates.id, "euh je sais pas", { ...REQUEST, return_date: null });
    expect(agentTexts(trip)).toContain("Sorry, I didn't catch that.");
    const again = last(trip);
    if (again.kind !== "question") throw new Error("no second question");
    expect(again.field).toBe("return_date");
    trip = answerQuestionWithText(trip, again.id, "le 5 décembre", { ...REQUEST, return_date: "2026-12-05" });
    expect(trip.request.return_date).toBe("2026-12-05");
    expect(isCriterionQuestion(last(trip))).toBe(true);
  });

  it("the criterion answer announces the search and gives the start body from the request", () => {
    let trip = decideProposal(proposed(), last(proposed()).id, true, NOW);
    const dates = last(trip) as Extract<Trip["conversation"][number], { kind: "question" }>;
    trip = answerQuestion(trip, dates.id, dates.options[0].value, dates.options[0].label);
    const criterion = last(trip) as Extract<Trip["conversation"][number], { kind: "question" }>;
    trip = answerQuestion(trip, criterion.id, "fastest", "The fastest");
    expect(last(trip)).toMatchObject({ kind: "agent", text: FLIGHTS_SEARCHING_MESSAGE });
    expect(flightCriterion(trip)).toBe("fastest");
    expect(flightsStartBody(trip)).toEqual({ origin: "Paris", destination: "Bali", departure_date: "2026-11-23", return_date: "2026-12-03", travellers: 2, criterion: "fastest" });
    expect(flightsStartBody({ ...trip, request: { ...trip.request, return_date: null } })).toBeNull();
  });

  it("no to the proposed dates asks for the return date instead of keeping it", () => {
    let trip = decideProposal(proposed(), last(proposed()).id, true, NOW);
    const dates = last(trip);
    trip = answerQuestionWithText(trip, dates.id, "non", REQUEST);
    expect(agentTexts(trip)).toContain("Okay, tell me your return date.");
    const again = last(trip);
    if (again.kind !== "question") throw new Error("no question");
    expect(again.question).toBe("You leave on Monday 23 November. When do you want to come back?");
    expect(again.options).toHaveLength(3);
    trip = answerQuestionWithText(trip, again.id, "no, the fifth of December", { ...REQUEST, return_date: "2026-12-05" });
    expect(trip.request.return_date).toBe("2026-12-05");
    expect(isCriterionQuestion(last(trip))).toBe(true);
  });

  it("a spoken criterion is matched on its words; unknown words ask the same question again, and the search starts once", () => {
    let trip = decideProposal(proposed(), last(proposed()).id, true, NOW);
    const dates = last(trip) as Extract<Trip["conversation"][number], { kind: "question" }>;
    trip = answerQuestion(trip, dates.id, dates.options[0].value, dates.options[0].label);
    const criterion = last(trip) as Extract<Trip["conversation"][number], { kind: "question" }>;
    const unclear = answerQuestionWithText(trip, criterion.id, "euh je sais pas trop", REQUEST);
    expect(agentTexts(unclear)).toContain("Sorry, I didn't catch that.");
    expect(agentTexts(unclear)).not.toContain(FLIGHTS_SEARCHING_MESSAGE);
    const again = last(unclear) as Extract<Trip["conversation"][number], { kind: "question" }>;
    expect(again.question).toBe(criterion.question);
    expect(again.options).toEqual(criterion.options);
    expect(openFlightQuestion(unclear, "flight_criterion")).toBe(true);
    const settled = answerQuestionWithText(unclear, again.id, "I want the cheapest one", REQUEST);
    expect(openFlightQuestion(settled, "flight_criterion")).toBe(false);
    expect(flightCriterion(settled)).toBe("cheapest");
    expect(agentTexts(settled).filter((t) => t === FLIGHTS_SEARCHING_MESSAGE)).toHaveLength(1);
    expect(matchCriterion("sans escale si possible")).toBe("fewest_stops");
    expect(matchCriterion("le plus rapide")).toBe("fastest");
    expect(matchCriterion("the best balance")).toBe("best");
    // Two criteria at once: the compromise, and Nami says so.
    expect(matchCriterion("le moins cher et le plus rapide")).toBe("best");
    expect(matchCriterion("cheap and direct")).toBe("best");
    expect(matchCriterion("the cheapest price")).toBe("cheapest");
    // The panel checks the words before trusting the H model, which once kept "cheapest" alone (real run 2026-11-08).
    expect(namesSeveralCriteria("le moins cher et le plus rapide")).toBe(true);
    expect(namesSeveralCriteria("the cheapest one")).toBe(false);
    expect(namesSeveralCriteria("euh")).toBe(false);
    const combined = answerQuestionWithText(unclear, again.id, "le moins cher et le plus rapide", REQUEST);
    expect(flightCriterion(combined)).toBe("best");
    expect(agentTexts(combined)).toContain(BALANCED_CRITERIA_MESSAGE);
    expect(agentTexts(combined).at(-1)).toBe(FLIGHTS_SEARCHING_MESSAGE);
    expect(combined.conversation.findLast((i) => i.kind === "question" && i.field === "flight_criterion")).toMatchObject({ answer: "Best compromise" });
  });

  it("longDate is deterministic and in English", () => {
    expect(longDate("2026-11-23")).toBe("Monday 23 November");
  });
});

describe("search again after a failure", () => {
  const changes = (status: "failed" | "timed_out", error_code: string | null = null) => ({
    no_change: false, status, next_index: 9, steps: [], pending_tool_calls: [], answer: null, outcome: null, error_code, metrics: null,
  });
  const flightQuestions = (trip: Trip) => trip.conversation.filter((i) => i.kind === "question" && ["origin", "return_date", "flight_criterion"].includes(i.field));

  it("the answers are not in place until the criterion is chosen: the first yes asks the city, the dates, then the criterion", () => {
    let trip = proposed({ ...REQUEST, origin: null });
    expect(flightsAnswered(trip)).toBe(false);
    trip = decideProposal(trip, last(trip).id, true, NOW);
    const origin = last(trip) as Question;
    expect(origin.field).toBe("origin");
    trip = answerQuestion(trip, origin.id, "Paris", "Paris");
    expect(flightsAnswered(trip)).toBe(false);
    const dates = last(trip) as Question;
    expect(dates.field).toBe("return_date");
    trip = answerQuestion(trip, dates.id, dates.options[0].value, dates.options[0].label);
    expect(flightsAnswered(trip)).toBe(false);
    const criterion = last(trip) as Question;
    expect(criterion.field).toBe("flight_criterion");
    trip = answerQuestion(trip, criterion.id, "fastest", "The fastest");
    expect(flightsAnswered(trip)).toBe(true);
    expect(flightQuestions(trip)).toHaveLength(3);
  });

  it("a failed session, then yes to Search again: no question again, the search is announced with the same origin, dates and criterion", () => {
    const before = searching({ ...REQUEST, origin: "Lyon" });
    const failed = applyAgentChanges(before, changes("failed", "browser_lost"), []).trip;
    const proposal = last(failed);
    expect(proposal).toMatchObject({ kind: "proposal", action: "flights", accept_label: "Search again", decision: null });
    expect(flightsAnswered(failed)).toBe(true);
    const again = decideProposal(failed, proposal.id, true, NOW);
    expect(last(again)).toMatchObject({ kind: "agent", text: FLIGHTS_SEARCHING_MESSAGE });
    expect(flightQuestions(again)).toEqual(flightQuestions(before));
    expect(openFlightQuestion(again, "origin")).toBe(false);
    expect(openFlightQuestion(again, "return_date")).toBe(false);
    expect(openFlightQuestion(again, "flight_criterion")).toBe(false);
    expect(flightsStartBody(again)).toEqual({ origin: "Lyon", destination: "Bali", departure_date: "2026-11-23", return_date: "2026-12-03", travellers: 2, criterion: "cheapest" });
    const restarted = startFlightsSession(again, "s-flights-2", "https://www.google.com/travel/flights?q=y", NOW);
    expect(restarted.agent_run).toMatchObject({ kind: "flights", session_id: "s-flights-2", state: "pending" });
    expect(flightsResult(restarted.agent_run)?.criterion).toBe("cheapest");
  });

  it("a timeout while the traveller chooses: the choice closed by the agent's end is not an answer, the retry still asks nothing", () => {
    const offered = offerFlights(searching(), REPORT, FLIGHTS);
    const timedOut = applyAgentChanges(offered, changes("timed_out"), []).trip;
    expect(timedOut.conversation.find((i) => i.kind === "question" && i.field === "flight_choice")).toMatchObject({ answer: "Agent stopped" });
    const again = decideProposal(timedOut, last(timedOut).id, true, NOW);
    expect(last(again)).toMatchObject({ kind: "agent", text: FLIGHTS_SEARCHING_MESSAGE });
    expect(flightQuestions(again)).toHaveLength(2);
    expect(flightCriterion(again)).toBe("cheapest");
  });

  it("a failed start (no session) proposes the retry too; yes restarts without a question", () => {
    let trip = decideProposal(proposed(), last(proposed()).id, true, NOW);
    const dates = last(trip) as Question;
    trip = answerQuestion(trip, dates.id, dates.options[0].value, dates.options[0].label);
    const criterion = last(trip) as Question;
    trip = answerQuestion(trip, criterion.id, "best", "Best compromise");
    trip = pushProposal(trip, "flights", "Shall I search your flights again?", "Search again", "Not now");
    const again = decideProposal(trip, last(trip).id, true, NOW);
    expect(agentTexts(again).filter((t) => t === FLIGHTS_SEARCHING_MESSAGE)).toHaveLength(2);
    expect(flightQuestions(again)).toHaveLength(2);
    expect(flightsStartBody(again)?.criterion).toBe("best");
  });

  it("the first flights proposal accepted with the answers of an earlier attempt asks nothing either", () => {
    const failed = applyAgentChanges(searching(), changes("failed", "stalled"), []).trip;
    // The proposal of the arrival card's end, worded like the first one, comes after the failure.
    const declinedRetry = decideProposal(failed, last(failed).id, false, NOW);
    const first = pushProposal(declinedRetry, "flights", "Do you also want me to help you find your flights?", "Find my flight", "Not now");
    const again = decideProposal(first, last(first).id, true, NOW);
    expect(last(again)).toMatchObject({ kind: "agent", text: FLIGHTS_SEARCHING_MESSAGE });
    expect(flightQuestions(again)).toHaveLength(2);
  });
});

describe("the flights session", () => {
  it("starts a flights run with its URL, remembered for the official tab", () => {
    const trip = searching();
    expect(trip.agent_run).toMatchObject({ kind: "flights", session_id: "s-flights", state: "pending" });
    expect(trip.agent_steps).toEqual(["Opened Google Flights for 2026-11-23 to 2026-12-03"]);
    expect(agentOfficialUrl(trip)).toBe("https://www.google.com/travel/flights?q=x");
    expect(paperInFocus(trip, null)).toBe("flights");
    expect(agentChecklist("flights", trip.agent_steps, false)[0]).toEqual({ label: "Dates", state: "done" });
  });

  it("offers at most three checked flights ranked by the criterion, as one spoken question with tappable flights", () => {
    const trip = offerFlights(searching(), REPORT, FLIGHTS);
    const item = last(trip);
    if (item.kind !== "question") throw new Error("no choice question");
    expect(isChoiceQuestion(item)).toBe(true);
    expect(item.question).toBe(
      "The cheapest first: Scoot at 646 euros, one stop, 22 h 05; then Qatar Airways at 912 euros, one stop, 18 h 30; then Emirates at 980 euros, one stop, 19 h 40: which one shall I open?",
    );
    expect(spokenShort(item.question)).toBe(item.question);
    expect(item.options.map((o) => o.value)).toEqual(["2", "1", "3"]);
    // Short labels, no ordinal (the buttons sit one under the other), the layover city on the button only.
    expect(item.options.map((o) => o.label)).toEqual([
      "Scoot · 646 € · 1 stop Doha · 22 h 05 · leaves 13:50",
      "Qatar Airways · 912 € · 1 stop Doha · 18 h 30 · leaves 13:50",
      "Emirates · 980 € · 1 stop Doha · 19 h 40 · leaves 13:50",
    ]);
    // No ordinal on the buttons any more: "the second" goes through matchFlight (text path), the airline still matches a label.
    expect(matchOption("the second", item.options)).toBeNull();
    expect(matchFlight("the second", flightsResult(trip.agent_run)!.options, "cheapest")?.index).toBe(1);
    expect(matchOption("Qatar", item.options)?.value).toBe("1");
    expect(matchOption("Emirates", item.options)?.value).toBe("3");
    expect(trip.agent_steps).toContain("Read 4 flights");
    expect(flightsResult(trip.agent_run)).toMatchObject({ criterion: "cheapest", read: 4, tool_req: REPORT });
    expect(trip.agent_run?.handled_tool_ids).toContain("call_1");
    expect(offerFlights(trip, REPORT, FLIGHTS)).toBe(trip);
  });

  it("the choice is remembered, said, and waits to be sent to the agent", () => {
    let trip = offerFlights(searching(), REPORT, FLIGHTS);
    const item = last(trip) as Extract<Trip["conversation"][number], { kind: "question" }>;
    expect(pendingFlightChoice(trip)).toBeNull();
    trip = answerQuestion(trip, item.id, "1", item.options[1].label);
    expect(last(trip)).toMatchObject({ kind: "agent", text: "I'm opening Qatar Airways at 912 euros, one stop, 18 h 30, watch the tab on the left. It stops in Doha: I'm checking the transit rules for your passport." });
    expect(trip.agent_steps).toContain("You chose Qatar Airways, 912 €");
    expect(pendingFlightChoice(trip)).toEqual({ tool_req: REPORT, flight: FLIGHTS[0] });
  });

  it("a spoken choice is matched by airline, ordinal or criterion; unknown words ask again with the same report_flights call", () => {
    const offered = offerFlights(searching(), REPORT, FLIGHTS);
    const item = last(offered) as Extract<Trip["conversation"][number], { kind: "question" }>;
    const options = flightsResult(offered.agent_run)!.options;
    expect(matchFlight("Qatar", options, "cheapest")?.index).toBe(1);
    expect(matchFlight("le deuxième", options, "cheapest")?.index).toBe(1);
    expect(matchFlight("the third one", options, "cheapest")?.index).toBe(3);
    expect(matchFlight("the cheapest one", options, "cheapest")?.index).toBe(2);
    expect(matchFlight("the fastest", options, "cheapest")?.index).toBe(1);
    expect(matchFlight("Qatar or Emirates", options, "cheapest")).toBeNull();
    expect(matchFlight("hmm", options, "cheapest")).toBeNull();
    expect(matchFlight("the one at 200 euros", options, "cheapest")).toBeNull();
    expect(matchFlight("2", options, "cheapest")?.index).toBe(1);
    expect(matchFlight("the 2nd", options, "cheapest")?.index).toBe(1);
    expect(matchFlight("le 3ème", options, "cheapest")?.index).toBe(3);
    const unclear = answerQuestionWithText(offered, item.id, "hmm", REQUEST);
    expect(pendingFlightChoice(unclear)).toBeNull();
    expect(agentTexts(unclear)).toContain("Sorry, I didn't catch that.");
    const again = last(unclear) as Extract<Trip["conversation"][number], { kind: "question" }>;
    expect(again.field).toBe("flight_choice");
    expect(again.options).toEqual(item.options);
    const chosen = answerQuestionWithText(unclear, again.id, "Qatar please", REQUEST);
    expect(pendingFlightChoice(chosen)).toEqual({ tool_req: REPORT, flight: FLIGHTS[0] });
    expect(again.id).not.toBe(item.id);
    expect(chosen.conversation.find((i) => i.id === again.id)).toMatchObject({ answer: item.options[1].label });
    expect(chosen.request).toEqual(offered.request);
  });

  it("a flights run needs no passport reconfirmation after a reload", () => {
    expect(needsPassportReconfirm(searching().agent_run, false)).toBe(false);
  });

  it("a chosen flight gives the landing time for Bali when the request has none, never elsewhere", () => {
    const request = { ...REQUEST, arrival_at: null };
    expect(landingFromFlight(request, FLIGHTS[0])).toBe("2026-11-24T14:55+08:00");
    expect(landingFromFlight(request, { ...FLIGHTS[0], arrive_at: "23:10" })).toBe("2026-11-23T23:10+08:00");
    expect(landingFromFlight(request, { ...FLIGHTS[0], arrive_at: "2:10 pm" })).toBeNull();
    expect(landingFromFlight({ ...request, destination: "Lisbonne", country_iso2: "PT" }, FLIGHTS[0])).toBeNull();
    let trip = offerFlights(searching(request), REPORT, FLIGHTS);
    const papers = trip.conversation.find((i) => i.kind === "proposal" && i.action === "papers")!;
    trip = decideProposal(trip, papers.id, true, NOW);
    expect(trip.formalities.find((f) => f.id === "arrival_card")?.closes_at).toBe("2026-11-24T00:00+08:00");
    const item = trip.conversation.findLast((i) => i.kind === "question") as Extract<Trip["conversation"][number], { kind: "question" }>;
    trip = answerQuestion(trip, item.id, "1", item.options[1].label);
    expect(trip.request.arrival_at).toBe("2026-11-24T14:55+08:00");
    expect(trip.formalities.find((f) => f.id === "arrival_card")?.closes_at).toBe("2026-11-24T14:55+08:00");
    const failed = applyAgentChanges(trip, {
      no_change: false, status: "failed", next_index: 9, steps: [], pending_tool_calls: [], answer: null, outcome: null, error_code: "browser_lost", metrics: null,
    }, []).trip;
    expect(failed.request.arrival_at).toBeNull();
    expect(failed.formalities.find((f) => f.id === "arrival_card")?.closes_at).toBe("2026-11-24T00:00+08:00");
    expect(flightsResult(failed.agent_run)?.landing_from_flight).toBe(false);
    // Stop by the traveller marks the run interrupted before the next poll: the landing goes all the same.
    const stopped = stopAgent({ ...trip, agent_run: { ...trip.agent_run!, state: "running" } });
    expect(stopped.request.arrival_at).toBe("2026-11-24T14:55+08:00");
    const polled = applyAgentChanges(stopped, {
      no_change: false, status: "interrupted", next_index: 9, steps: [], pending_tool_calls: [], answer: null, outcome: null, error_code: null, metrics: null,
    }, []).trip;
    expect(polled.request.arrival_at).toBeNull();
    expect(polled.formalities.find((f) => f.id === "arrival_card")?.closes_at).toBe("2026-11-24T00:00+08:00");
    let kept = offerFlights(searching(), REPORT, FLIGHTS);
    kept = answerQuestion(kept, (last(kept) as { id: string }).id, "1", item.options[1].label);
    expect(kept.request.arrival_at).toBe(REQUEST.arrival_at);
  });

  it("report_ready ends the run on the booking page with the final message, then offers a hotel", () => {
    let trip = offerFlights(searching(), REPORT, FLIGHTS);
    const item = last(trip) as Extract<Trip["conversation"][number], { kind: "question" }>;
    trip = answerQuestion(trip, item.id, "2", item.options[0].label);
    trip = reportReady(trip, { tool_name: "report_ready", args: { summary: "Scoot 646 €", filled_fields: [] }, id: "call_2" }, []);
    expect(trip.agent_run).toMatchObject({ state: "interrupted", drained: true });
    const texts = agentTexts(trip);
    expect(texts.at(-1)).toBe(`${FLIGHT_READY_PREFIX}Scoot at 646 euros, one stop, 22 h 05, book it when you want, Nami never pays.`);
    expect(last(trip)).toMatchObject({ kind: "proposal", action: "hotels", decision: null });
    expect(spokenShort(texts.at(-1)!)).toBe("Your flight is found: Scoot at 646 euros, one stop, 22 h 05, book it when you want, Nami never pays.");
    expect(isFlightReadyMessage(texts.at(-1)!)).toBe(true);
    expect(readyPaper(trip.conversation, last(trip))).toBe("flights");
    expect(trip.agent_steps.at(-1)).toBe("Stopped on the booking page, nothing clicked");
    expect(trip.conversation.some((i) => i.kind === "proposal" && i.action === "flights" && i.decision === null)).toBe(false);
    expect(reportReady(trip, { tool_name: "report_ready", args: {}, id: "call_2" }, [])).toBe(trip);
  });

  it("a timeout while the traveller chooses closes the question, says it and proposes to search again", () => {
    const trip = offerFlights(searching(), REPORT, FLIGHTS);
    const { trip: next, toolCalls } = applyAgentChanges(trip, {
      no_change: false, status: "timed_out", next_index: 9, steps: [], pending_tool_calls: [], answer: null, outcome: null, error_code: null, metrics: null,
    }, []);
    expect(toolCalls).toEqual([]);
    expect(next.agent_run?.state).toBe("timed_out");
    const choice = next.conversation.find((i) => i.kind === "question" && i.field === "flight_choice");
    expect(choice).toMatchObject({ answer: "Agent stopped" });
    expect(agentTexts(next)).toContain("The flight search took too long and the agent stopped. Nothing was booked.");
    expect(last(next)).toMatchObject({ kind: "proposal", action: "flights", accept_label: "Search again", decision: null });
  });

  it("leaving Google and a failure both say nothing was booked; steps and tool calls flow like a paper run", () => {
    const base = searching();
    const left = applyFlightsChanges(base, {
      no_change: false, status: "running", next_index: 3, steps: ["Clicked Reject all", "Clicked Reject all", "Read the list"], pending_tool_calls: [REPORT], answer: null, outcome: null, error_code: null, metrics: null, left_official_site: "www.expedia.fr",
    }, []);
    expect(left.trip.agent_run?.state).toBe("interrupted");
    expect(left.trip.agent_steps).toEqual(["Opened Google Flights for 2026-11-23 to 2026-12-03", "Clicked Reject all", "Read the list"]);
    expect(agentTexts(left.trip)).toContain("Agent stopped: it left Google Flights (www.expedia.fr). Nothing was booked.");
    expect(left.toolCalls).toEqual([]);
    const running = applyFlightsChanges(base, {
      no_change: false, status: "running", next_index: 3, steps: ["Opened the page"], pending_tool_calls: [REPORT], answer: null, outcome: null, error_code: null, metrics: null,
    }, []);
    expect(running.toolCalls).toEqual([REPORT]);
    const failed = applyFlightsChanges(base, {
      no_change: false, status: "failed", next_index: 3, steps: [], pending_tool_calls: [], answer: null, outcome: null, error_code: "browser_lost", metrics: null,
    }, []);
    expect(agentTexts(failed.trip)).toContain("The flight search stopped before the end (browser_lost). Nothing was booked.");
  });

  it("Stop by the traveller closes an open flight question", () => {
    const trip = { ...offerFlights(searching(), REPORT, FLIGHTS) };
    const withRunning = { ...trip, agent_run: { ...trip.agent_run!, state: "running" as const } };
    const stopped = stopAgent(withRunning);
    expect(stopped.conversation.find((i) => i.kind === "question" && i.field === "flight_choice")).toMatchObject({ answer: "Agent stopped" });
  });
});

describe("H never opened Google Flights: one automatic restart with the same search", () => {
  const stalled = (before: boolean): AgentChanges => ({
    no_change: false, status: "failed", next_index: 1, steps: ["The agent stopped answering"], pending_tool_calls: [], answer: null, outcome: null,
    error_code: "stalled", stalled_before_action: before, metrics: null,
  });
  const questions = (trip: Trip) => trip.conversation.filter((i) => i.kind === "question" && i.answer === null);
  const openRetries = (trip: Trip) => proposals(trip).filter((p) => p.kind === "proposal" && p.decision === null);

  it("says H is slow and marks the restart due, asking neither the dates nor the departure city nor the criterion again", () => {
    const base = searching();
    const { trip } = applyFlightsChanges(base, stalled(true), []);
    expect(trip.agent_run).toMatchObject({ kind: "flights", state: "failed", auto_restart: "due" });
    expect(agentTexts(trip).at(-1)).toBe(H_SLOW_RESTART_MESSAGE);
    expect(openRetries(trip)).toEqual([]);
    expect(questions(trip)).toEqual([]);
    expect(flightsStartBody(trip)).toEqual(flightsStartBody(base));
  });

  it("after the one restart, a new stall proposes the single Shall I search again", () => {
    const due = applyFlightsChanges(searching(), stalled(true), []).trip;
    const restarted = markAutoRestart(startFlightsSession(markAutoRestart(due, "taken"), "s-flights-2", "https://www.google.com/travel/flights?q=x", NOW), "done");
    expect(restarted.agent_run).toMatchObject({ session_id: "s-flights-2", state: "pending", auto_restart: "done" });
    const second = applyFlightsChanges(restarted, stalled(true), []).trip;
    expect(agentTexts(second).at(-1)).toBe(H_NOT_ANSWERING_MESSAGE);
    expect(openRetries(second)).toHaveLength(1);
    expect(openRetries(applyFlightsChanges(second, stalled(true), []).trip)).toHaveLength(1);
  });

  it("a stall after the agent acted is not restarted by itself", () => {
    const { trip } = applyFlightsChanges(searching(), stalled(false), []);
    expect(trip.agent_run?.auto_restart).toBeUndefined();
    expect(agentTexts(trip).at(-1)).toBe(H_NOT_ANSWERING_MESSAGE);
    expect(openRetries(trip)).toHaveLength(1);
  });

  it("the automatic restart starts the session with everything answered, no question in between", () => {
    const due = applyFlightsChanges(searching(), stalled(true), []).trip;
    expect(flightsAnswered(due)).toBe(true);
    const restarted = startFlightsSession(markAutoRestart(due, "taken"), "s-flights-2", "https://www.google.com/travel/flights?q=x", NOW);
    expect(questions(restarted)).toEqual([]);
    expect(restarted.conversation.filter((i) => i.kind === "question")).toEqual(due.conversation.filter((i) => i.kind === "question"));
    expect(flightsStartBody(restarted)).toEqual(flightsStartBody(due));
  });

  it("yes to Shall I search again after H is not answering: no question again, the search is announced with the same parameters", () => {
    const second = applyFlightsChanges(searching(), stalled(false), []).trip;
    expect(agentTexts(second).at(-1)).toBe(H_NOT_ANSWERING_MESSAGE);
    const again = decideProposal(second, openRetries(second)[0].id, true, NOW);
    expect(last(again)).toMatchObject({ kind: "agent", text: FLIGHTS_SEARCHING_MESSAGE });
    expect(questions(again)).toEqual([]);
    expect(again.conversation.filter((i) => i.kind === "question")).toEqual(second.conversation.filter((i) => i.kind === "question"));
    expect(flightsStartBody(again)).toEqual({ origin: "Paris", destination: "Bali", departure_date: "2026-11-23", return_date: "2026-12-03", travellers: 2, criterion: "cheapest" });
    expect(openRetries(again)).toEqual([]);
  });
});

describe("departure city (P0: never Paris in the traveller's place)", () => {
  it("searches from Lyon when the trip says so, from the city said when asked, and nothing without a city", () => {
    expect(flightsStartBody(searching({ ...REQUEST, origin: "Lyon" }))?.origin).toBe("Lyon");
    const noCity = { ...searching(), request: { ...searching().request, origin: null } };
    expect(flightsStartBody(noCity)).toBeNull();
    expect(flightsAnswered(noCity)).toBe(false);
  });

  it("asks the dates without naming a city when none is known yet", () => {
    let trip: Trip = { ...proposed(), request: { ...REQUEST, origin: null } };
    trip = decideProposal(trip, last(trip).id, true, NOW);
    const origin = last(trip);
    if (origin.kind !== "question") throw new Error("no origin question");
    const dates = answerQuestionWithText(trip, origin.id, "I leave from Lyon", { ...REQUEST, origin: null });
    expect(dates.request.origin).toBe("Lyon");
    expect(last(dates)).toMatchObject({ field: "return_date", question: expect.stringContaining("You leave Lyon on") });
  });
});

describe("direct flights only (P0: a hard constraint, never relaxed in silence)", () => {
  const DIRECT_REQUEST = { ...REQUEST, raw_text: "Bali in November, only direct flights" };

  function directOnly(request = DIRECT_REQUEST): Trip {
    let trip = decideProposal(proposed(request), last(proposed(request)).id, true, NOW);
    const dates = last(trip);
    if (dates.kind !== "question") throw new Error("no date question");
    trip = answerQuestion(trip, dates.id, dates.options[0].value, dates.options[0].label);
    const criterion = last(trip);
    if (criterion.kind !== "question") throw new Error("no criterion question");
    const option = criterion.options.find((o) => o.value === "direct_only")!;
    trip = answerQuestion(trip, criterion.id, option.value, option.label);
    return startFlightsSession(trip, "s-flights", "https://www.google.com/travel/flights?q=x", NOW);
  }

  it("hears the constraint, in several languages, and not a preference", () => {
    expect(asksDirectOnly("only direct flights")).toBe(true);
    expect(asksDirectOnly("que des vols directs")).toBe(true);
    expect(asksDirectOnly("vol direct uniquement, le moins cher")).toBe(true);
    expect(asksDirectOnly("pas d'escale")).toBe(true);
    expect(asksDirectOnly("sans escale si possible")).toBe(false);
    expect(asksDirectOnly("the cheapest")).toBe(false);
    expect(matchCriterion("direct only and cheap")).toBe("direct_only");
    expect(matchCriterion("cheap and direct")).toBe("best");
  });

  it("offers the Direct flights only button when the trip asked for it, not otherwise", () => {
    const usual = searching();
    const criterionQuestion = usual.conversation.find((i) => i.kind === "question" && i.field === "flight_criterion");
    expect(criterionQuestion?.kind === "question" && criterionQuestion.options.map((o) => o.value)).toEqual(["cheapest", "fastest", "fewest_stops", "best"]);
    const trip = directOnly();
    expect(flightCriterion(trip)).toBe("direct_only");
    expect(flightsStartBody(trip)?.criterion).toBe("direct_only");
  });

  it("a criterion said without its button still counts", () => {
    let trip = decideProposal(proposed(), last(proposed()).id, true, NOW);
    const dates = last(trip);
    if (dates.kind !== "question") throw new Error("no date question");
    trip = answerQuestion(trip, dates.id, dates.options[0].value, dates.options[0].label);
    const criterion = last(trip);
    trip = answerQuestionWithText(trip, criterion.id, "uniquement des vols directs", REQUEST);
    expect(flightCriterion(trip)).toBe("direct_only");
  });

  it("shows only the direct flights when there are some", () => {
    const direct = [{ ...FLIGHTS[0], index: 9, stops: 0, layovers: [], price: 1250 }];
    const offered = offerFlights(directOnly(), { ...REPORT, args: { flights: [...FLIGHTS, ...direct] } }, [...FLIGHTS, ...direct]);
    const item = last(offered);
    if (item.kind !== "question") throw new Error("no choice");
    expect(item.field).toBe("flight_choice");
    expect(item.options).toHaveLength(1);
    expect(item.question).toContain("Direct flights only, as you asked");
    expect(item.question).not.toContain("1 stop");
  });

  it("with no direct flight, says so and asks before showing the ones with a stop; 'no' keeps the constraint", () => {
    const offered = offerFlights(directOnly(), REPORT, FLIGHTS);
    const item = last(offered);
    if (item.kind !== "question") throw new Error("no relax question");
    expect(item.field).toBe("flight_relax");
    expect(item.question).toContain("No direct flight from Paris to Bali on those days: I read 4 flights, all with at least one stop. I keep your constraint.");
    expect(offered.conversation.some((i) => i.kind === "question" && i.field === "flight_choice")).toBe(false);
    const kept = answerQuestion(offered, item.id, "keep", "Keep direct only");
    expect(last(kept)).toMatchObject({ kind: "agent", text: DIRECT_ONLY_KEPT_MESSAGE });
    const no = answerQuestionWithText(offered, item.id, "non merci", REQUEST);
    expect(last(no)).toMatchObject({ kind: "agent", text: DIRECT_ONLY_KEPT_MESSAGE });
  });

  it("'yes' shows the flights with the fewest stops, never called direct, and the choice opens one", () => {
    const offered = offerFlights(directOnly(), REPORT, FLIGHTS);
    const relax = last(offered);
    const shown = answerQuestionWithText(offered, relax.id, "oui", REQUEST);
    const choice = last(shown);
    if (choice.kind !== "question") throw new Error("no choice");
    expect(choice.field).toBe("flight_choice");
    expect(choice.question).toContain("None of these is direct");
    expect(choice.options.map((o) => o.value)).toEqual(["2", "1", "3"]);
    const chosen = answerQuestionWithText(shown, choice.id, "the second one", REQUEST);
    expect(flightsResult(chosen.agent_run)?.chosen?.index).toBe(1);
  });
});

describe("transit of the chosen flight (P1)", () => {
  function chosen(flights = FLIGHTS, request = REQUEST): Trip {
    const offered = offerFlights(searching(request), { ...REPORT, args: { flights } }, flights);
    const choice = last(offered);
    if (choice.kind !== "question") throw new Error("no choice");
    return answerQuestion(offered, choice.id, choice.options[0].value, choice.options[0].label);
  }

  it("asks the transit rules of the stop abroad for the actual passport and connection type, once", () => {
    const trip = chosen();
    expect(pendingTransitChecks(trip)).toEqual([{ nationality: "FR", city: "Doha", country_iso2: "QA", connection: "airside", layover_min: null, destination: "Bali" }]);
    const indian = chosen(FLIGHTS.map((f) => ({ ...f, self_transfer: true })), { ...REQUEST, nationality: "IN" });
    expect(pendingTransitChecks(indian)?.[0]).toMatchObject({ nationality: "IN", connection: "landside" });
    const direct = chosen(FLIGHTS.map((f) => ({ ...f, stops: 0, layovers: [] })));
    expect(pendingTransitChecks(direct)).toBeNull();
    expect(last(direct)).toMatchObject({ text: expect.not.stringContaining("transit") });
  });

  it("a Schengen stop for a French passport is settled without a search", () => {
    const trip = chosen(FLIGHTS.map((f) => ({ ...f, layovers: [{ airport: "Amsterdam", duration_min: 90 }] })));
    expect(knownTransitChecks(trip)).toMatchObject([{ city: "Amsterdam", status: "not_needed" }]);
  });

  it("records what was found and never calls the journey ready while a transit is unverified", () => {
    const trip = chosen();
    const check = { city: "Doha", country_iso2: "QA", country: "Qatar", connection: "airside" as const, layover_min: null, status: "needs_verification" as const, summary: "Transit in Doha: not found on an official site.", sources: [] };
    const recorded = recordTransitChecks(trip, [check]);
    expect(pendingTransitChecks(recorded)).toBeNull();
    expect(flightsResult(recorded.agent_run)?.transit).toEqual([check]);
    expect(last(recorded)).toMatchObject({ kind: "agent", text: "Transit in Doha: not found on an official site. I do not call this journey ready until that is verified." });
    expect(recorded.agent_steps.at(-1)).toBe("Checked the transit in Doha");
  });
});
