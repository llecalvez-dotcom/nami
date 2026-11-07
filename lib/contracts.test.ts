import { describe, expect, it } from "vitest";
import { SAMPLE_AGENT_RUN, SAMPLE_DRAFT, SAMPLE_FORMALITIES, SAMPLE_SUGGESTIONS, SAMPLE_TRIP } from "@/data/sample";
import {
  AgentRunSchema,
  FormalitySchema,
  ModuleSuggestionSchema,
  TripRequestDraftSchema,
  TripRequestSchema,
  type TripRequest,
} from "@/lib/contracts";

const tripWithoutCountry: Partial<TripRequest> = { ...SAMPLE_TRIP };
delete tripWithoutCountry.country_iso2;

describe("TripRequest", () => {
  it("accepts the sample trip", () => {
    expect(TripRequestSchema.safeParse(SAMPLE_TRIP).success).toBe(true);
  });

  it("rejects a strict request without country_iso2", () => {
    expect(TripRequestSchema.safeParse(tripWithoutCountry).success).toBe(false);
    expect(TripRequestSchema.safeParse({ ...SAMPLE_TRIP, country_iso2: null }).success).toBe(false);
  });
});

describe("TripRequestDraft", () => {
  it("accepts a draft without country_iso2", () => {
    const parsed = TripRequestDraftSchema.safeParse(tripWithoutCountry);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.country_iso2).toBeNull();
  });

  it("accepts a draft with only raw_text", () => {
    expect(TripRequestDraftSchema.safeParse({ raw_text: "Going to Japan" }).success).toBe(true);
  });

  it("rejects a draft without raw_text", () => {
    expect(TripRequestDraftSchema.safeParse({ destination: "Bali" }).success).toBe(false);
  });

  it("accepts the sample draft", () => {
    expect(TripRequestDraftSchema.safeParse(SAMPLE_DRAFT).success).toBe(true);
  });
});

describe("sample data", () => {
  it("matches the contracts", () => {
    for (const s of SAMPLE_SUGGESTIONS) expect(ModuleSuggestionSchema.safeParse(s).success).toBe(true);
    for (const f of SAMPLE_FORMALITIES) expect(FormalitySchema.safeParse(f).success).toBe(true);
    expect(AgentRunSchema.safeParse(SAMPLE_AGENT_RUN).success).toBe(true);
    expect(SAMPLE_FORMALITIES).toHaveLength(3);
  });
});
