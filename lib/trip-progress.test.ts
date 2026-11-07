import { describe, expect, it } from "vitest";
import { answerQuestion, createSampleTrip, decideProposal, type Trip } from "@/lib/trip-state";
import { homeCountry, homePassport, mapCountries, progressRatio, tripStatus, visaSteps } from "@/lib/trip-progress";

const now = new Date("2026-11-08T12:52:00Z");

function open(trip: Trip, kind: "question" | "proposal") {
  const item = trip.conversation.findLast((i) => i.kind === kind);
  if (!item) throw new Error(`no ${kind}`);
  return item;
}

function sampleWithPapers(): Trip {
  let trip = createSampleTrip(now);
  const landing = open(trip, "question");
  trip = answerQuestion(trip, landing.id, "2026-11-10T14:30+08:00", "Tue 10 Nov, 14:30");
  return decideProposal(trip, open(trip, "proposal").id, true, now);
}

describe("trip progress", () => {
  it("a fresh sample trip is planned, waiting on its details", () => {
    const trip = createSampleTrip(now);
    expect(tripStatus(trip)).toBe("planned");
    expect(visaSteps(trip).map((s) => s.state)).toEqual(["current", "todo", "todo", "todo", "todo"]);
    expect(progressRatio(trip)).toBe(0);
  });

  it("accepted papers put the visa in progress, the agent step comes next", () => {
    const trip = sampleWithPapers();
    expect(tripStatus(trip)).toBe("in_progress");
    expect(visaSteps(trip).map((s) => s.state)).toEqual(["done", "done", "current", "todo", "todo"]);
  });

  it("a running agent is the current step", () => {
    let trip = sampleWithPapers();
    trip = decideProposal(trip, open(trip, "proposal").id, true, now);
    const agent = visaSteps(trip).find((s) => s.id === "agent")!;
    expect(agent.state).toBe("current");
    expect(agent.detail).toBe("Agent awaiting tool results");
  });

  it("all confirmed papers make the trip ready", () => {
    const trip = sampleWithPapers();
    const confirmed = { ...trip, formalities: trip.formalities.map((f) => ({ ...f, status: "confirmed" as const })) };
    expect(tripStatus(confirmed)).toBe("ready");
    expect(visaSteps(confirmed).find((s) => s.id === "ready")!.state).toBe("done");
  });
});

describe("map countries", () => {
  it("home wins over everything, then the visa in progress, then the wishlist", () => {
    const trip = sampleWithPapers();
    const map = mapCountries([trip], ["ID", "JP", "FR"], homeCountry([trip]));
    expect(map.FR.status).toBe("home");
    expect(map.ID.status).toBe("in_progress");
    expect(map.ID.trips).toHaveLength(1);
    expect(map.JP.status).toBe("wish");
  });

  it("home falls back to France without trips", () => {
    expect(homeCountry([])).toBe("FR");
  });
  it("ignores the sample trip when choosing home if real trips exist", () => {
    const sample = { sample: true, request: { origin_country: "FR", nationality: "FR" } } as never;
    const real = { sample: false, request: { origin_country: "BE", nationality: "BE" } } as never;
    expect(homeCountry([sample, real])).toBe("BE");
    expect(homeCountry([sample])).toBe("FR");
  });
  it("keeps the passport separate from the home country", () => {
    const trip = { sample: false, request: { origin_country: "DE", nationality: "FR" } } as never;
    expect(homeCountry([trip])).toBe("DE");
    expect(homePassport([trip], "DE")).toBe("FR");
    expect(homePassport([], "DE")).toBeNull();
  });
});
