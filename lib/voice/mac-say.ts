import { spawn, type ChildProcess } from "node:child_process";

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

// Resolves once the line has been said (true) or could not be (false).
export function say(text: string, language: string, run: typeof spawn = spawn): Promise<boolean> {
  stopSaying();
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
