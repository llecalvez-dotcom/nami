import { describe, expect, it } from "vitest";
import { BALI_PAPERS } from "@/lib/bali-papers";
import { TripRequestDraftSchema, TripRequestSchema, type TripRequest, type TripRequestDraft } from "@/lib/contracts";
import {
  defaultBaliArrival,
  formalityWindows,
  isWindowOpen,
  nextQuestion,
  ONE_FILE_AT_A_TIME,
  suggestModules,
} from "@/lib/planner";

const HOUR_MS = 3_600_000;

function draft(fields: Partial<TripRequestDraft>): TripRequestDraft {
  return TripRequestDraftSchema.parse({ raw_text: "test", ...fields });
}

const complete: TripRequest = {
  raw_text: "test",
  nationality: "FR",
  origin_country: "FR",
  destination: "Bali",
  country_iso2: "ID",
  departure_date: "2026-11-09",
  arrival_at: "2026-11-10T14:30+08:00",
  return_date: null,
  purpose: "tourism",
  travellers: 1,
  status: "planning",
};

function papers(request: Partial<TripRequest>) {
  return suggestModules({ ...complete, ...request }).find((s) => s.module === "papers");
}

describe("nextQuestion", () => {
  it("accepts a draft without country_iso2, refuses a complete request without it", () => {
    expect(TripRequestDraftSchema.safeParse({ raw_text: "Bali" }).success).toBe(true);
    expect(TripRequestSchema.safeParse({ ...complete, country_iso2: null }).success).toBe(false);
  });

  it("asks for what is missing in order, then suggests papers (\"Je pars à Bali lundi\")", () => {
    let request = draft({
      raw_text: "Je pars à Bali lundi",
      origin_country: "FR",
      destination: "Bali",
      country_iso2: "ID",
      departure_date: "2026-11-09",
      travellers: 1,
    });
    const asked: string[] = [];
    const answers: Partial<TripRequestDraft> = {
      nationality: "FR",
      arrival_at: "2026-11-10T14:30+08:00",
      purpose: "tourism",
    };
    for (let q = nextQuestion(request); q !== null; q = nextQuestion(request)) {
      asked.push(q.question);
      request = { ...request, [q.field]: answers[q.field as keyof typeof answers] };
    }
    expect(asked).toEqual([
      "Do you travel with a French passport?",
      "You leave on Monday 9 November: from France you land in Bali the next day, Tuesday 10 November, around 6 pm. Is that right? If you know your landing time, just tell me.",
      "What is the purpose of your trip?",
    ]);
    expect(suggestModules(TripRequestSchema.parse(request))).toEqual([
      expect.objectContaining({ module: "papers", state: "suggested" }),
      expect.objectContaining({ module: "flights", state: "suggested" }),
      expect.objectContaining({ module: "hotel", state: "soon" }),
    ]);
  });

  it("follows the full order on an empty draft", () => {
    expect(nextQuestion(draft({}))?.field).toBe("destination");
    expect(nextQuestion(draft({ destination: "Bali" }))?.field).toBe("nationality");
    expect(nextQuestion(draft({ destination: "Bali", nationality: "FR" }))?.field).toBe("origin_country");
    expect(nextQuestion({ ...complete, travellers: null })?.question).toBe("How many of you are travelling?");
    expect(nextQuestion(complete)).toBeNull();
  });
});

describe("suggestModules", () => {
  it("suggests papers for a French passport from France to Bali", () => {
    expect(papers({})?.state).toBe("suggested");
    expect(papers({ destination: "Ubud" })?.state).toBe("suggested");
  });

  it.each([
    ["Barcelona", "ES"],
    ["Geneva", "CH"],
    ["Oslo", "NO"],
  ])("needs nothing for %s", (destination, country_iso2) => {
    const suggestion = papers({ destination, country_iso2 });
    expect(suggestion?.state).toBe("none_needed");
    expect(suggestion?.message).toContain("No visa needed for a French passport");
  });

  it.each<[string, Partial<TripRequest>]>([
    ["Jakarta", { destination: "Jakarta", country_iso2: "ID" }],
    ["Lombok", { destination: "Lombok", country_iso2: "ID" }],
    ["a business trip to Tanzania", { destination: "Tanzania", country_iso2: "TZ", purpose: "business" }],
    ["a departure from Brussels to Bali", { origin_country: "BE" }],
    ["a non-French passport", { nationality: "BE" }],
  ])("is not supported yet for %s, and the request is kept", (_, request) => {
    const suggestion = papers(request);
    expect(suggestion?.state).toBe("not_supported_yet");
    expect(suggestion?.message).toContain("is saved");
    expect(suggestion?.message).toContain("Bali is the first");
  });

  it("prepares one file at a time for two travellers", () => {
    const suggestion = papers({ travellers: 2 });
    expect(suggestion?.state).toBe("suggested");
    expect(suggestion?.message).toContain(ONE_FILE_AT_A_TIME);
    expect(papers({})?.message).not.toContain(ONE_FILE_AT_A_TIME);
  });
});

describe("formalityWindows", () => {
  const arrivalCard = BALI_PAPERS.find((p) => p.id === "arrival_card")!;

  it("opens the arrival card 72 h before landing, in Bali time", () => {
    const [evoa, card, levy] = formalityWindows(complete, BALI_PAPERS);
    expect(card).toEqual({ id: "arrival_card", opens_at: "2026-11-07T14:30+08:00", closes_at: "2026-11-10T14:30+08:00" });
    expect(evoa).toEqual({ id: "evoa", opens_at: null, closes_at: null });
    expect(levy).toEqual({ id: "bali_levy", opens_at: null, closes_at: null });
  });

  it("is closed one hour before opening, open at opening", () => {
    const [window] = formalityWindows(complete, [arrivalCard]);
    const opensMs = Date.parse(window.opens_at!);
    expect(isWindowOpen(window, new Date(opensMs - HOUR_MS))).toBe(false);
    expect(isWindowOpen(window, new Date(opensMs))).toBe(true);
    expect(isWindowOpen(window, new Date(Date.parse(complete.arrival_at) + HOUR_MS))).toBe(false);
  });

  it("handles the day change between Paris and Bali", () => {
    const [window] = formalityWindows({ arrival_at: "2026-11-10T05:00+08:00" }, [arrivalCard]);
    expect(window.opens_at).toBe("2026-11-07T05:00+08:00");
    // 05:00 in Bali on the 7th is still the 6th in Paris (22:00).
    expect(isWindowOpen(window, new Date("2026-11-06T21:59:00+01:00"))).toBe(false);
    expect(isWindowOpen(window, new Date("2026-11-06T22:00:00+01:00"))).toBe(true);
  });

  it("converts any offset to Bali time", () => {
    const [window] = formalityWindows({ arrival_at: "2026-11-09T20:00:00Z" }, [arrivalCard]);
    expect(window.closes_at).toBe("2026-11-10T04:00+08:00");
    expect(window.opens_at).toBe("2026-11-07T04:00+08:00");
  });

  it("defaults an unknown landing time to 00:00 Bali time", () => {
    expect(defaultBaliArrival("2026-11-10")).toBe("2026-11-10T00:00+08:00");
    expect(TripRequestSchema.safeParse({ ...complete, arrival_at: defaultBaliArrival("2026-11-10") }).success).toBe(true);
  });
});
