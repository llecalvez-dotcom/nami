import { describe, expect, it } from "vitest";
import type { FlightOption } from "@/lib/contracts";
import type { ToolRequest } from "@/lib/h-agent";
import {
  applyFlightsChanges,
  FLIGHT_READY_PREFIX,
  FLIGHTS_SEARCHING_MESSAGE,
  flightCriterion,
  flightsResult,
  flightsStartBody,
  isChoiceQuestion,
  isCriterionQuestion,
  isFlightReadyMessage,
  longDate,
  matchCriterion,
  matchFlight,
  openFlightQuestion,
  offerFlights,
  pendingFlightChoice,
  startFlightsSession,
} from "@/lib/flights/flow";
import { agentOfficialUrl } from "@/lib/official-tab";
import { paperInFocus, readyPaper, agentChecklist } from "@/lib/panel-focus";
import { answerQuestion, answerQuestionWithText, applyAgentChanges, createTripFromRequest, decideProposal, needsPassportReconfirm, pushProposal, reportReady, stopAgent, type Trip } from "@/lib/trip-state";
import { spokenShort } from "@/lib/voice/conversation-speech";
import { matchOption } from "@/lib/voice/short-answers";

const NOW = new Date("2026-11-07T20:00:00Z");
const REQUEST = {
  raw_text: "Je pars à Bali le 23 novembre pour dix jours",
  nationality: "FR",
  origin_country: "FR",
  destination: "Bali",
  country_iso2: "ID",
  departure_date: "2026-11-23",
  arrival_at: "2026-11-24T18:00+08:00",
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
    expect(last(trip)).toMatchObject({ kind: "agent", text: "Okay, no flight search for now." });
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
    expect(matchOption("the best balance", criterion.options)?.value).toBe("best");
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
    expect(flightsStartBody(trip)).toEqual({ destination: "Bali", departure_date: "2026-11-23", return_date: "2026-12-03", travellers: 2, criterion: "fastest" });
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
    expect(matchCriterion("le moins cher et le plus rapide")).toBeNull();
  });

  it("longDate is deterministic and in English", () => {
    expect(longDate("2026-11-23")).toBe("Monday 23 November");
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
      "The cheapest first: Scoot, 646 €, 1 stop in Doha, 22 h 05, leaves at 13:50; then Qatar Airways, 912 €, 1 stop in Doha, 18 h 30, leaves at 13:50; then Emirates, 980 €, 1 stop in Doha, 19 h 40, leaves at 13:50: which one shall I open?",
    );
    expect(spokenShort(item.question)).toBe(item.question);
    expect(item.options.map((o) => o.value)).toEqual(["2", "1", "3"]);
    expect(item.options[0].label).toBe("The first: Scoot, 646 €, 1 stop in Doha, 22 h 05, leaves at 13:50");
    expect(matchOption("the second", item.options)?.value).toBe("1");
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
    expect(last(trip)).toMatchObject({ kind: "agent", text: "I'm opening Qatar Airways, 912 €, 1 stop in Doha, 18 h 30, leaves at 13:50, watch the tab on the left." });
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

  it("report_ready ends the run on the booking page with the final message, no proposal", () => {
    let trip = offerFlights(searching(), REPORT, FLIGHTS);
    const item = last(trip) as Extract<Trip["conversation"][number], { kind: "question" }>;
    trip = answerQuestion(trip, item.id, "2", item.options[0].label);
    trip = reportReady(trip, { tool_name: "report_ready", args: { summary: "Scoot 646 €", filled_fields: [] }, id: "call_2" }, []);
    expect(trip.agent_run).toMatchObject({ state: "interrupted", drained: true });
    const texts = agentTexts(trip);
    expect(texts.at(-1)).toBe(`${FLIGHT_READY_PREFIX}Scoot, 646 €, 1 stop in Doha, 22 h 05, leaves at 13:50, book it when you want, Nami never pays. Hotels are coming soon.`);
    expect(spokenShort(texts.at(-1)!)).toBe("Your flight is found: Scoot, 646 €, 1 stop in Doha, 22 h 05, leaves at 13:50, book it when you want, Nami never pays.");
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
