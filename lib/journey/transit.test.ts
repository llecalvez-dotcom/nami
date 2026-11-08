import { describe, expect, it } from "vitest";
import type { FlightOption } from "@/lib/contracts";
import { connectionType, findTransitRequirements, knownTransit, transitClear, transitMessage, transitQuery, transitStops, type TransitInput } from "@/lib/journey/transit";

const flight = (layovers: FlightOption["layovers"], self_transfer?: boolean): FlightOption => ({
  airline: "Qatar Airways", price: 912, currency: "EUR", stops: layovers.length, duration_min: 1110, depart_at: "13:50", arrive_at: "14:55+1", layovers, index: 1, self_transfer,
});
const TRIP = { country_iso2: "ID", origin_country: "FR" };
const DOHA: TransitInput = { nationality: "FR", city: "Doha", country_iso2: "QA", connection: "airside", layover_min: 150, destination: "Bali" };

const linkup = (data: unknown, sources: string[] = ["https://www.mofa.gov.qa/en/visa"]) => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ data, sources: sources.map((url) => ({ url })) }), { status: 200 });
  return { apiKey: "k", fetch: fetchImpl, timeoutMs: 1000 };
};

describe("transitStops", () => {
  it("reads the countries from the layovers, skips the destination and the origin countries, keeps unknown cities", () => {
    expect(transitStops(flight([{ airport: "Doha", duration_min: 150 }]), TRIP)).toEqual([{ city: "Doha", country_iso2: "QA", connection: "airside", layover_min: 150 }]);
    expect(transitStops(flight([{ airport: "Jakarta", duration_min: 90 }]), TRIP)).toEqual([]);
    expect(transitStops(flight([{ airport: "Paris", duration_min: 90 }, { airport: "Singapore" }]), TRIP)).toEqual([{ city: "Singapore", country_iso2: "SG", connection: "airside", layover_min: null }]);
    expect(transitStops(flight([{ airport: "Zanzibar", duration_min: 90 }]), TRIP)[0]).toMatchObject({ city: "Zanzibar", country_iso2: null });
  });

  it("separate tickets or a layover of a day are a landside connection", () => {
    expect(connectionType({ self_transfer: true }, 120)).toBe("landside");
    expect(connectionType({}, 24 * 60)).toBe("landside");
    expect(connectionType({}, 23 * 60)).toBe("airside");
    expect(transitStops(flight([{ airport: "Milan", duration_min: 1410 }, { airport: "Hong Kong", duration_min: 225 }], true), TRIP).map((s) => s.connection)).toEqual(["landside", "landside"]);
  });
});

describe("knownTransit", () => {
  it("settles a Schengen stop for a Schengen passport, flags an unknown city, searches the rest", () => {
    expect(knownTransit({ city: "Amsterdam", country_iso2: "NL", connection: "airside", layover_min: 90 }, "FR")).toMatchObject({ status: "not_needed", country: "Netherlands" });
    expect(knownTransit({ city: "Amsterdam", country_iso2: "NL", connection: "airside", layover_min: 90 }, "IN")).toBeNull();
    expect(knownTransit({ city: "Zanzibar", country_iso2: null, connection: "airside", layover_min: 90 }, "FR")?.status).toBe("needs_verification");
    expect(knownTransit({ city: "Doha", country_iso2: "QA", connection: "airside", layover_min: 90 }, "FR")).toBeNull();
  });
});

describe("findTransitRequirements", () => {
  it("asks for the actual passport and connection type, on official sites of both countries", async () => {
    const q = transitQuery({ ...DOHA, connection: "landside", nationality: "IN" });
    expect(q).toContain("passport issued by India");
    expect(q).toContain("Doha, Qatar");
    expect(q).toContain("leaving the transit area");
    expect(q).toContain("about 3 hours");
    let seen = "";
    const fetchImpl: typeof fetch = async (_url, init) => {
      seen = String(init?.body);
      return new Response(JSON.stringify({ data: {}, sources: [] }), { status: 200 });
    };
    await findTransitRequirements({ ...DOHA, nationality: "IN" }, { apiKey: "k", fetch: fetchImpl, timeoutMs: 1000 });
    expect(seen).toContain("gov.qa");
    expect(seen).toContain("gov.in");
  });

  it("verified exemption only with an official source; otherwise needs verification, never an invented exemption", async () => {
    const exempt = { transit_visa_required: false, airside_only: true, max_hours: null, conditions: "Onward ticket within 24 hours.", source_url: "https://www.mofa.gov.qa/en/visa" };
    expect(await findTransitRequirements(DOHA, linkup(exempt))).toMatchObject({ status: "exempt_verified", sources: ["https://www.mofa.gov.qa/en/visa"] });
    const blog = await findTransitRequirements(DOHA, linkup({ ...exempt, source_url: "https://travelblog.example.com/qatar" }, ["https://travelblog.example.com/qatar"]));
    expect(blog).toMatchObject({ status: "needs_verification", error: "no official source in the answer" });
    expect(blog.summary).toContain("could not verify");
    expect(await findTransitRequirements(DOHA, linkup({ ...exempt, transit_visa_required: null }))).toMatchObject({ status: "needs_verification" });
    expect(await findTransitRequirements(DOHA, { apiKey: undefined })).toMatchObject({ status: "needs_verification", error: "LINKUP_API_KEY is not set" });
  });

  it("an airside-only exemption does not cover a landside connection, nor a layover beyond the limit", async () => {
    const exempt = { transit_visa_required: false, airside_only: true, max_hours: 24, conditions: "", source_url: "https://www.mofa.gov.qa/en/visa" };
    expect((await findTransitRequirements({ ...DOHA, connection: "landside" }, linkup(exempt))).status).toBe("needs_verification");
    expect((await findTransitRequirements({ ...DOHA, layover_min: 30 * 60 }, linkup(exempt))).status).toBe("needs_verification");
    expect((await findTransitRequirements({ ...DOHA, connection: "landside" }, linkup({ ...exempt, airside_only: false }))).status).toBe("exempt_verified");
  });

  it("a visa required is said with its source", async () => {
    const visa = { transit_visa_required: true, airside_only: false, max_hours: null, conditions: "Apply before departure.", source_url: "https://www.mofa.gov.qa/en/visa" };
    const check = await findTransitRequirements({ ...DOHA, nationality: "IN" }, linkup(visa));
    expect(check.status).toBe("visa_required");
    expect(check.summary).toBe("Transit in Doha (Qatar): a transit visa is required for your passport (India), per www.mofa.gov.qa. Apply before departure.");
  });
});

describe("transitMessage", () => {
  const clear = { city: "Doha", country_iso2: "QA", country: "Qatar", connection: "airside" as const, layover_min: 150, status: "exempt_verified" as const, summary: "Doha: fine.", sources: ["https://www.mofa.gov.qa"] };
  it("never calls the journey ready while a transit is unverified or needs a visa", () => {
    expect(transitClear([clear])).toBe(true);
    expect(transitMessage([clear])).toBe("Doha: fine.");
    const open = { ...clear, status: "needs_verification" as const, summary: "Doha: not found." };
    expect(transitClear([clear, open])).toBe(false);
    expect(transitMessage([clear, open])).toBe("Doha: fine. Doha: not found. I do not call this journey ready until that is verified.");
    expect(transitMessage([{ ...clear, status: "visa_required", summary: "Doha: visa." }])).toContain("not ready until that transit visa is sorted");
  });
});
