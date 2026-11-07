import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/voice/transcribe/route";
import { resetGuards } from "@/lib/api-guard";

async function request(audio?: Blob) {
  const form = new FormData();
  if (audio) form.append("audio", audio, "voice.webm");
  const source = new Request("http://localhost/api/voice/transcribe", { method: "POST", body: form });
  const bytes = await source.arrayBuffer();
  const headers = new Headers(source.headers);
  headers.set("content-length", String(bytes.byteLength));
  return new Request(source.url, { method: "POST", headers, body: bytes });
}

const audio = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });

function stubGladia(handler: (path: string) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (...[url]: Parameters<typeof fetch>) => handler(String(url).replace("https://api.gladia.io/v2", "")));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  resetGuards();
});

describe("POST /api/voice/transcribe", () => {
  it("returns the transcript", async () => {
    vi.stubEnv("GLADIA_API_KEY", "secret-key");
    const fetchMock = stubGladia((path) => {
      if (path === "/upload") return Response.json({ audio_url: "https://api.gladia.io/file/abc" });
      if (path === "/pre-recorded") return Response.json({ id: "job-1" }, { status: 201 });
      return Response.json({ status: "done", result: { transcription: { full_transcript: "I'm flying to Bali on Monday." } } });
    });

    const response = await POST(await request(audio));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ text: "I'm flying to Bali on Monday." });
    expect(JSON.stringify(body)).not.toContain("secret-key");
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ "x-gladia-key": "secret-key" });
  });

  it("returns 502 when Gladia fails", async () => {
    vi.stubEnv("GLADIA_API_KEY", "secret-key");
    stubGladia(() => new Response("server error", { status: 500 }));

    const response = await POST(await request(audio));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Gladia upload failed (500)." });
  });

  it("returns 504 when Gladia does not answer in time", async () => {
    vi.stubEnv("GLADIA_API_KEY", "secret-key");
    stubGladia(() => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")));

    const response = await POST(await request(audio));

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({ error: "Transcription took too long." });
  });

  it("returns 400 without audio", async () => {
    vi.stubEnv("GLADIA_API_KEY", "secret-key");
    const fetchMock = stubGladia(() => Response.json({}));

    const response = await POST(await request());

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 503 when the key is missing", async () => {
    vi.stubEnv("GLADIA_API_KEY", "");
    const response = await POST(await request(audio));
    expect(response.status).toBe(503);
  });

  it("requires a content length for multipart uploads", async () => {
    const requestWithoutLength = new Request("http://localhost/api/voice/transcribe", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=test" },
      body: "--test--",
    });
    expect(requestWithoutLength.headers.has("content-length")).toBe(false);
    const response = await POST(requestWithoutLength);
    expect(response.status).toBe(411);
    expect(await response.json()).toEqual({ error: "Length required." });
  });
});
