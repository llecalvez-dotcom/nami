import { describe, expect, it } from "vitest";
import type { Formality } from "@/lib/contracts";
import { expertChecks, type ExpertChecksInput } from "@/lib/expert-checks";
import type { FormalitiesResult } from "@/lib/formalities";

const live = (over: Partial<FormalitiesResult> = {}): FormalitiesResult => ({
  mode: "live",
  destination: "Bali",
  country_iso2: "ID",
  country_name: "Indonesia",
  checked_at: "2026-11-08T10:00:00.000Z",
  duration_ms: 4000,
  searched_domains: ["diplomatie.gouv.fr"],
  formalities: [],
  sources: [{ url: "https://evisa.imigrasi.go.id/", official: true }],
  fillable: true,
  differs_from_last_check: false,
  missing_from_live: [],
  verified_by_hand_on: "2026-11-07",
  error: null,
  notice: "",
  ...over,
});

const formality = (opens_at: string | null): Formality => ({
  id: "arrival_card",
  name: "All Indonesia arrival card",
  required: true,
  official_url: "https://allindonesia.imigrasi.go.id/",
  official_cost: "Free",
  opens_at,
  closes_at: null,
  sources: [],
  status: "suggested",
  checked_at: null,
});

const nothing: ExpertChecksInput = {
  live: null,
  mrzVerified: 0,
  passportExpiry: null,
  dates: {},
  countryIso2: "ID",
  formalities: [],
  agentOnOfficialSite: false,
};

const labels = (input: Partial<ExpertChecksInput>) => expertChecks({ ...nothing, ...input }).map((c) => `${c.state}:${c.label}`);

describe("expertChecks", () => {
  it("shows nothing before any evidence", () => {
    expect(labels({})).toEqual([]);
  });

  it("shows the live check on official sources and the match with the hand-verified table", () => {
    expect(labels({ live: live() })).toEqual(["ok:Official sources", "ok:Matches our hand check"]);
  });

  it("says when the live answer differs from the last hand check", () => {
    expect(labels({ live: live({ differs_from_last_check: true }) })).toContain("warn:Differs from our last check");
  });

  it("claims nothing from the fallback table or from unofficial sources", () => {
    expect(labels({ live: live({ mode: "fallback" }) })).toEqual([]);
    expect(labels({ live: live({ sources: [{ url: "https://blog.example.com/", official: false }], verified_by_hand_on: null }) })).toEqual([]);
  });

  it("shows the MRZ check only once fields were verified", () => {
    expect(labels({ mrzVerified: 3 })).toEqual(["ok:MRZ check digits valid"]);
  });

  it("checks Indonesia's 6-month rule against the trip dates", () => {
    const dates = { return_date: "2026-12-01" };
    expect(labels({ passportExpiry: "2031-05-01", dates })).toEqual(["ok:Passport valid 6 months"]);
    expect(labels({ passportExpiry: "2027-01-15", dates })).toEqual(["warn:Passport expires too soon"]);
  });

  it("does not claim the validity rule without trip dates or outside Indonesia", () => {
    expect(labels({ passportExpiry: "2031-05-01" })).toEqual([]);
    expect(labels({ passportExpiry: "2031-05-01", dates: { return_date: "2026-12-01" }, countryIso2: "JP" })).toEqual([]);
  });

  it("shows the deadlines once a paper window is computed, and the domain guard once an agent ran", () => {
    expect(labels({ formalities: [formality(null)] })).toEqual([]);
    expect(labels({ formalities: [formality("2026-11-20T00:00+08:00")], agentOnOfficialSite: true })).toEqual(["ok:Deadlines set", "ok:Official site only"]);
  });
});
