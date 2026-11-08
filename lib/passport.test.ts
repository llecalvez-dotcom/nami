import { describe, expect, it, vi } from "vitest";
import {
  configuredReader,
  expiryWarning,
  extractPassport,
  hReader,
  isTransientReadError,
  PassportReadError,
  readerName,
  type PassportReader,
  toExtraction,
} from "@/lib/passport";

// Fictitious specimen values: never a real document.
const SPECIMEN = {
  surname: "Martin",
  given_names: "Camille Jeanne",
  nationality: "FRA",
  birth_date: "1990-04-12",
  passport_number: "24AB 12345",
  issue_date: "2020-02-03",
  expiry_date: "2030-02-02",
  confidence: { surname: 0.98, given_names: 0.95, nationality: 0.99, birth_date: 0.97, passport_number: 0.9, issue_date: 0.93, expiry_date: 0.96 },
};
const IMAGE = { base64: "aGVsbG8=", mimeType: "image/jpeg" as const };
const TRIP = { return_date: "2026-11-24" };

const reader = (name: string, read: PassportReader["read"]): PassportReader => ({ name, read });

describe("toExtraction", () => {
  it("returns the seven fields, normalised, with a confidence per field", () => {
    const result = toExtraction(JSON.stringify(SPECIMEN), TRIP);
    expect(result.fields).toEqual({
      surname: "MARTIN",
      given_names: "Camille Jeanne",
      nationality: "FR",
      birth_date: "1990-04-12",
      passport_number: "24AB12345",
      issue_date: "2020-02-03",
      expiry_date: "2030-02-02",
    });
    expect(result.confidence_per_field).toMatchObject({ surname: 0.98, passport_number: 0.9 });
    expect(result.warnings).toEqual(["The MRZ could not be checked: review the printed fields."]);
  });

  it("leaves a missing field null with confidence 0 and asks to type it", () => {
    const result = toExtraction(JSON.stringify({ ...SPECIMEN, issue_date: null }), TRIP);
    expect(result.fields.issue_date).toBeNull();
    expect(result.confidence_per_field.issue_date).toBe(0);
    expect(result.warnings).toContain("Date of issue could not be read: type it in.");
  });

  it("drops a value that is not a valid date instead of guessing", () => {
    const result = toExtraction(JSON.stringify({ ...SPECIMEN, birth_date: "12/04/1990" }), TRIP);
    expect(result.fields.birth_date).toBeNull();
  });

  it("warns when the passport expires less than 6 months after the return", () => {
    const result = toExtraction(JSON.stringify({ ...SPECIMEN, expiry_date: "2027-03-01" }), TRIP);
    expect(result.fields.expiry_date).toBe("2027-03-01");
    expect(result.warnings[0]).toContain("less than 6 months after your return on 2026-11-24");
  });

  it("reads JSON wrapped in a code fence", () => {
    expect(toExtraction("```json\n" + JSON.stringify(SPECIMEN) + "\n```", TRIP).fields.surname).toBe("MARTIN");
  });
});

describe("expiryWarning", () => {
  it("uses arrival + 30 days when the return date is unknown", () => {
    expect(expiryWarning("2027-05-01", { arrival_at: "2026-11-10T14:30+08:00" })).toContain("2026-12-10 (arrival + 30 days)");
    expect(expiryWarning("2027-06-10", { arrival_at: "2026-11-10T14:30+08:00" })).toBeNull();
  });

  it("says nothing without trip dates", () => {
    expect(expiryWarning("2026-12-01", {})).toBeNull();
  });
});

describe("configuredReader", () => {
  it("is off unless an explicitly selected provider has a key", () => {
    expect(configuredReader({})).toBeNull();
    expect(readerName({})).toBe("off");
    expect(configuredReader({ PASSPORT_READER: "h" })).toBeNull();
    expect(readerName({ PASSPORT_READER: "h" })).toBe("off");
    expect(configuredReader({ PASSPORT_READER: "anthropic", ANTHROPIC_API_KEY: "a-key" })?.name).toBe("anthropic");
  });

  it("selects only the explicitly enabled provider", () => {
    expect(configuredReader({ PASSPORT_READER: "h", HAI_API_KEY: "h-key", ANTHROPIC_API_KEY: "a-key" })?.name).toBe("h");
    expect(readerName({ PASSPORT_READER: "anthropic", HAI_API_KEY: "h-key", ANTHROPIC_API_KEY: "a-key" })).toBe("anthropic");
    expect(configuredReader({ PASSPORT_READER: "other", HAI_API_KEY: "h-key", ANTHROPIC_API_KEY: "a-key" })).toBeNull();
  });
});

