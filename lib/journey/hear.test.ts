import { describe, expect, it } from "vitest";
import type { TripRequestDraft } from "@/lib/contracts";
import { answerQuestionWithText, createTripFromRequest, hearFreeText, NOTHING_HEARD_MESSAGE, type Trip } from "@/lib/trip-state";

const NOW = new Date("2026-11-08T10:00:00Z");
const request: TripRequestDraft = {
  raw_text: "Je pars de Lyon pour Bali le 1er décembre, retour le 15", nationality: "FR", origin_country: "FR", origin: "Lyon", destination: "Bali",
  country_iso2: "ID", departure_date: "2026-12-01", arrival_at: null, return_date: "2026-12-15", purpose: "tourism", travellers: 1, status: null,
};
const texts = (trip: Trip) => trip.conversation.map((i) => ("text" in i ? i.text : "question" in i ? i.question : "")).filter(Boolean);
const flightsDone = (trip: Trip): Trip => ({
  ...trip,
  agent_run: { kind: "flights", session_id: "s1", state: "completed", started_at: NOW.toISOString() } as unknown as Trip["agent_run"],
});

describe("corrections and preferences heard in any sentence", () => {
  it("the first request already carries the preferences", () => {
    const trip = createTripFromRequest("t1", { ...request, raw_text: "Je pars de Lyon pour Bali, et pas de vol de nuit" }, NOW);
    expect(trip.preferences?.map((p) => p.kind)).toEqual(["avoid_night_flights"]);
    expect(createTripFromRequest("t2", request, NOW).preferences).toBeUndefined();
  });

  it("said while nothing is asked: Toulouse replaces Lyon, said back, nothing searched again when no search was made", () => {
    const trip = createTripFromRequest("t1", request, NOW);
    const heard = hearFreeText(trip, "en fait je pars de Toulouse", { ...request, origin: "Toulouse" });
    expect(heard.request.origin).toBe("Toulouse");
    expect(texts(heard)).toContain("Noted: you leave from Toulouse, not Lyon.");
    expect(heard.conversation.some((i) => i.kind === "proposal" && i.action === "flights" && i.decision === null)).toBe(false);
  });

  it("a preference said in passing is noted once, the request untouched", () => {
    const trip = createTripFromRequest("t1", request, NOW);
    const once = hearFreeText(trip, "au fait, je préfère éviter les vols de nuit", request);
    expect(once.preferences?.map((p) => p.kind)).toEqual(["avoid_night_flights"]);
    expect(texts(once)).toContain("Noted, no night flights: I keep them out of the flights I show you.");
    const twice = hearFreeText(once, "pas de vol de nuit hein", request);
    expect(texts(twice).filter((t) => t.startsWith("Noted, no night flights"))).toHaveLength(1);
    expect(texts(twice).at(-1)).toBe(NOTHING_HEARD_MESSAGE);
  });

  it("nothing new in the sentence: Nami says so, forgets nothing", () => {
    const trip = createTripFromRequest("t1", request, NOW);
    const heard = hearFreeText(trip, "euh d'accord", { ...request, origin: null, return_date: null });
    expect(heard.request.origin).toBe("Lyon");
    expect(heard.request.return_date).toBe("2026-12-15");
    expect(texts(heard).at(-1)).toBe(NOTHING_HEARD_MESSAGE);
  });

  it("after a flight search, a changed city offers the search again from the new city", () => {
    const trip = flightsDone(createTripFromRequest("t1", request, NOW));
    const heard = hearFreeText(trip, "non, Toulouse, pas Lyon", { ...request, origin: "Toulouse" });
    const proposal = heard.conversation.find((i) => i.kind === "proposal" && i.action === "flights" && i.decision === null);
    expect(proposal && "text" in proposal ? proposal.text : null).toBe("Shall I search your flights again from Toulouse, with these changes?");
  });

  it("a correction inside an answer is applied, said, and the question still answered", () => {
    const trip = createTripFromRequest("t1", { ...request, travellers: null }, NOW);
    const open = trip.conversation.find((i) => i.kind === "question" && i.answer === null);
    if (!open || open.kind !== "question") throw new Error("no open question");
    expect(open.field).toBe("travellers");
    const next = answerQuestionWithText(trip, open.id, "deux, et je pars de Toulouse en fait", { ...request, travellers: 2, origin: "Toulouse" });
    expect(next.request.origin).toBe("Toulouse");
    expect(next.request.travellers).toBe(2);
    expect(texts(next)).toContain("Noted: you leave from Toulouse, not Lyon.");
    const answered = next.conversation.find((i) => i.id === open.id);
    expect(answered && answered.kind === "question" ? answered.answer : null).toBe("deux, et je pars de Toulouse en fait");
  });
});
