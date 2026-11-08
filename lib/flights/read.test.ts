import { describe, expect, it } from "vitest";
import { FlightOptionSchema } from "@/lib/contracts";
import { enoughFlights, normalizeText, pageTextExpression, parseReportedFlights, readFlights, REREAD_FLIGHTS, RESULTS_LOADING, retryMessage, verifyAgainstPage } from "@/lib/flights/read";

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

  it("the page expression reads the body text and the aria-labels, one per line", () => {
    expect(pageTextExpression()).toContain("document.body.innerText");
    expect(pageTextExpression()).toContain("[aria-label]");
    expect(pageTextExpression()).toContain('replace(/\\s+/g, " ")');
  });

  it("reads the flights from the results list first, without any report", () => {
    const labels = [
      "From 642 euros round trip total. 1 stop flight with Etihad. Leaves Aéroport de Paris-Charles de Gaulle at 9:55 AM on Monday, November 23 and arrives at I Gusti Ngurah Rai International Airport at 11:35 AM on Tuesday, November 24. Total duration 18 hr 40 min.  Layover (1 of 1) is a 2 hr 35 min layover at Zayed International Airport in Abu Dhabi. Select flight",
      "From 827 euros round trip total. 1 stop flight with Qatar Airways. Leaves Aéroport de Paris-Charles de Gaulle at 10:00 PM on Monday, November 23 and arrives at I Gusti Ngurah Rai International Airport at 10:40 PM on Tuesday, November 24. Total duration 17 hr 40 min.  Layover (1 of 1) is a 1 hr 50 min layover at Hamad International Airport in Doha. Select flight",
    ].join("\n");
    const result = readFlights({}, `${PAGE}\n${labels}`);
    expect(result.source).toBe("page");
    expect(result.kept.map((f) => f.airline)).toEqual(["Etihad", "Qatar Airways"]);
    expect(enoughFlights(result)).toBe(true);
    // One row only on the page: the agent's report, verified, takes over.
    const one = readFlights({ flights: [SCOOT, QATAR, KLM] }, `${PAGE}\n${labels.split("\n")[0]}`);
    expect(one.source).toBe("agent");
    expect(one.kept).toHaveLength(3);
  });

  it("tells loading apart from an unreadable list", () => {
    const loading = readFlights({}, "Loading results\nFlight search\nParis\nBali");
    expect(loading.kept).toEqual([]);
    expect(loading.loading).toBe(true);
    expect(retryMessage(loading)).toBe(RESULTS_LOADING);
    const home = readFlights({}, "Explorer\nVols\nAtlanta\nà partir de 107 €");
    expect(home.loading).toBe(false);
    expect(retryMessage(home)).toBe(REREAD_FLIGHTS);
    expect(retryMessage(readFlights({ flights: [SCOOT] }, "Loading results\n13:50 Scoot 646 €"))).toBe(REREAD_FLIGHTS);
  });
});
