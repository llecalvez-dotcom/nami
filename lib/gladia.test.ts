import { describe, expect, it, vi } from "vitest";
import { GladiaError, languagesFromEnv, modelFromEnv, preRecordedBody, TRAVEL_VOCABULARY, transcribeWithGladia, transcribeWithLanguage, vocabularyFromEnv } from "@/lib/gladia";

const audio = new File([new Uint8Array([1, 2, 3])], "voice.webm", { type: "audio/webm" });

function gladia(statuses: object[]) {
  let polls = 0;
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace("https://api.gladia.io/v2", "");
    if (path === "/upload") return Response.json({ audio_url: "https://api.gladia.io/file/abc" });
    if (path === "/pre-recorded" && init?.method === "POST") return Response.json({ id: "job-1", result_url: "x" }, { status: 201 });
    if (path === "/pre-recorded/job-1") return Response.json(statuses[Math.min(polls++, statuses.length - 1)]);
    return new Response("not found", { status: 404 });
  });
}

const done = (text: string) => ({ status: "done", result: { transcription: { full_transcript: text } } });

describe("transcribeWithGladia", () => {
  it("uploads, creates the job in fr and en, polls until done", async () => {
    const fetchMock = gladia([{ status: "queued" }, { status: "processing" }, done(" Je pars à Bali lundi. ")]);
    const text = await transcribeWithGladia(audio, { apiKey: "k", fetch: fetchMock, pollIntervalMs: 1, languages: [], vocabulary: [], model: "" });

    expect(text).toBe("Je pars à Bali lundi.");
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[0];
    expect(String(uploadUrl)).toBe("https://api.gladia.io/v2/upload");
    expect((uploadInit?.body as FormData).get("audio")).toBeInstanceOf(Blob);
    expect(uploadInit?.headers).toMatchObject({ "x-gladia-key": "k" });
    const createBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(createBody).toEqual({ audio_url: "https://api.gladia.io/file/abc" });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("sends the language list and the vocabulary when given", async () => {
    const fetchMock = gladia([done("Je pars à Denpasar.")]);
    await transcribeWithGladia(audio, { apiKey: "k", fetch: fetchMock, pollIntervalMs: 1, languages: ["fr", "en"], vocabulary: ["Denpasar"], model: "" });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      audio_url: "https://api.gladia.io/file/abc",
      language_config: { languages: ["fr", "en"], code_switching: true },
      custom_vocabulary: true,
      custom_vocabulary_config: { vocabulary: ["Denpasar"], default_intensity: 0.5 },
    });
  });

  it("retries the job once without the options when Gladia refuses them", async () => {
    let creations = 0;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url).replace("https://api.gladia.io/v2", "");
      if (path === "/upload") return Response.json({ audio_url: "https://api.gladia.io/file/abc" });
      if (path === "/pre-recorded" && init?.method === "POST") {
        creations += 1;
        return creations === 1 ? new Response("bad option", { status: 400 }) : Response.json({ id: "job-1" }, { status: 201 });
      }
      if (path === "/pre-recorded/job-1") return Response.json(done("Bali"));
      return new Response("not found", { status: 404 });
    });
    const text = await transcribeWithGladia(audio, { apiKey: "k", fetch: fetchMock, pollIntervalMs: 1, languages: ["fr"], vocabulary: ["Bali"], model: "solaria-3" });
    expect(text).toBe("Bali");
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({ audio_url: "https://api.gladia.io/file/abc" });
  });

  it("does not retry a refused job that had no options", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith("/upload") ? Response.json({ audio_url: "u" }) : new Response("bad", { status: 400 }),
    );
    await expect(transcribeWithGladia(audio, { apiKey: "k", fetch: fetchMock, languages: [], vocabulary: [], model: "" })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails on an HTTP error", async () => {
    const fetchMock = vi.fn(async () => new Response("bad key", { status: 401 }));
    await expect(transcribeWithGladia(audio, { apiKey: "k", fetch: fetchMock })).rejects.toMatchObject({
      kind: "failed",
      message: "Gladia upload failed (401).",
    });
  });

  it("fails when the job ends in error", async () => {
    const fetchMock = gladia([{ status: "error", error_code: 500 }]);
    await expect(transcribeWithGladia(audio, { apiKey: "k", fetch: fetchMock, pollIntervalMs: 1 })).rejects.toMatchObject({
      kind: "failed",
    });
  });

  it("times out when the job never finishes", async () => {
    const fetchMock = gladia([{ status: "processing" }]);
    await expect(
      transcribeWithGladia(audio, { apiKey: "k", fetch: fetchMock, timeoutMs: 50, pollIntervalMs: 10 }),
    ).rejects.toMatchObject({ kind: "timeout" });
  });

  it("times out when Gladia does not answer", async () => {
    const hanging = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))),
    );
    const error = await transcribeWithGladia(audio, { apiKey: "k", fetch: hanging, timeoutMs: 30 }).catch((e) => e);
    expect(error).toBeInstanceOf(GladiaError);
    expect(error.kind).toBe("timeout");
  });
});

describe("transcribeWithLanguage", () => {
  it("returns the language Gladia detected, without restricting it to French and English", async () => {
    const fetchMock = gladia([{ status: "done", result: { transcription: { full_transcript: "Voy a Bali el lunes.", languages: ["es"] } } }]);
    expect(await transcribeWithLanguage(audio, { apiKey: "k", fetch: fetchMock, pollIntervalMs: 1, languages: [] })).toEqual({ text: "Voy a Bali el lunes.", language: "es" });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).not.toHaveProperty("language_config");
  });

  it("returns a null language when Gladia gives none or an odd value", async () => {
    for (const languages of [undefined, [], ["not a code"]]) {
      const fetchMock = gladia([{ status: "done", result: { transcription: { full_transcript: "Bali", languages } } }]);
      expect((await transcribeWithLanguage(audio, { apiKey: "k", fetch: fetchMock, pollIntervalMs: 1 })).language).toBeNull();
    }
  });
});

describe("Gladia's model", () => {
  it("uses solaria-3 unless GLADIA_MODEL says otherwise", () => {
    expect(modelFromEnv(undefined)).toBe("solaria-3");
    expect(modelFromEnv(" ")).toBe("solaria-3");
    expect(modelFromEnv("solaria-1")).toBe("solaria-1");
  });

  it("sends the model, and never code switching with solaria-3", () => {
    expect(preRecordedBody("u", ["fr", "en"], [], "solaria-3")).toEqual({
      audio_url: "u", model: "solaria-3", language_config: { languages: ["fr", "en"], code_switching: false },
    });
    expect(preRecordedBody("u", [], [], "solaria-3")).toEqual({ audio_url: "u", model: "solaria-3" });
  });
});

describe("Gladia settings", () => {
  it("reads GLADIA_LANGUAGES as a list of codes, empty when unset", () => {
    expect(languagesFromEnv(undefined)).toEqual([]);
    expect(languagesFromEnv("")).toEqual([]);
    expect(languagesFromEnv(" FR, en ,not a code")).toEqual(["fr", "en"]);
  });

  it("uses the travel vocabulary unless GLADIA_VOCABULARY=off", () => {
    expect(vocabularyFromEnv(undefined)).toEqual([...TRAVEL_VOCABULARY]);
    expect(vocabularyFromEnv("off")).toEqual([]);
    expect(TRAVEL_VOCABULARY).not.toContain("Nami");
  });

  it("keeps a single language without code switching", () => {
    expect(preRecordedBody("u", ["fr"], [])).toEqual({ audio_url: "u", language_config: { languages: ["fr"], code_switching: false } });
  });
});
