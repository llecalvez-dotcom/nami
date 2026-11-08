import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { elevenLabsFile, macSayEnabled, MAX_SAY_CHARS, say, sayArgs, streamPlayer, voiceCachePath } from "@/lib/voice/mac-say";

describe("Nami's voice through the Mac's speakers", () => {
  it("is local only: never in production nor off a Mac", () => {
    expect(macSayEnabled({ NODE_ENV: "development" }, "darwin")).toBe(true);
    expect(macSayEnabled({ NODE_ENV: "production" }, "darwin")).toBe(false);
    expect(macSayEnabled({ NODE_ENV: "development" }, "linux")).toBe(false);
    expect(macSayEnabled({ NODE_ENV: "development", NAMI_MAC_VOICE: "off" }, "darwin")).toBe(false);
  });

  it("passes the text as one argument after --, with the voice of the language, never through a shell", () => {
    expect(sayArgs("Bonjour; rm -rf ~", "fr")).toEqual(["-v", "Thomas", "--", "Bonjour; rm -rf ~"]);
    expect(sayArgs("-v Evil", "xx")).toEqual(["--", "-v Evil"]);
    expect(sayArgs("a".repeat(MAX_SAY_CHARS + 50), "en")[3]).toHaveLength(MAX_SAY_CHARS);
  });

  it("answers once the line is said (macOS voice without an ElevenLabs key)", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
    const run = vi.fn(() => {
      setTimeout(() => child.emit("close", 0), 1);
      return child;
    });
    expect(await say("Oui", "fr", run as never)).toBe(true);
    expect(run).toHaveBeenCalledWith("say", ["-v", "Thomas", "--", "Oui"], { stdio: "ignore" });
  });
});

describe("ElevenLabs voice", () => {
  const env = { ELEVENLABS_API_KEY: "fictitious-key" };

  it("fetches a line once with the Reels' voice and the turbo model, then plays it from the cache", async () => {
    const text = `Bonjour ${Date.now()}`;
    const file = voiceCachePath(text, "fr", "eleven_v4_turbo", "XrExE9yKIg1WjnnlVkGX");
    rmSync(file, { force: true });
    const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    expect(await elevenLabsFile(text, "fr", env, fetcher as never)).toBe(file);
    expect(existsSync(file)).toBe(true);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/v1/text-to-speech/XrExE9yKIg1WjnnlVkGX");
    expect(JSON.parse(String(init.body))).toMatchObject({ text, model_id: "eleven_v4_turbo" });
    expect(await elevenLabsFile(text, "fr", env, fetcher as never)).toBe(file);
    expect(fetcher).toHaveBeenCalledTimes(1);
    rmSync(file, { force: true });
  });

  it("falls back (null) without a key or when ElevenLabs refuses", async () => {
    const fetcher = vi.fn(async () => new Response("no", { status: 401 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await elevenLabsFile("Salut", "fr", {}, fetcher as never)).toBeNull();
    expect(await elevenLabsFile(`Salut ${Date.now()}`, "fr", env, fetcher as never)).toBeNull();
  });

  it("finds sox's play to stream, unless turned off", () => {
    expect(streamPlayer({}, (path) => path === "/opt/homebrew/bin/play")).toBe("/opt/homebrew/bin/play");
    expect(streamPlayer({ NAMI_STREAM_PLAYER: "off" }, () => true)).toBeNull();
    expect(streamPlayer({}, () => false)).toBeNull();
  });

  function fakePlayer() {
    const written: number[] = [];
    const stdin = Object.assign(new EventEmitter(), { write: vi.fn((chunk: Uint8Array) => { written.push(...chunk); return true; }), end: vi.fn() });
    const child = Object.assign(new EventEmitter(), { kill: vi.fn(), stdin });
    stdin.end.mockImplementation(() => setTimeout(() => child.emit("close", 0), 1));
    const run = vi.fn(() => child);
    return { run, written };
  }

  it("plays a new line while it streams in, from the /stream endpoint, then caches it", async () => {
    const text = `Stream ${Date.now()}`;
    const file = voiceCachePath(text, "fr", "eleven_v4_turbo", "XrExE9yKIg1WjnnlVkGX");
    rmSync(file, { force: true });
    const { run, written } = fakePlayer();
    const fetcher = vi.fn(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array([1, 2])); controller.enqueue(new Uint8Array([3])); controller.close(); },
    }), { status: 200 }));
    expect(await say(text, "fr", run as never, fetcher as never, env, "/opt/homebrew/bin/play")).toBe(true);
    expect((fetcher.mock.calls[0] as unknown as [string])[0]).toContain("/v1/text-to-speech/XrExE9yKIg1WjnnlVkGX/stream");
    expect(run).toHaveBeenCalledWith("/opt/homebrew/bin/play", ["-q", "-t", "mp3", "-"], { stdio: ["pipe", "ignore", "ignore"] });
    expect(written).toEqual([1, 2, 3]);
    expect(existsSync(file)).toBe(true);
    const replay = vi.fn(() => {
      const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
      setTimeout(() => child.emit("close", 0), 1);
      return child;
    });
    expect(await say(text, "fr", replay as never, fetcher as never, env, "/opt/homebrew/bin/play")).toBe(true);
    expect(replay).toHaveBeenCalledWith("afplay", [file], { stdio: "ignore" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    rmSync(file, { force: true });
  });

  it("falls back to the macOS voice when ElevenLabs refuses the stream and the file", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetcher = vi.fn(async () => new Response("no", { status: 500 }));
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
    const run = vi.fn(() => {
      setTimeout(() => child.emit("close", 0), 1);
      return child;
    });
    expect(await say(`Refus ${Date.now()}`, "fr", run as never, fetcher as never, env, "/opt/homebrew/bin/play")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((run.mock.calls[0] as unknown as [string])[0]).toBe("say");
  });
});
