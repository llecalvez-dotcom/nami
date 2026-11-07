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

export function macSayEnabled(env: Record<string, string | undefined> = process.env, platform = process.platform): boolean {
  return env.NODE_ENV !== "production" && platform === "darwin" && env.NAMI_MAC_VOICE !== "off";
}

export function sayArgs(text: string, language: string): string[] {
  const voice = VOICES[language];
  return [...(voice ? ["-v", voice] : []), "--", text.slice(0, MAX_SAY_CHARS)];
}

export function stopSaying() {
  current?.kill();
  current = null;
}

// ElevenLabs, chosen by Nathan (2026-11-07: the macOS voice is "extremely robotic"); Gladia only transcribes.
// Model and voice of his Reels (eleven_v4, Matilda). Each line is fetched once, then played from a local cache:
// repeated demo runs cost nothing. Without a key, or if ElevenLabs fails, the macOS voice speaks instead.
export const ELEVENLABS_DEFAULTS = { model: "eleven_v4", voice: "XrExE9yKIg1WjnnlVkGX" };

export function voiceCachePath(text: string, language: string, model: string, voice: string): string {
  const key = createHash("sha256").update([model, voice, language, text].join("\u0000")).digest("hex");
  return join(tmpdir(), "nami-voice", `${key}.mp3`);
}

export async function elevenLabsFile(text: string, language: string, env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch): Promise<string | null> {
  const apiKey = env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  const model = env.ELEVENLABS_MODEL || ELEVENLABS_DEFAULTS.model;
  const voice = env.ELEVENLABS_VOICE_ID || ELEVENLABS_DEFAULTS.voice;
  const file = voiceCachePath(text, language, model, voice);
  if (existsSync(file)) return file;
  try {
    const response = await fetcher(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: text.slice(0, MAX_SAY_CHARS), model_id: model, voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.25 } }),
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

// Resolves once the line has been said (true) or could not be (false).
export async function say(text: string, language: string, run: typeof spawn = spawn, fetcher: typeof fetch = fetch): Promise<boolean> {
  stopSaying();
  const file = await elevenLabsFile(text, language, process.env, fetcher);
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
