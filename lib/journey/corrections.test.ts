import { describe, expect, it } from "vitest";
import type { TripRequestDraft } from "@/lib/contracts";
import { affectedSearches, changeSentence, requestChanges } from "@/lib/journey/corrections";

const base: TripRequestDraft = {
  raw_text: "x", nationality: null, origin_country: "FR", origin: "Lyon", destination: "Bali", country_iso2: "ID",
  departure_date: "2026-12-01", arrival_at: null, return_date: "2026-12-15", purpose: "tourism", travellers: 1, status: null,
};

describe("corrections heard in any sentence", () => {
  it("Toulouse, not Lyon: one change, said back, flights touched", () => {
    const changes = requestChanges(base, { ...base, origin: "Toulouse" });
    expect(changes).toEqual([{ field: "origin", from: "Lyon", to: "Toulouse" }]);
    expect(changeSentence(changes)).toBe("Noted: you leave from Toulouse, not Lyon.");
    expect(affectedSearches(changes)).toEqual(["flights"]);
  });

  it("the field the question asked is an answer, not a correction", () => {
    expect(requestChanges(base, { ...base, origin: "Toulouse" }, "origin")).toEqual([]);
  });

  it("a field the model emptied is not a change", () => {
    expect(requestChanges(base, { ...base, origin: null, return_date: null })).toEqual([]);
    expect(changeSentence([])).toBeNull();
  });

  it("dates, destination, travellers and passport, each with its searches", () => {
    const changes = requestChanges(base, { ...base, departure_date: "2026-12-03", return_date: "2026-12-17", travellers: 2, nationality: "IN" });
    expect(changeSentence(changes)).toBe(
      "Noted: you leave on 3 December, not 1 December; you come back on 17 December, not 15 December; 2 travellers, not 1; your passport is India.",
    );
    expect(affectedSearches(changes)).toEqual(["flights", "hotels", "papers"]);
    expect(affectedSearches(requestChanges(base, { ...base, nationality: "IN" }))).toEqual(["papers"]);
    expect(changeSentence(requestChanges(base, { ...base, destination: "Lombok" }))).toBe("Noted: you go to Lombok, not Bali.");
  });

  it("a first value is said without a 'not'", () => {
    expect(changeSentence(requestChanges({ ...base, origin: null }, { ...base, origin: "Toulouse" }))).toBe("Noted: you leave from Toulouse.");
  });
});
