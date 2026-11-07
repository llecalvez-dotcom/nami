import { describe, expect, it, vi } from "vitest";
import type { CompleteJson } from "@/lib/llm";
import { TranslateInputSchema, translateTexts } from "@/lib/translate";

describe("translateTexts", () => {
  it("returns English unchanged without calling the model", async () => {
    const complete = vi.fn();
    expect(await translateTexts({ language: "en", texts: ["Hello"] }, complete)).toEqual(["Hello"]);
    expect(complete).not.toHaveBeenCalled();
  });

  it("returns one translation per text, in order", async () => {
    const complete = vi.fn<CompleteJson>(async () => JSON.stringify({ translations: ["Bonjour", "Oui"] }));
    expect(await translateTexts({ language: "fr", texts: ["Hello", "Yes"] }, complete)).toEqual(["Bonjour", "Oui"]);
    expect(JSON.parse(complete.mock.calls[0]![0].user)).toEqual({ language: "fr", texts: ["Hello", "Yes"] });
  });

  it("refuses a model answer that does not match the texts", async () => {
    const complete = vi.fn(async () => JSON.stringify({ translations: ["Bonjour"] }));
    await expect(translateTexts({ language: "fr", texts: ["Hello", "Yes"] }, complete)).rejects.toThrow();
  });

  it("accepts only a language code and a bounded list", () => {
    expect(TranslateInputSchema.safeParse({ language: "fr-FR", texts: ["a"] }).success).toBe(false);
    expect(TranslateInputSchema.safeParse({ language: "fr", texts: [] }).success).toBe(false);
  });
});
