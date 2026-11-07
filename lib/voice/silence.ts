export const SILENCE_MS = 1500;

export function rms(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

type Options = { silenceMs?: number; minLevel?: number; ratio?: number };

// Fed with the microphone level every ~100 ms; says when the user has spoken and then stayed quiet for silenceMs.
// The threshold follows the room: the quietest level heard so far, times ratio, never under minLevel.
export function createSilenceDetector({ silenceMs = SILENCE_MS, minLevel = 0.015, ratio = 2.5 }: Options = {}) {
  let floor: number | null = null;
  let heard = false;
  let quietSince: number | null = null;
  return (level: number, now: number): boolean => {
    floor = floor === null || level < floor ? level : floor + (level - floor) * 0.01;
    if (level > Math.max(minLevel, floor * ratio)) {
      heard = true;
      quietSince = null;
      return false;
    }
    if (!heard) return false;
    quietSince ??= now;
    return now - quietSince >= silenceMs;
  };
}
