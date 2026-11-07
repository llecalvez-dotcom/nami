import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompleteJson } from "@/lib/llm";
import { resetGuards } from "@/lib/api-guard";

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
  resetGuards();
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

  it("does not invent a midnight landing when only the departure day and stay length are stated", async () => {
    complete.mockResolvedValue(JSON.stringify({
      ...nulls, destination: "Bali", country_iso2: "ID", departure_date: "2026-11-09",
      arrival_at: "2026-11-09T00:00+08:00", return_date: "2026-11-19", purpose: "tourism", travellers: 1,
    }));
    const response = await call({
      transcript: "I'm flying to Bali on Monday for a friend's wedding, staying ten days.",
      today: "2026-11-07",
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.request.arrival_at).toBeNull();
    expect(body.missing).toContain("arrival_at");
    expect(body.changed).not.toContain("arrival_at");
    expect(body.request).toMatchObject({ departure_date: "2026-11-09", return_date: "2026-11-19" });
    expect(complete.mock.calls[0][0].system).not.toContain("use 00:00");
  });

  it.each(["Monday, staying 10 days with 2 friends", "A 7-day trip to Bali on Monday", "staying ten days"])(
    "rejects an invented time even when the question suggests one: %s",
    async (transcript) => {
      complete.mockResolvedValue(JSON.stringify({ ...nulls, arrival_at: "2026-11-09T14:30+08:00" }));
      const response = await call({
        transcript,
        today: "2026-11-07",
        current_request: { ...nulls, raw_text: "Bali", destination: "Bali" },
        question: "Do you land at 14:30?",
      });
      const body = await response.json();
      expect(body.request.arrival_at).toBeNull();
      expect(body.missing).toContain("arrival_at");
      expect(body.changed).not.toContain("arrival_at");
    },
  );

  it.each([
    ["landing at 7pm", "19:00"],
    ["arrive 14:30", "14:30"],
    ["landing in the morning", "09:00"],
    ["landing at midnight", "00:00"],
    ["landing at noon", "12:00"],
    ["landing at 7", "07:00"],
    ["j'arrive a 14h30", "14:30"],
    ["j'arrive a 7 h", "07:00"],
    ["j'arrive dans l'apres-midi", "14:00"],
    ["landing at 7 p.m.", "19:00"],
    ["landing Tuesday 7:30pm", "19:30"],
    ["landing Tuesday 7:30am", "07:30"],
    ["I land at eight", "08:00"],
    ["around half past seven", "07:30"],
    ["at nine in the evening", "21:00"],
    ["à huit heures", "08:00"],
    ["eight o'clock", "08:00"],
    ["eight o’clock", "08:00"],
    ["huit heures", "08:00"],
    ["j'atterris mardi 18 heures", "18:00"],
    ["à 7 heure", "07:00"],
    ["vers midi", "12:00"],
    ["à minuit", "00:00"],
    ...["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"]
      .map((hour, index) => [`at ${hour}`, `${String(index + 1).padStart(2, "0")}:00`]),
    ...["un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze"]
      .map((hour, index) => [`vers ${hour}`, `${String(index + 1).padStart(2, "0")}:00`]),
  ])("preserves a model landing time when stated: %s", async (phrase, time) => {
    const arrival_at = `2026-11-09T${time}+08:00`;
    complete.mockResolvedValue(JSON.stringify({ ...nulls, arrival_at }));
    const body = await (await call({ transcript: `Bali on Monday, ${phrase}`, today: "2026-11-07" })).json();
    expect(body.request.arrival_at).toBe(arrival_at);
    expect(body.missing).not.toContain("arrival_at");
    expect(body.changed).toContain("arrival_at");
  });

  it("keeps an already known landing time when an unrelated answer states no time", async () => {
    const arrival_at = "2026-11-09T19:00+08:00";
    complete.mockResolvedValue(JSON.stringify({ ...nulls, nationality: "FR", arrival_at: "2026-11-09T00:00+08:00" }));
    const body = await (await call({
      transcript: "French",
      today: "2026-11-07",
      current_request: { ...nulls, raw_text: "Bali on Monday, landing at 7pm", arrival_at },
      question: "What is your nationality?",
    })).json();
    expect(body.request.arrival_at).toBe(arrival_at);
    expect(body.changed).toEqual(["nationality"]);
  });

  it("clears a known landing time when only the landing day changes", async () => {
    complete.mockResolvedValue(JSON.stringify({ ...nulls, arrival_at: "2026-11-11T00:00+08:00" }));
    const body = await (await call({
      transcript: "Actually I land on Wednesday",
      today: "2026-11-07",
      current_request: { ...nulls, raw_text: "Bali on Monday, landing at 7pm", arrival_at: "2026-11-09T19:00+08:00" },
    })).json();
    expect(body.request.arrival_at).toBeNull();
    expect(body.missing).toContain("arrival_at");
    expect(body.changed).toContain("arrival_at");
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
