import { describe, expect, it } from "vitest";
import type { FlightOption } from "@/lib/contracts";
import type { ToolRequest } from "@/lib/h-agent";
import { flightsAnswered, offerFlights, startFlightsSession } from "@/lib/flights/flow";
import { UNMET_PREFERENCE_TEXTS } from "@/lib/journey/context";
import { answerQuestion, answerQuestionWithText, createTripFromRequest, decideProposal, pushProposal, type Trip } from "@/lib/trip-state";

const NOW = new Date("2026-11-08T10:00:00Z");
const REQUEST = {
  raw_text: "Je pars à Bali le 23 novembre pour dix jours",
  nationality: "FR", origin_country: "FR", origin: "Paris" as string | null, destination: "Bali", country_iso2: "ID",
  departure_date: "2026-11-23", arrival_at: "2026-11-24T18:00+08:00" as string | null, return_date: "2026-12-03" as string | null,
  purpose: "tourism", travellers: 2, status: "planning" as const,
};
const flight = (index: number, airline: string, price: number, depart_at: string): FlightOption => ({
  airline, price, currency: "EUR", stops: 1, duration_min: 1100, depart_at, arrive_at: "14:55+1", layovers: [{ airport: "Doha" }], index,
});
const FLIGHTS = [flight(1, "Qatar Airways", 912, "23:10"), flight(2, "Scoot", 646, "22:00"), flight(3, "Emirates", 980, "09:30"), flight(4, "KLM", 1030, "14:00")];
const REPORT: ToolRequest = { tool_name: "report_flights", args: { flights: FLIGHTS }, id: "call_1" };

const last = (trip: Trip) => trip.conversation.at(-1)!;
const agentTexts = (trip: Trip) => trip.conversation.filter((i) => i.kind === "agent").map((i) => (i as { text: string }).text);
const openProposal = (trip: Trip) => trip.conversation.find((i) => i.kind === "proposal" && i.action === "flights" && i.decision === null);

function proposed(request = REQUEST): Trip {
  return pushProposal(createTripFromRequest("t1", request, NOW), "flights", "Do you also want me to help you find your flights?", "Find my flight", "Not now");
}

// The flights accepted and the dates confirmed: the criterion question is open.
function atCriterion(request = REQUEST): Trip {
  const trip = decideProposal(proposed(request), last(proposed(request)).id, true, NOW);
  const dates = last(trip);
  if (dates.kind !== "question") throw new Error("no date question");
  return answerQuestion(trip, dates.id, dates.options[0].value, dates.options[0].label);
}

function searching(request = REQUEST): Trip {
  const trip = atCriterion(request);
  const criterion = last(trip);
  if (criterion.kind !== "question") throw new Error("no criterion question");
  const cheapest = criterion.options.find((o) => o.value === "cheapest")!;
  return startFlightsSession(answerQuestion(trip, criterion.id, cheapest.value, cheapest.label), "s-flights", "https://www.google.com/travel/flights?q=x", NOW);
}

describe("preferences in the flight list", () => {
  it("no night flights: the night departures are set aside, the cheapest day flights offered", () => {
    const trip = searching({ ...REQUEST, raw_text: "Je pars à Bali le 23 novembre, pas de vol de nuit" });
    expect(trip.preferences?.map((p) => p.kind)).toEqual(["avoid_night_flights"]);
    const offered = offerFlights(trip, REPORT, FLIGHTS);
    const choice = last(offered);
    if (choice.kind !== "question") throw new Error("no choice");
    expect(choice.options.map((o) => o.value)).toEqual(["3", "4"]);
    expect(agentTexts(offered)).not.toContain(UNMET_PREFERENCE_TEXTS.avoid_night_flights);
  });

  it("every flight at night: Nami says none avoids it and shows them anyway", () => {
    const trip = searching({ ...REQUEST, raw_text: "Bali le 23 novembre, no night flights" });
    const offered = offerFlights(trip, REPORT, FLIGHTS.slice(0, 2));
    expect(agentTexts(offered)).toContain(UNMET_PREFERENCE_TEXTS.avoid_night_flights);
    const choice = last(offered);
    expect(choice.kind === "question" && choice.options.map((o) => o.value)).toEqual(["2", "1"]);
  });

  it("without the preference the night flights stay in the list", () => {
    const choice = last(offerFlights(searching(), REPORT, FLIGHTS));
    expect(choice.kind === "question" && choice.options.map((o) => o.value)).toEqual(["2", "1", "3"]);
  });
});

describe("corrections heard during the flight questions", () => {
  it("at the criterion question: Toulouse replaces Paris, said back, the question comes again without a Sorry", () => {
    const trip = atCriterion();
    const criterion = last(trip);
    const next = answerQuestionWithText(trip, criterion.id, "en fait je pars de Toulouse", { ...REQUEST, origin: "Toulouse" });
    expect(next.request.origin).toBe("Toulouse");
    expect(agentTexts(next)).toContain("Noted: you leave from Toulouse, not Paris.");
    expect(agentTexts(next)).not.toContain("Sorry, I didn't catch that.");
    const again = last(next);
    expect(again.kind === "question" && again.field).toBe("flight_criterion");
    expect(openProposal(next)).toBeUndefined();
  });

  it("a criterion and a correction in one sentence: both count", () => {
    const trip = atCriterion();
    const next = answerQuestionWithText(trip, last(trip).id, "le moins cher, et je pars de Toulouse", { ...REQUEST, origin: "Toulouse" });
    expect(next.request.origin).toBe("Toulouse");
    expect(agentTexts(next)).toContain("Noted: you leave from Toulouse, not Paris.");
    expect(agentTexts(next).at(-1)).toBe("I'm searching your flights on Google Flights, watch the tab on the left.");
  });

  it("at the flight choice: the choice closes and the search is offered again from the new city", () => {
    const offered = offerFlights(searching(), REPORT, FLIGHTS);
    const choice = last(offered);
    const next = answerQuestionWithText(offered, choice.id, "non attends, je pars de Toulouse", { ...REQUEST, origin: "Toulouse" });
    const closed = next.conversation.find((i) => i.id === choice.id);
    expect(closed?.kind === "question" ? closed.answer : null).toBe("non attends, je pars de Toulouse");
    const proposal = openProposal(next);
    expect(proposal?.kind === "proposal" ? proposal.text : null).toBe("Shall I search your flights again from Toulouse, with these changes?");
    expect(flightsAnswered(next)).toBe(true);
  });

  it("the city the question asked is an answer, not a correction", () => {
    const trip = decideProposal(proposed({ ...REQUEST, origin: null }), last(proposed({ ...REQUEST, origin: null })).id, true, NOW);
    const origin = last(trip);
    expect(origin.kind === "question" && origin.field).toBe("origin");
    const next = answerQuestionWithText(trip, origin.id, "Toulouse", { ...REQUEST, origin: "Toulouse" });
    expect(next.request.origin).toBe("Toulouse");
    expect(agentTexts(next).some((t) => t.startsWith("Noted:"))).toBe(false);
  });
});