describe("extractPassport", () => {
  it("uses the configured H vision model", async () => {
    const h = vi.fn(async () => JSON.stringify(SPECIMEN));
    await extractPassport(IMAGE, TRIP, reader("h", h));
    expect(h).toHaveBeenCalledWith(IMAGE);
  });

  it("throws on reader failure and logs no image or provider response body", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      extractPassport(IMAGE, TRIP, {
        name: "h",
        read: async () => {
          throw new Error("401 secret response");
        },
      }),
    ).rejects.toThrow("Passport reading failed");
    expect(JSON.stringify(log.mock.calls)).toContain("h");
    expect(JSON.stringify(log.mock.calls)).not.toContain(IMAGE.base64);
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret response");
    log.mockRestore();
  });
});

describe("extractPassport when H is slow or down (bench, 2026-11-08: two 502 after 30 s)", () => {
  const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});
  const timeout = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");

  it("reads again once after a timeout, and succeeds", async () => {
    const log = quiet();
    const h = vi.fn().mockRejectedValueOnce(timeout()).mockResolvedValueOnce(JSON.stringify(SPECIMEN));
    const extraction = await extractPassport(IMAGE, TRIP, reader("h", h), { retryDelayMs: 0 });
    expect(extraction.fields.surname).toBe("MARTIN");
    // Two reads for the failure and the retry; a third may follow for the MRZ check, as before.
    expect(h.mock.calls.length).toBeGreaterThanOrEqual(2);
    log.mockRestore();
  });

  it("reads again once after a 5xx of the provider", async () => {
    const log = quiet();
    const h = vi.fn().mockRejectedValueOnce(new PassportReadError("H Models API returned 502", true)).mockResolvedValueOnce(JSON.stringify(SPECIMEN));
    await expect(extractPassport(IMAGE, TRIP, reader("h", h), { retryDelayMs: 0 })).resolves.toMatchObject({ fields: { surname: "MARTIN" } });
    expect(h.mock.calls.length).toBeGreaterThanOrEqual(2);
    log.mockRestore();
  });

  it("names H, not the document, after two failures", async () => {
    const log = quiet();
    const h = vi.fn().mockRejectedValueOnce(timeout()).mockRejectedValueOnce(new PassportReadError("H Models API returned 503", true));
    const failure = extractPassport(IMAGE, TRIP, reader("h", h), { retryDelayMs: 0 });
    await expect(failure).rejects.toThrow("H did not answer. Try again in a moment.");
    await expect(failure).rejects.toMatchObject({ transient: true });
    expect(h).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });

  it("does not retry a failure of the document itself (bad JSON, 4xx)", async () => {
    const log = quiet();
    const h = vi.fn().mockRejectedValue(new PassportReadError("H Models API returned 400"));
    await expect(extractPassport(IMAGE, TRIP, reader("h", h), { retryDelayMs: 0 })).rejects.toMatchObject({ transient: false });
    expect(h).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it("flags a 5xx, 408 or 429 of the provider as transient in hReader", async () => {
    const fetchImpl = vi.fn(async () => new Response("private", { status: 502 })) as unknown as typeof fetch;
    const failure = hReader("fictitious-key", fetchImpl).read(IMAGE);
    await expect(failure).rejects.toMatchObject({ transient: true, message: "H Models API returned 502" });
    expect(isTransientReadError(new PassportReadError("H Models API returned 401"))).toBe(false);
    expect(isTransientReadError(new TypeError("fetch failed"))).toBe(true);
  });
});

describe("hReader", () => {
  it("sends the image as a base64 data URI in a chat completion", async () => {
    const fetch = vi.fn(async () => Response.json({ choices: [{ message: { content: JSON.stringify(SPECIMEN) } }] }));
    await hReader("h-key", fetch as unknown as typeof globalThis.fetch).read(IMAGE);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.hcompany.ai/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body.messages[0].content[0]).toEqual({ type: "image_url", image_url: { url: "data:image/jpeg;base64,aGVsbG8=" } });
  });
});
