import { describe, expect, it } from "vitest";
import { connectionRisk, decideDeparture, MIN_NET_SAVINGS_EUR, netSavings, type DepartureOption, type ExtraCost } from "@/lib/journey/decision";

const train = (price_eur: number, verified = true): ExtraCost => ({ kind: "train", label: "TGV Lyon to Paris", price_eur, duration_min: 120, verified });
const rer = (price_eur = 12): ExtraCost => ({ kind: "airport_transfer", label: "RER B to CDG", price_eur, duration_min: 45, verified: true });

const LYON: DepartureOption = { city: "Lyon", flight_price_eur: 1100, flight_duration_min: 1000, extras: [], ticketing: "single_ticket", buffer_min: null };
const paris = (flight_price_eur: number, patch: Partial<DepartureOption> = {}): DepartureOption => ({
  city: "Paris", flight_price_eur, flight_duration_min: 980, extras: [train(60), rer()], ticketing: "separate_tickets", buffer_min: 200, ...patch,
});

describe("decideDeparture", () => {
  it("keeps the named city when there is no alternative", () => {
    expect(decideDeparture(LYON, null)).toMatchObject({ action: "keep_original", original: "Lyon", alternative: null, summary: "Flights from Lyon, as you asked." });
  });

  it("counts the train and the transfer before any saving: Paris 40 € net does not interrupt", () => {
    // 1100 - (988 + 60 + 12) = 40 net although the flight alone is 112 cheaper.
    const decision = decideDeparture(LYON, paris(988));
    expect(netSavings(LYON, paris(988))).toEqual({ net_eur: 40, verified: true });
    expect(decision.action).toBe("keep_original");
    expect(decision.net_savings_eur).toBe(40);
    expect(decision.summary).toContain("under 90 €");
  });

  it("needs at least 90 € net", () => {
    expect(MIN_NET_SAVINGS_EUR).toBe(90);
    expect(decideDeparture(LYON, paris(939)).action).toBe("keep_original");
    expect(decideDeparture(LYON, paris(938)).action).toBe("offer_alternative");
  });

  it("claims nothing when an extra cost is not verified", () => {
    const decision = decideDeparture(LYON, paris(900, { extras: [train(60, false), rer()] }));
    expect(decision).toMatchObject({ action: "keep_original", savings_verified: false });
    expect(decision.summary).toContain("not verified");
  });

  it("Paris 110 € net with a risky unprotected connection is not a safe alternative", () => {
    // 1100 - (918 + 72) = 110 net, 80 min between the train and the flight on separate tickets.
    const decision = decideDeparture(LYON, paris(918, { buffer_min: 80 }));
    expect(decision.action).toBe("keep_original");
    expect(decision.risk).toMatchObject({ level: "risky", risk_free: false });
    expect(decision.summary).toContain("not safe");
  });

  it("Paris 110 € net with an acceptable transfer is offered with the trade-off, never risk free", () => {
    const decision = decideDeparture(LYON, paris(918));
    expect(decision).toMatchObject({ action: "offer_alternative", net_savings_eur: 110, alternative: "Paris" });
    expect(decision.extra_minutes).toBe(145);
    expect(decision.risk).toMatchObject({ level: "acceptable", risk_free: false });
    expect(decision.summary).toBe(
      "Leaving from Paris instead of Lyon saves 110 € net, train and transfers counted, for 2 h 25 more. Separate tickets with 3 h before the flight: acceptable, but a late train stays your risk. Shall I look at it, or keep Lyon?",
    );
  });

  it("keeps the named city when the alternative adds too much time", () => {
    const slow = paris(700, { extras: [{ ...train(60), duration_min: 400 }, rer()] });
    expect(decideDeparture(LYON, slow)).toMatchObject({ action: "keep_original" });
    expect(decideDeparture(LYON, slow).summary).toContain("adds");
  });
});

describe("connectionRisk", () => {
  it("separate tickets are never risk free, a single ticket is protected, no connection is none", () => {
    expect(connectionRisk(paris(900, { buffer_min: 600 })).risk_free).toBe(false);
    expect(connectionRisk(paris(900, { ticketing: "single_ticket" }))).toMatchObject({ level: "protected", risk_free: false });
    expect(connectionRisk(LYON)).toMatchObject({ level: "none", risk_free: true });
    expect(connectionRisk(paris(900, { buffer_min: 179 })).level).toBe("risky");
    expect(connectionRisk(paris(900, { buffer_min: 180 })).level).toBe("acceptable");
  });
});
