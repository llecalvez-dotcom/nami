import { describe, expect, it } from "vitest";
import type { HotelOption } from "@/lib/contracts";
import { buildHotelsTask, googleHotelsUrl, HotelsStartSchema } from "@/lib/hotels-agent";
import { answeredHotelCriterion, answerHotelQuestion, answerHotelQuestionWithText, hotelsAnswered, hotelsResult, hotelsStartBody, isHotelReadyMessage, matchHotel, matchHotelCriterion, offerHotels, pendingHotelChoice, reportHotelsReady, startHotelsFlow, startHotelsSession } from "@/lib/hotels/flow";
import { decideProposal, needsPassportReconfirm, pushProposal, type Trip } from "@/lib/trip-state";

const NOW = new Date("2026-11-08T10:00:00Z");
const HOTELS: HotelOption[] = [
  { index: 1, name: "Adiwana Dara Ayu", price: 47, currency: "EUR", rating: 4.3, reviews: 387, stars: 4 },
  { index: 2, name: "Serela Kuta Bali", price: 11, currency: "EUR", rating: 3.7, reviews: 991, stars: 3 },
  { index: 3, name: "Alila Ubud", price: 113, currency: "EUR", rating: 4.6, reviews: 1593, stars: 5 },
];
const CALL = { tool_name: "report_hotels", args: {}, id: "call-1" };

function baseTrip(): Trip {
  return {
    id: "t", sample: false, created_at: NOW.toISOString(), conversation: [], modules: [], formalities: [], agent_run: null, agent_steps: [],
    request: { raw_text: "Bali", destination: "Bali", country_iso2: "ID", nationality: "FR", origin_country: "FR", origin: "Paris", departure_date: "2026-11-23", return_date: "2026-12-03", arrival_at: null, purpose: "tourism", travellers: 1, status: "planning" },
  } as unknown as Trip;
}

type Question = Extract<Trip["conversation"][number], { kind: "question" }> & { field: "hotel_checkout" | "hotel_criterion" | "hotel_choice" };
const lastQuestion = (trip: Trip) => trip.conversation.findLast((i) => i.kind === "question") as Question;

function chooseCriterion(trip: Trip, value = "best", label = "Best compromise"): Trip {
  const asked = startHotelsFlow(trip);
  return answerHotelQuestion(asked, lastQuestion(asked), value, label);
}

function offered(): Trip {
  const answered = chooseCriterion(baseTrip());
  return offerHotels(startHotelsSession(answered, "s-1", "https://www.google.com/travel/search", NOW), CALL, HOTELS);
}

describe("the Google Hotels address", () => {
  it("carries the destination and the dates with their year, in euros and in English", () => {
    const url = new URL(googleHotelsUrl(HotelsStartSchema.parse({ destination: "Bali", checkin: "2026-11-23", checkout: "2026-12-03", local_session_id: "6e5f6051-e697-43ce-8763-4e9233e336bf" })));
    expect(url.pathname).toBe("/travel/search");
    expect(url.searchParams.get("q")).toBe("hotels in Bali from November 23 2026 to December 3 2026");
    expect(url.searchParams.get("curr")).toBe("EUR");
    expect(url.searchParams.get("hl")).toBe("en");
  });
});

describe("the agent's task", () => {
  const task = (criterion: "cheapest" | "best_rated" | "best") => buildHotelsTask(HotelsStartSchema.parse({ destination: "Bali", checkin: "2026-11-23", checkout: "2026-12-03", criterion, local_session_id: "6e5f6051-e697-43ce-8763-4e9233e336bf" }));

  it("sorts the page by what the traveller asked, so the page answers it", () => {
    expect(task("cheapest")).toContain('"Lowest price"');
    expect(task("best_rated")).toContain('"Highest rating"');
    expect(task("best")).toContain('"Most reviewed"');
    expect(task("cheapest")).toContain("call report_hotels");
  });
});

