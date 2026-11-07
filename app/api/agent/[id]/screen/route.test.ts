import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/agent/[id]/screen/route";
import { GET as changes } from "@/app/api/agent/[id]/changes/route";
import { POST as cancel } from "@/app/api/agent/[id]/cancel/route";
import { captureAgentScreen, finishAgentScreen, resetAgentScreens, SCREEN_MAX_BYTES } from "@/lib/agent-screen";
import { resetGuards } from "@/lib/api-guard";
import type { HChanges } from "@/lib/h-agent";

const SOURCE = "https://agp.eu.hcompany.ai/screens/fictitious.png?token=PRIVATE_URL_MARKER";
const BYTES = new TextEncoder().encode("fictitious screenshot bytes");
const ctx = (id = "s-1") => ({ params: Promise.resolve({ id }) });
const request = () => new Request("http://localhost/api/agent/s-1/screen?t=123");
const get = (id = "s-1") => GET(request(), ctx(id));
const event = (source = SOURCE, type = "url", media_type = "image/png") => ({
  type: "AgentEvent", data: { kind: "observation_event", image: { type, source, media_type }, metadata: { url: "https://evisa.imigrasi.go.id/form" } },
});
function remember(source = SOURCE, type = "url", media_type = "image/png") {
  const changes: HChanges = {
    status: "running", started_at: null, finished_at: null, error: null, error_code: null, outcome: null,
    answer: null, metrics: null, first_index: 0, pending_tool_calls: [], new_events: [event(source, type, media_type)],
  };
  captureAgentScreen("s-1", changes);
}

let fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>;
beforeEach(() => {
  resetAgentScreens(); resetGuards();
  vi.stubEnv("HAI_API_KEY", "fictitious-key");
  fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response(BYTES, { headers: { "Content-Type": "image/png" } }));
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => { resetAgentScreens(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("private screen route", () => {
  it("returns 404 with no cache when none exists and rejects invalid session ids", async () => {
    const missing = await get();
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Cache-Control")).toBe("no-store");
    expect((await get("../invalid")).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches H images with the key and returns only private image bytes", async () => {
    remember();
    const response = await get();
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BYTES);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Location")).toBeNull();
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer fictitious-key");
    expect(fetch.mock.calls[0][1]?.redirect).toBe("manual");
  });

  it.each(["http://agp.eu.hcompany.ai/image", "https://hcompany.ai.evil.example/image", "https://evil.example/image",
    "https://hcompany.ai@evil.example/image", "https://user@hcompany.ai/image", "file:///private/image.png", "https://hcompany.ai:444/image"])(
    "refuses untrusted initial source %s without sending a key", async (source) => {
      remember(source);
      expect((await get()).status).toBe(404);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("follows relative H redirects but never forwards the key to a presigned non-H URL", async () => {
    remember();
    fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "/download/next" } }))
      .mockResolvedValueOnce(new Response(null, { status: 307, headers: { Location: "https://storage.example.com/image?signature=SPECIMEN" } }));
    expect((await get()).status).toBe(200);
    expect(new Headers(fetch.mock.calls[1][1]?.headers).get("Authorization")).toBe("Bearer fictitious-key");
    expect(new Headers(fetch.mock.calls[2][1]?.headers).has("Authorization")).toBe(false);
    expect(fetch.mock.calls.every(([, init]) => init?.redirect === "manual")).toBe(true);
  });

  it.each(["http://storage.example.com/image", "https://127.0.0.1/image", "https://localhost/image", "https://user:pass@storage.example.com/image"])(
    "does not follow unsafe redirect %s", async (location) => {
      remember();
      fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: location } }));
      expect((await get()).status).toBe(502);
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it("bounds redirects", async () => {
    remember();
    fetch.mockImplementation(async () => new Response(null, { status: 302, headers: { Location: SOURCE } }));
    expect((await get()).status).toBe(502);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it.each(["image/png", "image/jpeg", "image/webp"])("serves inline %s without contacting H", async (mediaType) => {
    remember(Buffer.from(BYTES).toString("base64"), "base64", mediaType);
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(mediaType);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BYTES);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["text/html", "image/svg+xml", "application/octet-stream"])("refuses upstream content type %s", async (type) => {
    remember();
    fetch.mockResolvedValueOnce(new Response("not a screenshot", { headers: { "Content-Type": type } }));
    const response = await get();
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "Screen unavailable." });
  });

  it("caps both declared and streamed image sizes", async () => {
    remember();
    fetch.mockResolvedValueOnce(new Response(BYTES, { headers: { "Content-Type": "image/png", "Content-Length": String(SCREEN_MAX_BYTES + 1) } }));
    expect((await get()).status).toBe(413);
    let cancelled = false;
    fetch.mockResolvedValueOnce(new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(SCREEN_MAX_BYTES + 1)); },
      cancel() { cancelled = true; },
    }), { headers: { "Content-Type": "image/png" } }));
    expect((await get()).status).toBe(413);
    expect(cancelled).toBe(true);
  });

  it.each(["not base64!", "", "A".repeat(Math.ceil(SCREEN_MAX_BYTES / 3) * 4 + 4)])("refuses malformed or oversized inline data", async (source) => {
    remember(source, "base64");
    expect((await get()).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never logs or returns the URL or key on upstream errors and permits a final-fetch retry", async () => {
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    remember(); finishAgentScreen("s-1");
    fetch.mockRejectedValueOnce(new Error(`${SOURCE} fictitious-key`));
    const failed = await get();
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "Screen unavailable." });
    expect((await get()).status).toBe(200);
    expect((await get()).status).toBe(404);
    expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });

  it("uses a separate bounded guard for screen polling", async () => {
    remember(Buffer.from(BYTES).toString("base64"), "base64");
    for (let i = 0; i < 180; i++) expect((await get()).status).toBe(200);
    const limited = await get();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Cache-Control")).toBe("no-store");
  });

  it.each(["url", "base64"])("captures %s screenshots from changes without forwarding sources or raw events", async (type) => {
    const source = type === "url" ? SOURCE : Buffer.from(BYTES).toString("base64");
    fetch.mockResolvedValueOnce(Response.json({ status: "running", new_events: [event(source, type)], first_index: 0 }));
    const response = await changes(new Request("http://localhost/api/agent/s-1/changes"), ctx());
    const body = await response.text();
    expect(body).not.toContain(source); expect(body).not.toContain("new_events"); expect(body).not.toContain('"image"');
    expect((await get()).status).toBe(200);
  });

  it("clears pixels after the last fetch following a successful cancel", async () => {
    remember(Buffer.from(BYTES).toString("base64"), "base64");
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect((await cancel(new Request("http://localhost/api/agent/s-1/cancel", { method: "POST" }), ctx())).status).toBe(200);
    expect((await get()).status).toBe(200);
    expect((await get()).status).toBe(404);
  });
});
