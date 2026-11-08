import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { autoListenEnabled, LISTEN_PAUSE_MS, listenAfterSpeech } from "@/lib/voice/auto-listen";
import { languageToKeep, MIN_WORDS_WHEN_AUTO } from "@/lib/voice/language";
import { createAutoListenWatcher, NO_SPEECH_MS, SILENCE_MS } from "@/lib/voice/silence";

function fakeQueue() {
  const listeners = new Set<(id: string) => void>();
  let speaking: string | null = null;
  return {
    onSpoken: (listener: (id: string) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    speaking: () => speaking,
    setSpeaking: (id: string | null) => {
      speaking = id;
    },
    spoken: (id: string) => listeners.forEach((listener) => listener(id)),
  };
}

describe("the microphone opens by itself once Nami has finished", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits for a short pause after the voice, so it does not hear the speakers", () => {
    const queue = fakeQueue();
    const start = vi.fn();
    listenAfterSpeech(queue, "item-1", start);
    queue.spoken("item-1");
    vi.advanceTimersByTime(LISTEN_PAUSE_MS - 1);
    expect(start).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(start).toHaveBeenCalledWith("auto");
  });

  it("ignores the end of another line", () => {
    const queue = fakeQueue();
    const start = vi.fn();
    listenAfterSpeech(queue, "item-1", start);
    queue.spoken("agent-step");
    vi.advanceTimersByTime(LISTEN_PAUSE_MS);
    expect(start).not.toHaveBeenCalled();
  });

  it("stays closed when the item is gone during the pause, or when Nami speaks again", () => {
    const queue = fakeQueue();
    const start = vi.fn();
    const leave = listenAfterSpeech(queue, "item-1", start);
    queue.spoken("item-1");
    leave();
    vi.advanceTimersByTime(LISTEN_PAUSE_MS);
    expect(start).not.toHaveBeenCalled();

    listenAfterSpeech(queue, "item-2", start);
    queue.spoken("item-2");
    queue.setSpeaking("other-line");
    vi.advanceTimersByTime(LISTEN_PAUSE_MS);
    expect(start).not.toHaveBeenCalled();
  });

  it("can be switched off with NEXT_PUBLIC_NAMI_AUTO_MIC=off", () => {
    expect(autoListenEnabled(undefined)).toBe(true);
    expect(autoListenEnabled("on")).toBe(true);
    expect(autoListenEnabled("off")).toBe(false);
  });
});

describe("what a microphone opened by itself listens for", () => {
  const quiet = 0.005;
  const voice = 0.2;

  it("gives up quietly when nobody speaks", () => {
    const watch = createAutoListenWatcher();
    expect(watch(quiet, 0)).toBe("listening");
    expect(watch(quiet, NO_SPEECH_MS - 1)).toBe("listening");
    expect(watch(quiet, NO_SPEECH_MS)).toBe("nothing");
  });

  it("never gives up on someone who has started speaking, and ends after their silence", () => {
    const watch = createAutoListenWatcher();
    watch(quiet, 0);
    watch(voice, NO_SPEECH_MS - 500);
    watch(voice, NO_SPEECH_MS - 200);
    expect(watch(quiet, NO_SPEECH_MS + 100)).toBe("listening");
    expect(watch(quiet, NO_SPEECH_MS + 100 + SILENCE_MS - 1)).toBe("listening");
    expect(watch(quiet, NO_SPEECH_MS + 100 + SILENCE_MS)).toBe("silence");
  });

  it("needs a real sentence to change the language (noise was once heard as German)", () => {
    expect(languageToKeep("ein zwei drei", "de", MIN_WORDS_WHEN_AUTO)).toBeNull();
    expect(languageToKeep("ich möchte gerne nach Bali fliegen", "de", MIN_WORDS_WHEN_AUTO)).toBe("de");
    expect(languageToKeep("ein zwei drei", "de")).toBe("de");
  });
});
