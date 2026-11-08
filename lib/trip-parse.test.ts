import { describe, expect, it } from "vitest";
import { TripRequestDraftSchema } from "@/lib/contracts";
import { MODEL_OUTPUT_JSON_SCHEMA, parseTrip } from "@/lib/trip-parse";

describe("schema sent to the H model", () => {
  it("lists every field of the request, with types only: no date regex for the constrained decoding", () => {
    const fields = Object.keys(TripRequestDraftSchema.omit({ raw_text: true, status: true }).shape).sort();
    expect(Object.keys(MODEL_OUTPUT_JSON_SCHEMA.properties).sort()).toEqual(fields);
    expect([...MODEL_OUTPUT_JSON_SCHEMA.required].sort()).toEqual(fields);
    expect(JSON.stringify(MODEL_OUTPUT_JSON_SCHEMA)).not.toMatch(/pattern|format/);
  });

  it("still checks the model's answer: a malformed date is refused", async () => {
    const answer = {
      nationality: null,
      origin_country: null,
      destination: "Bali",
      country_iso2: "ID",
      departure_date: "next monday",
      arrival_at: null,
      return_date: null,
      purpose: "tourism",
      travellers: 1,
    };
    await expect(parseTrip({ transcript: "Bali lundi", today: "2026-11-07" }, async () => JSON.stringify(answer))).rejects.toThrow();
  });
});

describe("landing time", () => {
  const model = (arrival_at: string | null) => async () => JSON.stringify({
    nationality: "FR", origin_country: "FR", destination: "Bali", country_iso2: "ID",
    departure_date: "2026-11-09", arrival_at, return_date: null, purpose: "tourism", travellers: 1,
  });

  it("keeps a landing time given spontaneously in the first sentence, and never asks for it", async () => {
    const { request, missing } = await parseTrip({ transcript: "Je pars à Bali lundi, j'atterris mardi à 18 h", today: "2026-11-07" }, model("2026-11-10T18:00+08:00"));
    expect(request.arrival_at).toBe("2026-11-10T18:00+08:00");
    expect(missing).toEqual([]);
  });

  it("drops a landing time the model invented when no time of day was said; the request stays complete", async () => {
    const { request, missing } = await parseTrip({ transcript: "Je pars à Bali lundi", today: "2026-11-07" }, model("2026-11-10T00:00+08:00"));
    expect(request.arrival_at).toBeNull();
    expect(missing).toEqual([]);
  });
});
