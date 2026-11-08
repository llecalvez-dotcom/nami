export const SILENCE_MS = 1500;
export const NO_SPEECH_MS = 12_000;
// A voice lasts: a click or a door is not someone who has started to speak.
export const SPEECH_MIN_MS = 200;

export function rms(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

type Options = { silenceMs?: number; minLevel?: number; ratio?: number };

// Fed with the microphone level every ~100 ms; says when the user has spoken and then stayed quiet for silenceMs.
// The threshold follows the room: the quietest level heard so far, times ratio, never under minLevel.
// minLevel 0.006: at 0.015 a voice through wired EarPods stayed under it and was never heard (Nathan, 2026-11-08).
export function createSilenceDetector({ silenceMs = SILENCE_MS, minLevel = 0.006, ratio = 2.5 }: Options = {}) {
  let floor: number | null = null;
  let heard = false;
  let voiceSince: number | null = null;
  let quietSince: number | null = null;
  const detector = (level: number, now: number): boolean => {
    floor = floor === null || level < floor ? level : floor + (level - floor) * 0.01;
    if (level > Math.max(minLevel, floor * ratio)) {
      voiceSince ??= now;
      if (now - voiceSince >= SPEECH_MIN_MS) heard = true;
      quietSince = null;
      return false;
    }
    voiceSince = null;
    if (!heard) return false;
    quietSince ??= now;
    return now - quietSince >= silenceMs;
  };
  return Object.assign(detector, { heard: () => heard });
}

// A microphone that opened by itself: "nothing" when nobody has spoken for noSpeechMs, so it closes without transcribing.
export function createAutoListenWatcher(noSpeechMs = NO_SPEECH_MS, options: Options = {}) {
  const silent = createSilenceDetector(options);
  let startedAt: number | null = null;
  return (level: number, now: number): "listening" | "silence" | "nothing" => {
    startedAt ??= now;
    if (silent(level, now)) return "silence";
    return !silent.heard() && now - startedAt >= noSpeechMs ? "nothing" : "listening";
  };
}
