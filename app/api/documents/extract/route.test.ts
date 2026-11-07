import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/documents/extract/route";

const SPECIMEN = {
  surname: "MARTIN",
  given_names: "Camille",
  nationality: "FR",
  birth_date: "1990-04-12",
  passport_number: "24AB12345",
  issue_date: "2020-02-03",
  expiry_date: "2030-02-02",
  confidence: { surname: 0.9 },
};

function form(image: Blob | null, extra: Record<string, string> = {}) {
  const body = new FormData();
  if (image) body.set("image", image, "specimen.jpg");
  for (const [k, v] of Object.entries(extra)) body.set(k, v);
  return POST(new Request("http://localhost/api/documents/extract", { method: "POST", body }));
}

const jpeg = (bytes = 16) => new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
const hAnswer = (content: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });

beforeEach(() => {
  vi.stubEnv("HAI_API_KEY", "h-key");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/documents/extract (route 12)", () => {
  it("returns the seven fields read by the H vision model", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => hAnswer(SPECIMEN)));
    const response = await form(jpeg(), { return_date: "2026-11-24" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body.fields)).toHaveLength(7);
    expect(body.fields.passport_number).toBe("24AB12345");
    expect(body.warnings).toEqual([]);
  });

  it("flags a missing field", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => hAnswer({ ...SPECIMEN, passport_number: null })));
    const body = await (await form(jpeg())).json();
    expect(body.fields.passport_number).toBeNull();
    expect(body.confidence_per_field.passport_number).toBe(0);
    expect(body.warnings).toContain("Passport number could not be read: type it in.");
  });

  it("warns about a passport expiring soon", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => hAnswer({ ...SPECIMEN, expiry_date: "2027-01-15" })));
    const body = await (await form(jpeg(), { return_date: "2026-11-24" })).json();
    expect(body.warnings[0]).toContain("less than 6 months");
  });

  it("falls back to Claude when H fails", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "a-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetch = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("hcompany")
        ? new Response("no", { status: 401 })
        : Response.json({ content: [{ type: "text", text: JSON.stringify(SPECIMEN) }] }),
    );
    vi.stubGlobal("fetch", fetch);
    const response = await form(jpeg());
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["no image", null, 400],
    ["a PDF", new Blob(["%PDF"], { type: "application/pdf" }), 415],
    ["an image over 5 MB", jpeg(5 * 1024 * 1024 + 1), 413],
  ])("rejects %s", async (_label, image, status) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await form(image)).status).toBe(status);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("answers 503 when no vision model is configured", async () => {
    vi.stubEnv("HAI_API_KEY", "");
    expect((await form(jpeg())).status).toBe(503);
  });

  it("answers 502 without leaking the model answer when reading fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("secret body", { status: 500 })));
    const response = await form(jpeg());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("secret body");
  });
});
