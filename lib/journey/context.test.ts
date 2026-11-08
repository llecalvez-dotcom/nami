import { describe, expect, it } from "vitest";
import type { FlightOption, TripRequestDraft } from "@/lib/contracts";
import { applyPreferences, departureHour, detectPreferences, isNightDeparture, mergePreferences, newPreferences, preferenceNoted, travellerContext, unmetPreference } from "@/lib/journey/context";

const flight = (index: number, depart_at: string): FlightOption => ({ airline: "A", price: 100 * index, currency: "EUR", stops: 0, duration_min: 600, depart_at, arrive_at: "10:00", layovers: [], index });

describe("preferences heard", () => {
  it.each([
    "Au fait, je préfère éviter les vols de nuit",
    "pas de vol de nuit s'il te plaît",
    "no night flights please",
    "I'd rather avoid red-eye flights",
    "sin vuelos nocturnos",
    "keine Nachtflüge bitte",
    "niente voli notturni",
  ])("%s -> avoid_night_flights", (text) => {
    expect(detectPreferences(text).map((p) => p.kind)).toEqual(["avoid_night_flights"]);
  });

  it("a night flight asked for, or no night word, is not the preference", () => {
    expect(detectPreferences("je veux un vol de nuit")).toEqual([]);
    expect(detectPreferences("pas de vol le matin")).toEqual([]);
    expect(detectPreferences("le moins cher")).toEqual([]);
  });

  it("merges one per kind, the latest sentence kept, and tells the new ones", () => {
    const first = detectPreferences("no night flights");
    const again = detectPreferences("pas de vol de nuit");
    expect(mergePreferences(first, again)).toEqual([{ kind: "avoid_night_flights", said: "pas de vol de nuit" }]);
    expect(newPreferences(first, again)).toEqual([]);
    expect(newPreferences(undefined, again)).toEqual(again);
    expect(preferenceNoted(again)).toBe("Noted, no night flights: I keep them out of the flights I show you.");
    expect(preferenceNoted([])).toBeNull();
  });
});

describe("night departures", () => {
  it("reads the hour as Google shows it", () => {
    expect(departureHour("13:50")).toBe(13);
    expect(departureHour("10:30 PM")).toBe(22);
    expect(departureHour("12:05 AM")).toBe(0);
    expect(departureHour("22h15")).toBe(22);
    expect(departureHour("morning")).toBeNull();
  });

  it("21:00 to 05:59 is night, unknown is unknown", () => {
    expect(isNightDeparture("21:00")).toBe(true);
    expect(isNightDeparture("23:40")).toBe(true);
    expect(isNightDeparture("05:59")).toBe(true);
    expect(isNightDeparture("06:00")).toBe(false);
    expect(isNightDeparture("20:59")).toBe(false);
    expect(isNightDeparture("?")).toBeNull();
  });

  it("sets night flights aside when a day flight exists, hides nothing when every flight is at night", () => {
    const prefs = detectPreferences("no night flights");
    const mixed = [flight(1, "23:10"), flight(2, "09:30"), flight(3, "?")];
    const filtered = applyPreferences(mixed, prefs);
    expect(filtered.kept.map((f) => f.index)).toEqual([2, 3]);
    expect(filtered.dropped.map((f) => f.index)).toEqual([1]);
    expect(filtered.applied).toEqual(["avoid_night_flights"]);
    const night = [flight(1, "23:10"), flight(2, "22:00")];
    expect(applyPreferences(night, prefs).kept).toHaveLength(2);
    expect(unmetPreference(night, prefs)).toBe("avoid_night_flights");
    expect(unmetPreference(mixed, prefs)).toBeNull();
    expect(applyPreferences(mixed, undefined).kept).toHaveLength(3);
  });
});

describe("traveller context", () => {
  const request: TripRequestDraft = {
    raw_text: "x", nationality: null, origin_country: "FR", origin: "Toulouse", destination: "Bali", country_iso2: "ID",
    departure_date: "2026-12-01", arrival_at: null, return_date: "2026-12-15", purpose: "tourism", travellers: null, status: null,
  };

  it("separates facts, preferences and assumptions", () => {
    const context = travellerContext(request, detectPreferences("no night flights"));
    expect(context.facts).toEqual({ origin: "Toulouse", destination: "Bali", departure_date: "2026-12-01", return_date: "2026-12-15", purpose: "tourism" });
    expect(context.preferences.map((p) => p.kind)).toEqual(["avoid_night_flights"]);
    expect(context.assumptions).toEqual(["French passport, until you say otherwise", "1 traveller"]);
  });

  it("never assumes a departure city", () => {
    const context = travellerContext({ ...request, origin: null, nationality: "IN", travellers: 2 }, undefined);
    expect(context.facts.nationality).toBe("India");
    expect(context.assumptions).toEqual(["departure city not given yet, nothing is searched from Paris in your place"]);
  });
});
