import type { SpeechQueue } from "@/lib/voice/speech-queue";

// A real conversation (Nathan, 2026-11-08): the microphone opens by itself once Nami has finished her sentence.
// PR #87 had removed this because the microphone heard the speakers and noise changed the language. So: a short pause
// after the voice, a microphone that closes quietly when nobody speaks (lib/voice/silence.ts), and a longer sentence
// needed to change the language (lib/voice/language.ts). NEXT_PUBLIC_NAMI_AUTO_MIC=off goes back to a tap only.
export const LISTEN_PAUSE_MS = 400;

export function autoListenEnabled(value: string | undefined = process.env.NEXT_PUBLIC_NAMI_AUTO_MIC): boolean {
  return value !== "off";
}

export function listenAfterSpeech(
  queue: Pick<SpeechQueue, "onSpoken" | "speaking">,
  itemId: string,
  start: (mode: "auto") => void | Promise<void>,
  pauseMs = LISTEN_PAUSE_MS,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const leave = queue.onSpoken((id) => {
    if (id !== itemId) return;
    timer = setTimeout(() => {
      if (queue.speaking() === null) void start("auto");
    }, pauseMs);
  });
  return () => {
    leave();
    clearTimeout(timer);
  };
}
