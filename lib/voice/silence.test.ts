import { describe, expect, it } from "vitest";
import { createSilenceDetector, rms, SILENCE_MS } from "@/lib/voice/silence";

function feed(levels: [number, number][]) {
  const silent = createSilenceDetector();
  return levels.map(([level, ms]) => silent(level, ms));
}

describe("silence detector", () => {
  it("stops 1.5 s after the user stops speaking", () => {
    const quiet = 0.005;
    const voice = 0.2;
    const results = feed([
      [quiet, 0],
      [voice, 100],
      [voice, 600],
      [quiet, 700],
      [quiet, 700 + SILENCE_MS - 100],
      [quiet, 700 + SILENCE_MS],
    ]);
    expect(results).toEqual([false, false, false, false, false, true]);
  });

  it("never stops before the user has said anything", () => {
    expect(feed([[0.005, 0], [0.004, 2000], [0.005, 5000]])).toEqual([false, false, false]);
  });

  it("hears a quiet voice through a distant microphone", () => {
    const silent = createSilenceDetector();
    silent(0.002, 0);
    silent(0.01, 100);
    silent(0.01, 200);
    silent(0.01, 300);
    expect(silent.heard()).toBe(true);
  });

  it("does not take a short noise for someone speaking", () => {
    const silent = createSilenceDetector();
    silent(0.002, 0);
    silent(0.2, 100);
    silent(0.002, 200);
    expect(silent.heard()).toBe(false);
    expect(silent(0.002, 2_000)).toBe(false);
  });

  it("a new word resets the silence", () => {
    const results = feed([
      [0.005, 0],
      [0.2, 100],
      [0.2, 300],
      [0.005, 400],
      [0.2, 1500],
      [0.005, 1600],
      [0.005, 3000],
      [0.005, 3100],
    ]);
    expect(results.at(-2)).toBe(false);
    expect(results.at(-1)).toBe(true);
  });

  it("measures the level", () => {
    expect(rms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5);
    expect(rms(new Float32Array())).toBe(0);
  });
});
