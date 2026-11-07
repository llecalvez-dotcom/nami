import { describe, expect, it } from "vitest";
import { FlightOptionSchema } from "@/lib/contracts";
import { enoughFlights, normalizeText, pageTextExpression, parseReportedFlights, readFlights, verifyAgainstPage } from "@/lib/flights/read";

const SCOOT = { index: 1, airline: "Scoot", price: 646, currency: "EUR", stops: 1, duration_min: 1325, depart_at: "13:50", arrive_at: "14:55+1", layovers: [{ airport: "Singapour", duration_min: 150 }] };
const QATAR = { index: 2, airline: "Qatar Airways", price: 912, currency: "EUR", stops: 1, duration_min: 1110, depart_at: "21:35", arrive_at: "22:05+1", layovers: [{ airport: "Doha" }] };
const KLM = { index: 3, airline: "KLM, Garuda Indonesia", price: 1030, currency: "EUR", stops: 2, duration_min: 1110, depart_at: "06:10", arrive_at: "08:40+1", layovers: [] };

const PAGE = [
  "Meilleurs vols au départ de Paris vers Denpasar",
  "13:50 – 14:55+1 Scoot 22 h 05 1 escale Singapour 2 h 30 646 € aller-retour",
  "21:35 – 22:05+1 Qatar Airways 18 h 30 1 escale Doha 912 € aller-retour",
  "06:10 – 08:40+1 KLM, Garuda Indonesia 18 h 30 2 escales 1 030 € aller-retour",
  "Tout refuser",
].join("\n");

describe("FlightOptionSchema", () => {
  it("accepts a flight read on the page", () => {
    expect(FlightOptionSchema.safeParse(SCOOT).success).toBe(true);
    expect(FlightOptionSchema.parse({ ...QATAR, layovers: undefined }).layovers).toEqual([]);
  });

  it.each([
    ["a text price", { ...SCOOT, price: "646 €" }],
    ["a negative duration", { ...SCOOT, duration_min: -5 }],
    ["a zero duration", { ...SCOOT, duration_min: 0 }],
    ["a missing index", { ...SCOOT, index: undefined }],
    ["a negative price", { ...SCOOT, price: -1 }],
    ["an empty airline", { ...SCOOT, airline: " " }],
  ])("refuses %s", (_, raw) => {
    expect(FlightOptionSchema.safeParse(raw).success).toBe(false);
  });
});

describe("parseReportedFlights", () => {
  it("keeps the valid flights, counts the invalid ones, one flight per position", () => {
    const parsed = parseReportedFlights({ flights: [SCOOT, { ...QATAR, price: "912" }, KLM, { ...KLM, airline: "Twice" }] });
    expect(parsed.flights.map((f) => f.index)).toEqual([1, 3]);
    expect(parsed.invalid).toBe(1);
  });

  it("returns nothing for a malformed call", () => {
    expect(parseReportedFlights(null)).toEqual({ flights: [], invalid: 0 });
    expect(parseReportedFlights({ flights: "Scoot" })).toEqual({ flights: [], invalid: 0 });
  });
});

describe("verifyAgainstPage", () => {
  it("keeps the flights whose airline and price are on the page", () => {
    const result = readFlights({ flights: [SCOOT, QATAR, KLM] }, PAGE);
    expect(result.kept.map((f) => f.index)).toEqual([1, 2, 3]);
    expect(result.dropped).toBe(0);
    expect(enoughFlights(result)).toBe(true);
  });

  it("drops a flight whose price is not on the page, even if the airline is", () => {
    const result = verifyAgainstPage([FlightOptionSchema.parse({ ...SCOOT, price: 599 })], PAGE);
    expect(result.kept).toEqual([]);
    expect(result.dropped).toBe(1);
  });

  it("drops a flight whose airline is not on the page, even if the price is", () => {
    const result = verifyAgainstPage([FlightOptionSchema.parse({ ...SCOOT, airline: "Air Nami" })], PAGE);
    expect(result.kept).toEqual([]);
  });

  it("does not match a price inside a longer number", () => {
    expect(verifyAgainstPage([FlightOptionSchema.parse({ ...SCOOT, price: 46 })], "Scoot 646 €").kept).toEqual([]);
    expect(verifyAgainstPage([FlightOptionSchema.parse({ ...SCOOT, price: 646 })], "Scoot 1646 €").kept).toEqual([]);
  });

  it("reads grouped prices, narrow spaces, accents and aria-labels", () => {
    const page = "Vol avec KLM et Garuda Indonesia\n1\u202f030\u00a0€ aller-retour\nQatar Airways €912";
    expect(verifyAgainstPage([FlightOptionSchema.parse(KLM), FlightOptionSchema.parse(QATAR)], page).kept).toHaveLength(2);
    expect(normalizeText("Singapour  \u00a0€")).toBe("singapour €");
  });

  it("asks for a reread when fewer than two flights survive", () => {
    const result = readFlights({ flights: [SCOOT, { ...QATAR, price: 1 }, { ...KLM, airline: "Nope" }] }, PAGE);
    expect(result.kept.map((f) => f.index)).toEqual([1]);
    expect(result.dropped).toBe(2);
    expect(enoughFlights(result)).toBe(false);
  });

  it("the page expression reads the body text and the aria-labels", () => {
    expect(pageTextExpression()).toContain("document.body.innerText");
    expect(pageTextExpression()).toContain("[aria-label]");
  });
});
