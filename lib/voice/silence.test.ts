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
      [voice, 400],
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

  it("hears a word as short as « oui », and ends after its silence", () => {
    const silent = createSilenceDetector();
    silent(0.003, 0);
    silent(0.08, 100);
    silent(0.05, 200);
    silent(0.003, 300);
    expect(silent.heard()).toBe(true);
    expect(silent(0.003, 300 + SILENCE_MS)).toBe(true);
  });

  describe("levels measured on the Mac's own microphone in the hackathon room (2026-11-08)", () => {
    const noise = (i: number) => [0.03, 0.024, 0.045, 0.028, 0.035][i % 5];
    const voice = (i: number) => [0.15, 0.06, 0.2, 0.09, 0.12, 0.05][i % 6];

    it("does not take the room for someone speaking", () => {
      const silent = createSilenceDetector();
      for (let i = 0; i < 80; i += 1) silent(noise(i), i * 100);
      expect(silent.heard()).toBe(false);
    });

    it("hears the sentence and ends 1.5 s after it, although the room stays noisy", () => {
      const silent = createSilenceDetector();
      let now = 0;
      for (let i = 0; i < 10; i += 1, now += 100) silent(noise(i), now);
      for (let i = 0; i < 40; i += 1, now += 100) expect(silent(voice(i), now)).toBe(false);
      expect(silent.heard()).toBe(true);
      const lastLoud = now - 200;
      let ended = -1;
      for (let i = 0; i < 40 && ended < 0; i += 1, now += 100) if (silent(noise(i), now)) ended = now;
      expect(ended - lastLoud).toBeLessThanOrEqual(SILENCE_MS + 400);
      expect(ended).toBeGreaterThan(0);
    });

    it("a momentary digital silence does not make the room count as a voice", () => {
      const silent = createSilenceDetector();
      silent(0.0005, 0);
      for (let i = 1; i < 60; i += 1) silent(noise(i), i * 100);
      expect(silent.heard()).toBe(false);
    });
  });

  it("does not add up noises far apart", () => {
    const silent = createSilenceDetector();
    silent(0.003, 0);
    silent(0.2, 100);
    silent(0.003, 200);
    silent(0.2, 2_000);
    expect(silent.heard()).toBe(false);
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
