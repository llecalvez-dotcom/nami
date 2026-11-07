import { describe, expect, it } from "vitest";
import { languageToKeep } from "@/lib/voice/language";

describe("the language Nami answers in", () => {
  it("follows a sentence of 3 words or more", () => {
    expect(languageToKeep("Je pars à Bali lundi", "fr")).toBe("fr");
    expect(languageToKeep("Me voy a Bali", "es")).toBe("es");
  });

  it("is not changed by a short answer, whatever Gladia guessed", () => {
    expect(languageToKeep("oui", "ms")).toBeNull();
    expect(languageToKeep("Oui, vas-y", "it")).toBeNull();
    expect(languageToKeep("  ok  ", "tl")).toBeNull();
    expect(languageToKeep("12 3 4", "en")).toBeNull();
  });
});
