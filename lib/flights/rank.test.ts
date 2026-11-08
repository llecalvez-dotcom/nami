import { describe, expect, it } from "vitest";
import type { FlightOption } from "@/lib/contracts";
import { describeFlight, flightLabel, formatDuration, hasDirectFlight, introduceFlights, rankFlights } from "@/lib/flights/rank";

const flight = (index: number, over: Partial<FlightOption>): FlightOption => ({
  airline: `Airline ${index}`,
  price: 800,
  currency: "EUR",
  stops: 1,
  duration_min: 1000,
  depart_at: "10:00",
  arrive_at: "08:00+1",
  layovers: [],
  index,
  ...over,
});

// Six flights, no direct one, two with the same price, two with the same duration.
const FLIGHTS: FlightOption[] = [
  flight(1, { airline: "Scoot", price: 646, stops: 1, duration_min: 1325, layovers: [{ airport: "Singapore", duration_min: 150 }] }),
  flight(2, { airline: "Qatar Airways", price: 912, stops: 1, duration_min: 1110, layovers: [{ airport: "Doha" }] }),
  flight(3, { airline: "Emirates", price: 912, stops: 1, duration_min: 1180, layovers: [{ airport: "Dubai" }] }),
  flight(4, { airline: "KLM, Garuda", price: 1030, stops: 2, duration_min: 1110, layovers: [{ airport: "Amsterdam" }, { airport: "Jakarta" }] }),
  flight(5, { airline: "Turkish Airlines", price: 780, stops: 1, duration_min: 1240, layovers: [{ airport: "Istanbul" }] }),
  flight(6, { airline: "China Southern", price: 590, stops: 2, duration_min: 1600, layovers: [{ airport: "Guangzhou" }, { airport: "Shenzhen" }] }),
];

const indexes = (list: FlightOption[]) => list.map((f) => f.index);

describe("rankFlights", () => {
  it("returns at most three flights", () => {
    expect(rankFlights(FLIGHTS, "cheapest")).toHaveLength(3);
    expect(rankFlights(FLIGHTS.slice(0, 2), "cheapest")).toHaveLength(2);
    expect(rankFlights([], "best")).toEqual([]);
  });

  it("cheapest: price, then duration for equal prices", () => {
    expect(indexes(rankFlights(FLIGHTS, "cheapest"))).toEqual([6, 1, 5]);
    expect(indexes(rankFlights(FLIGHTS.filter((f) => f.price >= 900), "cheapest"))).toEqual([2, 3, 4]);
  });

  it("fastest: duration, then price for equal durations", () => {
    expect(indexes(rankFlights(FLIGHTS, "fastest"))).toEqual([2, 4, 3]);
  });

  it("fewest_stops: stops, then price, and says when nothing is direct", () => {
    expect(indexes(rankFlights(FLIGHTS, "fewest_stops"))).toEqual([1, 5, 2]);
    expect(hasDirectFlight(FLIGHTS)).toBe(false);
    expect(introduceFlights("fewest_stops", FLIGHTS)).toBe("No direct flight on those days, here are the flights with the fewest stops.");
    const withDirect = [...FLIGHTS, flight(7, { airline: "Direct Air", price: 1500, stops: 0, duration_min: 900 })];
    expect(indexes(rankFlights(withDirect, "fewest_stops"))[0]).toBe(7);
    expect(introduceFlights("fewest_stops", withDirect)).toBe("No stop if possible first.");
  });

  it("best: weighs price 0.5, duration 0.3, stops 0.2 on normalised values", () => {
    // Scoot: cheap, one stop, average duration; Qatar: fastest, one stop; Turkish: in between. China Southern is cheapest
    // but longest with two stops, KLM is fast but dear with two stops.
    expect(indexes(rankFlights(FLIGHTS, "best"))).toEqual([1, 5, 2]);
    expect(introduceFlights("best", FLIGHTS)).toBe("Best compromise first.");
  });

  it("is pure and does not reorder the input", () => {
    const copy = FLIGHTS.map((f) => ({ ...f }));
    rankFlights(FLIGHTS, "fastest");
    expect(FLIGHTS).toEqual(copy);
  });

  it("handles a single flight for best (no division by zero)", () => {
    expect(indexes(rankFlights([FLIGHTS[0]], "best"))).toEqual([1]);
  });
});

describe("describeFlight", () => {
  it("says the airline, the price, the stops and the duration, short, without the layover city", () => {
    expect(describeFlight(FLIGHTS[0])).toBe("Scoot at 646 euros, one stop, 22 h 05");
    expect(describeFlight(FLIGHTS[3])).toBe("KLM, Garuda at 1030 euros, 2 stops, 18 h 30");
    expect(describeFlight(flight(9, { airline: "Air France", price: 1299.5, currency: "USD", stops: 0, duration_min: 720 }))).toBe("Air France at 1299.50 USD, direct, 12 h");
  });

  it("flightLabel: the button, one short line per flight with the layover city and the departure time", () => {
    expect(flightLabel(FLIGHTS[0])).toBe("Scoot · 646 € · 1 stop Singapore · 22 h 05 · leaves 10:00");
    expect(flightLabel(FLIGHTS[3])).toBe("KLM, Garuda · 1030 € · 2 stops Amsterdam, Jakarta · 18 h 30 · leaves 10:00");
    expect(flightLabel(flight(9, { airline: "Air France", price: 1299.5, currency: "USD", stops: 0, duration_min: 720 }))).toBe("Air France · 1299.50 USD · direct · 12 h · leaves 10:00");
    expect(flightLabel(flight(8, { airline: "Malaysia Airlines", price: 834, stops: 1, duration_min: 1075, depart_at: "11:10", layovers: [{ airport: "Kuala Lumpur" }] }))).toBe(
      "Malaysia Airlines · 834 € · 1 stop Kuala Lumpur · 17 h 55 · leaves 11:10",
    );
    for (const f of FLIGHTS) expect(flightLabel(f).length).toBeLessThanOrEqual(80);
  });

  it("keeps the price and the airline in the first sentence (no full stop inside)", () => {
    for (const f of FLIGHTS) expect(describeFlight(f).split(/(?<=[.!?])\s+/)).toHaveLength(1);
  });

  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(65)).toBe("1 h 05");
  });
});

describe("direct_only", () => {
  it("keeps the direct flights only, cheapest first, and never a flight with a stop", () => {
    const withDirect = [...FLIGHTS, { ...FLIGHTS[0], index: 7, stops: 0, price: 1200, layovers: [] }, { ...FLIGHTS[0], index: 8, stops: 0, price: 990, layovers: [] }];
    expect(indexes(rankFlights(withDirect, "direct_only"))).toEqual([8, 7]);
    expect(rankFlights(FLIGHTS, "direct_only")).toEqual([]);
    expect(introduceFlights("direct_only", withDirect)).toBe("Direct flights only, as you asked, cheapest first.");
  });
});
