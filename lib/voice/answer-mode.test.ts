import { describe, expect, it } from "vitest";
import { ANSWER_MODE_KEY, listensAutomatically, readAnswerMode, writeAnswerMode } from "@/lib/voice/answer-mode";

const memory = () => {
  const map = new Map<string, string>();
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value), map };
};

describe("Voice or Typing, remembered", () => {
  it("starts in Voice when nothing is stored", () => {
    expect(readAnswerMode(memory())).toBe("voice");
    expect(readAnswerMode(null)).toBe("voice");
  });

  it("keeps Typing across a reload", () => {
    const storage = memory();
    writeAnswerMode("typing", storage);
    expect(storage.map.get(ANSWER_MODE_KEY)).toBe("typing");
    expect(readAnswerMode(storage)).toBe("typing");
    writeAnswerMode("voice", storage);
    expect(readAnswerMode(storage)).toBe("voice");
  });

  it("falls back to Voice when storage fails", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => writeAnswerMode("typing", broken)).not.toThrow();
    expect(readAnswerMode(broken)).toBe("voice");
  });

  it("ignores unknown stored values", () => {
    const storage = memory();
    storage.setItem(ANSWER_MODE_KEY, "shout");
    expect(readAnswerMode(storage)).toBe("voice");
  });

  it("opens the microphone by itself in Voice only", () => {
    expect(listensAutomatically("voice")).toBe(true);
    expect(listensAutomatically("typing")).toBe(false);
  });
});