describe("the hotel conversation", () => {
  it("asks the criterion once, and a new search after a failure asks nothing", () => {
    const answered = chooseCriterion(baseTrip(), "cheapest", "The cheapest");
    expect(answeredHotelCriterion(answered)).toBe("cheapest");
    expect(hotelsAnswered(answered)).toBe(true);
    expect(startHotelsFlow(answered).conversation.at(-1)).toMatchObject({ kind: "agent" });
  });

  it("understands the criterion in the traveller's words", () => {
    expect(matchHotelCriterion("le moins cher")).toBe("cheapest");
    expect(matchHotelCriterion("le mieux noté")).toBe("best_rated");
    expect(matchHotelCriterion("the best rated one")).toBe("best_rated");
    expect(matchHotelCriterion("le moins cher et le mieux noté")).toBe("best");
    expect(matchHotelCriterion("un bon compromis")).toBe("best");
    expect(matchHotelCriterion("je ne sais pas")).toBeNull();
  });

  it("proposes three hotels at most, ranked, and names the one chosen by position or by name", () => {
    const trip = offered();
    const choice = lastQuestion(trip);
    expect(choice.field).toBe("hotel_choice");
    expect(choice.options).toHaveLength(3);
    expect(choice.options[0].label).toBe("Adiwana Dara Ayu · 47 € a night · 4.3/5 · 4-star");
    expect(matchHotel("le deuxième", hotelsResult(trip.agent_run)!.options)?.index).toBe(hotelsResult(trip.agent_run)!.options[1].index);
    expect(matchHotel("Alila", HOTELS)?.name).toBe("Alila Ubud");
    expect(matchHotel("n'importe", HOTELS)).toBeNull();
  });

  it("sends the choice to the agent waiting on report_hotels", () => {
    const trip = offered();
    const chosen = answerHotelQuestionWithText(trip, lastQuestion(trip), "Alila", trip.request);
    expect(pendingHotelChoice(chosen)).toMatchObject({ tool_req: { id: "call-1" }, hotel: { name: "Alila Ubud" } });
  });

  it("ends on the hotel found, nothing booked, and never asks for the passport again", () => {
    const trip = offered();
    const chosen = answerHotelQuestion(trip, lastQuestion(trip), "3", "Alila");
    const ready = reportHotelsReady(chosen, { tool_name: "report_ready", args: { summary: "ok" }, id: "call-2" }, []);
    const last = ready.conversation.at(-1);
    expect(last?.kind === "agent" && isHotelReadyMessage(last.text)).toBe(true);
    expect(ready.agent_run).toMatchObject({ state: "interrupted", drained: true });
    expect(needsPassportReconfirm(ready.agent_run, false)).toBe(false);
  });

  it("takes the stay from the trip's dates", () => {
    expect(hotelsStartBody(chooseCriterion(baseTrip()))).toEqual({ destination: "Bali", checkin: "2026-11-23", checkout: "2026-12-03", criterion: "best" });
  });

  it("goes on after a refusal: no visa, then the flights; no flight, then the hotel", () => {
    const visa = pushProposal(baseTrip(), "create_visa", "Shall I fill in your visa?", "Yes", "Not now");
    const noVisa = decideProposal(visa, visa.conversation.at(-1)!.id, false, NOW);
    expect(noVisa.conversation.at(-1)).toMatchObject({ kind: "proposal", action: "flights", decision: null });
    const noFlight = decideProposal(noVisa, noVisa.conversation.at(-1)!.id, false, NOW);
    expect(noFlight.conversation.at(-1)).toMatchObject({ kind: "proposal", action: "hotels", decision: null });
    const noHotel = decideProposal(noFlight, noFlight.conversation.at(-1)!.id, false, NOW);
    expect(noHotel.conversation.at(-1)).toMatchObject({ kind: "agent" });
  });

  it("asks when the traveller leaves the hotel if the return date is unknown, then the criterion", () => {
    const noReturn = { ...baseTrip(), request: { ...baseTrip().request, return_date: null } } as Trip;
    const proposed = pushProposal(noReturn, "hotels", "A hotel?", "Find my hotel", "Not now");
    const asked = decideProposal(proposed, proposed.conversation.at(-1)!.id, true, NOW);
    const checkout = lastQuestion(asked) as unknown as Question;
    expect(checkout.field).toBe("hotel_checkout");
    expect(hotelsStartBody(asked)).toBeNull();
    const answered = answerHotelQuestion(asked, checkout, checkout.options[0].value, checkout.options[0].label);
    expect(answered.request.return_date).toBe("2026-11-30");
    expect(lastQuestion(answered).field).toBe("hotel_criterion");
    expect(hotelsStartBody(answered)).toMatchObject({ checkin: "2026-11-23", checkout: "2026-11-30" });
  });

  it("understands a spoken date for the hotel, and asks again when it does not", () => {
    const noReturn = { ...baseTrip(), request: { ...baseTrip().request, return_date: null } } as Trip;
    const asked = startHotelsFlow(noReturn);
    const item = lastQuestion(asked);
    const understood = answerHotelQuestionWithText(asked, item, "le 2 décembre", { ...noReturn.request, return_date: "2026-12-02" });
    expect(understood.request.return_date).toBe("2026-12-02");
    expect(lastQuestion(understood).field).toBe("hotel_criterion");
    expect(lastQuestion(answerHotelQuestionWithText(asked, item, "euh", noReturn.request)).field).toBe("hotel_checkout");
  });

  it("starts from the proposal", () => {
    const proposed = pushProposal(baseTrip(), "hotels", "Do you also want me to find you a hotel?", "Find my hotel", "Not now");
    const accepted = decideProposal(proposed, proposed.conversation.at(-1)!.id, true, NOW);
    expect(accepted.conversation.at(-1)).toMatchObject({ kind: "question", field: "hotel_criterion" });
  });
});
