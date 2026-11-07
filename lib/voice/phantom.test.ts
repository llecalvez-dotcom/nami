import { describe, expect, it } from "vitest";
import { isPhantomTranscript } from "@/lib/voice/phantom";

describe("phantom transcripts", () => {
  it.each(["Thank you.", "thank you", "Merci.", "Thanks for watching!", "  .  "])("drops %j heard on silence", (text) => {
    expect(isPhantomTranscript(text)).toBe(true);
  });

  it.each(["Oui", "Yes", "Thank you, yes that's right", "Je pars à Bali lundi."])("keeps a real answer: %j", (text) => {
    expect(isPhantomTranscript(text)).toBe(false);
  });
});
