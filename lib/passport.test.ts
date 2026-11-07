import { describe, expect, it, vi } from "vitest";
import { expiryWarning, extractPassport, hReader, type PassportReader, toExtraction } from "@/lib/passport";

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
    expect(result.warnings).toEqual([]);
  });

  it("leaves a missing field null with confidence 0 and asks to type it", () => {
    const result = toExtraction(JSON.stringify({ ...SPECIMEN, issue_date: null }), TRIP);
    expect(result.fields.issue_date).toBeNull();
    expect(result.confidence_per_field.issue_date).toBe(0);
    expect(result.warnings).toEqual(["Date of issue could not be read: type it in."]);
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

describe("extractPassport", () => {
  it("uses the H vision model first", async () => {
    const h = vi.fn(async () => JSON.stringify(SPECIMEN));
    const claude = vi.fn(async () => "{}");
    await extractPassport(IMAGE, TRIP, [reader("h", h), reader("anthropic", claude)]);
    expect(h).toHaveBeenCalledWith(IMAGE);
    expect(claude).not.toHaveBeenCalled();
  });

  it("falls back to Claude when H fails, without logging the image", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await extractPassport(IMAGE, TRIP, [
      reader("h", async () => {
        throw new Error("401");
      }),
      reader("anthropic", async () => JSON.stringify(SPECIMEN)),
    ]);
    expect(result.fields.surname).toBe("MARTIN");
    expect(JSON.stringify(log.mock.calls)).not.toContain(IMAGE.base64);
    log.mockRestore();
  });

  it("fails when no model is configured", async () => {
    await expect(extractPassport(IMAGE, TRIP, [])).rejects.toThrow("No vision model");
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
