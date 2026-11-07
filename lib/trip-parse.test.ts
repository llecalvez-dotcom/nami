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
