import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompleteJson } from "@/lib/llm";

const complete = vi.fn<CompleteJson>();
vi.mock("@/lib/llm", () => ({ completeJson: () => complete }));

const { POST } = await import("@/app/api/trip/parse/route");

const nulls = {
  nationality: null,
  origin_country: null,
  destination: null,
  country_iso2: null,
  departure_date: null,
  arrival_at: null,
  return_date: null,
  purpose: null,
  travellers: null,
};

function call(body: unknown) {
  return POST(new Request("http://localhost/api/trip/parse", { method: "POST", body: JSON.stringify(body) }));
}

beforeEach(() => {
  complete.mockReset();
});

describe("POST /api/trip/parse", () => {
  it("parses a first request and lists what is missing", async () => {
    complete.mockResolvedValue(
      JSON.stringify({ ...nulls, destination: "Bali", country_iso2: "ID", departure_date: "2026-11-09", travellers: 1 }),
    );
    const response = await call({ transcript: "Je pars à Bali lundi", today: "2026-11-07" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.request).toMatchObject({ raw_text: "Je pars à Bali lundi", destination: "Bali", nationality: null });
    expect(body.missing).toEqual(["nationality", "origin_country", "arrival_at", "purpose"]);
    expect(body.changed).toEqual(["destination", "country_iso2", "departure_date", "travellers"]);

    const prompt = complete.mock.calls[0][0].user;
    expect(prompt).toContain("Today is Saturday 2026-11-07.");
    expect(prompt).toContain("Request: Je pars à Bali lundi");
  });

  it("applies an answer to the current request and computes the changed fields in code", async () => {
    const current_request = {
      ...nulls,
      raw_text: "Je pars à Bali lundi",
      destination: "Bali",
      country_iso2: "ID",
      departure_date: "2026-11-09",
      status: null,
    };
    // The model claims nothing about what changed, drops the destination and repeats the date.
    complete.mockResolvedValue(
      "```json\n" + JSON.stringify({ ...nulls, departure_date: "2026-11-09", arrival_at: "2026-11-10T14:30+08:00" }) + "\n```",
    );
    const response = await call({
      transcript: "Tuesday at 2:30 pm",
      today: "2026-11-07",
      current_request,
      question: "When do you land in Bali?",
    });
    const body = await response.json();
    expect(body.changed).toEqual(["arrival_at"]);
    expect(body.request).toMatchObject({
      raw_text: "Je pars à Bali lundi",
      destination: "Bali",
      arrival_at: "2026-11-10T14:30+08:00",
    });
    const prompt = complete.mock.calls[0][0].user;
    expect(prompt).toContain('"destination":"Bali"');
    expect(prompt).toContain("Question asked: When do you land in Bali?");
    expect(prompt).toContain("Answer: Tuesday at 2:30 pm");
  });

  it("refuses an invalid body", async () => {
    expect((await call({ transcript: "", today: "2026-11-07" })).status).toBe(400);
    expect((await call({ transcript: "Bali", today: "tomorrow" })).status).toBe(400);
    expect(complete).not.toHaveBeenCalled();
  });

  it("reports an invalid model output as an error", async () => {
    complete.mockResolvedValue(JSON.stringify({ ...nulls, nationality: "France" }));
    const response = await call({ transcript: "Bali", today: "2026-11-07" });
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain("did not return a valid trip request");

    complete.mockResolvedValue("Sorry, I can't help.");
    expect((await call({ transcript: "Bali", today: "2026-11-07" })).status).toBe(502);
  });

  it("reports an unavailable model without leaking details", async () => {
    complete.mockImplementation(async () => {
      throw new Error("HAI_API_KEY is not set");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call({ transcript: "Bali", today: "2026-11-07" });
    expect(response.status).toBe(502);
    expect((await response.json()).error).toBe("The language model is unavailable. Try again.");
  });
});
