import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Nami's voice through the Mac's own speakers (macOS `say`), when Nami runs on the demo laptop. The browser refused
// speechSynthesis in the side panel (2026-11-07: "not-allowed", nothing heard); a local process has no such rule.
// Local development only: never in production, never a shell (arguments only), one line at a time.

const VOICES: Record<string, string> = {
  fr: "Thomas",
  en: "Samantha",
  es: "Mónica",
  de: "Anna",
  it: "Alice",
  pt: "Joana",
  nl: "Ellen",
  id: "Damayanti",
};

export const MAX_SAY_CHARS = 600;
let current: ChildProcess | null = null;
let currentRequest: AbortController | null = null;

export function macSayEnabled(env: Record<string, string | undefined> = process.env, platform = process.platform): boolean {
  return env.NODE_ENV !== "production" && platform === "darwin" && env.NAMI_MAC_VOICE !== "off";
}

export function sayArgs(text: string, language: string): string[] {
  const voice = VOICES[language];
  return [...(voice ? ["-v", voice] : []), "--", text.slice(0, MAX_SAY_CHARS)];
}

export function stopSaying() {
  currentRequest?.abort();
  currentRequest = null;
  current?.kill();
  current = null;
}

// ElevenLabs, chosen by Nathan (2026-11-07: the macOS voice is "extremely robotic"); Gladia only transcribes.
// Voice of his Reels (Matilda). Model eleven_v4_turbo since 2026-11-08 (Nathan's go): measured that night, the first
// audio byte came after 0.12 s streamed, against 1.92 s with eleven_v4 unstreamed. Each line is played while it streams
// in (sox's play reads mp3 from stdin), kept in a local cache, then replayed from it: repeated demo runs cost nothing.
// Without a key, or if ElevenLabs fails, the macOS voice speaks instead.
export const ELEVENLABS_DEFAULTS = { model: "eleven_v4_turbo", voice: "XrExE9yKIg1WjnnlVkGX" };
const VOICE_SETTINGS = { stability: 0.4, similarity_boost: 0.75, style: 0.25 };
const PLAYERS = ["/opt/homebrew/bin/play", "/usr/local/bin/play"];

export function voiceCachePath(text: string, language: string, model: string, voice: string): string {
  const key = createHash("sha256").update([model, voice, language, text].join("\u0000")).digest("hex");
  return join(tmpdir(), "nami-voice", `${key}.mp3`);
}

function elevenLabsSettings(env: Record<string, string | undefined>) {
  return { apiKey: env.ELEVENLABS_API_KEY, model: env.ELEVENLABS_MODEL || ELEVENLABS_DEFAULTS.model, voice: env.ELEVENLABS_VOICE_ID || ELEVENLABS_DEFAULTS.voice };
}

// sox's play, which plays an mp3 while it arrives on stdin; null when absent or turned off (NAMI_STREAM_PLAYER=off).
export function streamPlayer(env: Record<string, string | undefined> = process.env, exists: (path: string) => boolean = existsSync): string | null {
  if (env.NAMI_STREAM_PLAYER === "off") return null;
  return PLAYERS.find((path) => exists(path)) ?? null;
}

export async function elevenLabsFile(text: string, language: string, env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch): Promise<string | null> {
  const { apiKey, model, voice } = elevenLabsSettings(env);
  if (!apiKey) return null;
  const file = voiceCachePath(text, language, model, voice);
  if (existsSync(file)) return file;
  try {
    const response = await fetcher(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: text.slice(0, MAX_SAY_CHARS), model_id: model, voice_settings: VOICE_SETTINGS }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      console.error(`voice: ElevenLabs answered ${response.status}`);
      return null;
    }
    await mkdir(join(tmpdir(), "nami-voice"), { recursive: true });
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
    return file;
  } catch {
    console.error("voice: ElevenLabs unreachable");
    return null;
  }
}

function play(command: string, args: string[], run: typeof spawn): Promise<boolean> {
  return new Promise((resolve) => {
    const child = run(command, args, { stdio: "ignore" });
    current = child;
    child.on("error", () => resolve(false));
    child.on("close", (code) => {
      if (current === child) current = null;
      resolve(code === 0);
    });
  });
}

// Streams one line from ElevenLabs into the player, so the voice starts with the first bytes; the complete line is
// then cached. null when streaming is not possible (no key, no player, refused): the caller falls back to the file.
export async function streamElevenLabs(text: string, language: string, player: string, run: typeof spawn = spawn,
  env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch): Promise<boolean | null> {
  const { apiKey, model, voice } = elevenLabsSettings(env);
  if (!apiKey) return null;
  const request = new AbortController();
  currentRequest = request;
  let response: Response;
  try {
    response = await fetcher(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: text.slice(0, MAX_SAY_CHARS), model_id: model, voice_settings: VOICE_SETTINGS }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
    });
  } catch {
    if (request.signal.aborted) return false;
    console.error("voice: ElevenLabs unreachable");
    return null;
  }
  if (!response.ok || !response.body) {
    console.error(`voice: ElevenLabs answered ${response.status}`);
    await response.body?.cancel().catch(() => {});
    return null;
  }
  const child = run(player, ["-q", "-t", "mp3", "-"], { stdio: ["pipe", "ignore", "ignore"] });
  current = child;
  const closed = new Promise<boolean>((resolve) => {
    child.on("error", () => resolve(false));
    child.on("close", (code) => {
      if (current === child) current = null;
      resolve(code === 0);
    });
  });
  child.stdin?.on("error", () => {});
  const chunks: Uint8Array[] = [];
  let complete = false;
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      child.stdin?.write(value);
    }
    complete = true;
  } catch {
    // Stopped (stopSaying) or cut: what was received is played, nothing is cached.
  } finally {
    child.stdin?.end();
    if (currentRequest === request) currentRequest = null;
  }
  const spoken = await closed;
  if (complete && chunks.length > 0) {
    const file = voiceCachePath(text, language, model, voice);
    await mkdir(join(tmpdir(), "nami-voice"), { recursive: true }).catch(() => {});
    await writeFile(file, Buffer.concat(chunks)).catch(() => {});
  }
  return spoken;
}

// Resolves once the line has been said (true) or could not be (false).
export async function say(text: string, language: string, run: typeof spawn = spawn, fetcher: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env, player: string | null = streamPlayer(env)): Promise<boolean> {
  stopSaying();
  const { apiKey, model, voice } = elevenLabsSettings(env);
  const cached = voiceCachePath(text, language, model, voice);
  if (apiKey && existsSync(cached)) return play("afplay", [cached], run);
  if (apiKey && player) {
    const streamed = await streamElevenLabs(text, language, player, run, env, fetcher);
    if (streamed !== null) return streamed;
  }
  const file = await elevenLabsFile(text, language, env, fetcher);
  if (file) return play("afplay", [file], run);
  return sayWithMac(text, language, run);
}

function sayWithMac(text: string, language: string, run: typeof spawn): Promise<boolean> {
  return new Promise((resolve) => {
    const child = run("say", sayArgs(text, language), { stdio: "ignore" });
    current = child;
    child.on("error", () => resolve(false));
    child.on("close", (code) => {
      if (current === child) current = null;
      resolve(code === 0);
    });
  });
}
