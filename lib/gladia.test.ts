import { describe, expect, it, vi } from "vitest";
import { GladiaError, transcribeWithGladia, transcribeWithLanguage } from "@/lib/gladia";

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
    const text = await transcribeWithGladia(audio, { apiKey: "k", fetch: fetchMock, pollIntervalMs: 1 });

    expect(text).toBe("Je pars à Bali lundi.");
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[0];
    expect(String(uploadUrl)).toBe("https://api.gladia.io/v2/upload");
    expect((uploadInit?.body as FormData).get("audio")).toBeInstanceOf(Blob);
    expect(uploadInit?.headers).toMatchObject({ "x-gladia-key": "k" });
    const createBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(createBody).toEqual({ audio_url: "https://api.gladia.io/file/abc" });
    expect(fetchMock).toHaveBeenCalledTimes(5);
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
    expect(await transcribeWithLanguage(audio, { apiKey: "k", fetch: fetchMock, pollIntervalMs: 1 })).toEqual({ text: "Voy a Bali el lunes.", language: "es" });
  });

  it("returns a null language when Gladia gives none or an odd value", async () => {
    for (const languages of [undefined, [], ["not a code"]]) {
      const fetchMock = gladia([{ status: "done", result: { transcription: { full_transcript: "Bali", languages } } }]);
      expect((await transcribeWithLanguage(audio, { apiKey: "k", fetch: fetchMock, pollIntervalMs: 1 })).language).toBeNull();
    }
  });
});
