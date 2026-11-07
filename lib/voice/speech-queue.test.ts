import { describe, expect, it, vi } from "vitest";
import { createSpeechQueue, type SpeechEngine } from "@/lib/voice/speech-queue";

function fakeEngine() {
  const spoken: string[] = [];
  let finish: (() => void) | null = null;
  const engine: SpeechEngine = {
    speak: vi.fn((text: string, done: () => void) => {
      spoken.push(text);
      finish = done;
    }),
    cancel: vi.fn(() => {
      const done = finish;
      finish = null;
      done?.(); // browsers fire onend or onerror on cancel
    }),
  };
  return { engine, spoken, end: () => finish?.() };
}

describe("speech queue", () => {
  it("reads two items that arrive together one after the other", () => {
    const { engine, spoken, end } = fakeEngine();
    const queue = createSpeechQueue(engine);
    const heard = vi.fn();
    queue.onSpoken(heard);

    queue.enqueue("1", "Bali, Monday to Friday.");
    queue.enqueue("2", "When do you land in Bali?");
    expect(spoken).toEqual(["Bali, Monday to Friday."]);
    expect(queue.speaking()).toBe("1");

    end();
    expect(heard).toHaveBeenCalledWith("1");
    expect(spoken).toEqual(["Bali, Monday to Friday.", "When do you land in Bali?"]);

    end();
    expect(heard).toHaveBeenLastCalledWith("2");
    expect(queue.speaking()).toBeNull();
  });

  it("stops reading on Mute and stays silent until unmuted", () => {
    const { engine, spoken } = fakeEngine();
    const queue = createSpeechQueue(engine);
    const heard = vi.fn();
    queue.onSpoken(heard);
    queue.enqueue("1", "First");
    queue.enqueue("2", "Second");

    queue.setMuted(true);
    expect(engine.cancel).toHaveBeenCalledTimes(1);
    expect(queue.speaking()).toBeNull();
    expect(heard).not.toHaveBeenCalled();

    queue.enqueue("3", "Third");
    expect(spoken).toEqual(["First"]);

    queue.setMuted(false);
    queue.enqueue("4", "Fourth");
    expect(spoken).toEqual(["First", "Fourth"]);
  });

  it("starts muted when Mute was saved", () => {
    const { engine } = fakeEngine();
    const queue = createSpeechQueue(engine, true);
    queue.enqueue("1", "Hello");
    expect(engine.speak).not.toHaveBeenCalled();
    expect(queue.isMuted()).toBe(true);
  });

  it("clear drops what is waiting without announcing it as read", () => {
    const { engine, spoken } = fakeEngine();
    const queue = createSpeechQueue(engine);
    const heard = vi.fn();
    queue.onSpoken(heard);
    queue.enqueue("1", "First");
    queue.enqueue("2", "Second");
    queue.clear();
    expect(heard).not.toHaveBeenCalled();
    queue.enqueue("3", "Third");
    expect(spoken).toEqual(["First", "Third"]);
  });
});

describe("microphone after a line", () => {
  it("opens the card's microphone only after a line really heard", async () => {
    const { createSpeechQueue } = await import("@/lib/voice/speech-queue");
    let finish: (spoken?: boolean) => void = () => {};
    const queue = createSpeechQueue({ speak: (_text, done) => { finish = done; }, cancel: () => {} });
    const heard: string[] = [];
    queue.onSpoken((id) => heard.push(id));
    queue.enqueue("a", "Shall I read it?");
    finish(false);
    queue.enqueue("b", "Is that right?");
    finish(true);
    expect(heard).toEqual(["b"]);
  });

  it("tells when a line starts and ends, for the panel's wave", () => {
    const { engine, end } = fakeEngine();
    const queue = createSpeechQueue(engine);
    const states: (string | null)[] = [];
    queue.onChange(() => states.push(queue.speaking()));

    queue.enqueue("1", "Shall I fill in your visa?");
    end();
    queue.enqueue("2", "I am looking for your passport.");
    queue.clear();
    expect(states).toEqual(["1", null, "2", null]);
  });
});
