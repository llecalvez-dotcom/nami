import { z } from "zod";
import type { CompleteJson } from "@/lib/llm";

// Nami's texts are written in English; the traveller hears and reads them in the language they speak.
export const TranslateInputSchema = z.object({
  language: z.string().regex(/^[a-z]{2,3}$/),
  texts: z.array(z.string().max(1000)).min(1).max(40),
});
export type TranslateInput = z.infer<typeof TranslateInputSchema>;

const SYSTEM = `You translate the short messages of a travel assistant into the language given by its ISO 639-1 code.
Keep the same meaning and tone, short and friendly. Never translate: names of people, official site names and domains,
form names (e-VOA, All Indonesia), button labels written in quotes, codes, numbers, dates and times written with digits.
Return one translation per input text, under the same key (t0, t1…).`;

export async function translateTexts(input: TranslateInput, complete: CompleteJson): Promise<string[]> {
  if (input.language === "en") return input.texts;
  // One key per text (t0, t1…) rather than an array: with an array schema, the H model's constrained decoding never
  // finished (two timeouts on 2026-11-07, even for a single short text).
  const keys = input.texts.map((_, i) => `t${i}`);
  const raw = await complete({
    system: SYSTEM,
    user: JSON.stringify({ language: input.language, texts: Object.fromEntries(keys.map((key, i) => [key, input.texts[i]])) }),
    schema: {
      type: "object",
      properties: Object.fromEntries(keys.map((key) => [key, { type: "string" }])),
      required: keys,
      additionalProperties: false,
    },
  });
  const parsed = z.record(z.string(), z.string()).safeParse(JSON.parse(raw));
  if (!parsed.success || keys.some((key) => typeof parsed.data[key] !== "string")) throw new Error("The translation did not match the texts.");
  return keys.map((key) => parsed.data[key]);
}
