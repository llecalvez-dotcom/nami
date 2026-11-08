export const SILENCE_MS = 1500;
export const NO_SPEECH_MS = 12_000;
// A click or a door is one level alone; a voice, even a short « oui », is at least two close together.
export const SPEECH_MIN_HITS = 2;
const SPEECH_GAP_MS = 400;

export function rms(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

type Options = { silenceMs?: number; minLevel?: number; ratio?: number };

// Fed with the microphone level every ~100 ms; says when the user has spoken and then stayed quiet for silenceMs.
// The threshold follows the room: the quiet moments of the last 6 s, times ratio, never under minLevel. Measured in the
// hackathon room on 2026-11-08: Mac's microphone, quiet 0.024 and voice up to 0.15; wired EarPods, quiet 0.003 and voice
// up to 0.085. The quietest level ever heard would not do: one instant of digital silence made the whole room a "voice".
const ROOM_WINDOW = 60;
const DIGITAL_SILENCE = 0.001;
export function createSilenceDetector({ silenceMs = SILENCE_MS, minLevel = 0.006, ratio = 3 }: Options = {}) {
  const recent: number[] = [];
  let heard = false;
  let hits = 0;
  let lastHit: number | null = null;
  let quietSince: number | null = null;
  const detector = (level: number, now: number): boolean => {
    if (level >= DIGITAL_SILENCE) recent.push(level);
    if (recent.length > ROOM_WINDOW) recent.shift();
    const room = [...recent].sort((a, b) => a - b)[Math.floor(recent.length * 0.1)] ?? level;
    if (level > Math.max(minLevel, room * ratio)) {
      hits = lastHit !== null && now - lastHit > SPEECH_GAP_MS ? 1 : hits + 1;
      lastHit = now;
      if (hits >= SPEECH_MIN_HITS) heard = true;
      quietSince = null;
      return false;
    }
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
