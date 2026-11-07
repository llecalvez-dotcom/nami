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
Return exactly one translation per input text, in the same order.`;

export async function translateTexts(input: TranslateInput, complete: CompleteJson): Promise<string[]> {
  if (input.language === "en") return input.texts;
  const raw = await complete({
    system: SYSTEM,
    user: JSON.stringify({ language: input.language, texts: input.texts }),
    schema: {
      type: "object",
      properties: { translations: { type: "array", items: { type: "string" } } },
      required: ["translations"],
      additionalProperties: false,
    },
  });
  const parsed = z.object({ translations: z.array(z.string()) }).safeParse(JSON.parse(raw));
  if (!parsed.success || parsed.data.translations.length !== input.texts.length) throw new Error("The translation did not match the texts.");
  return parsed.data.translations;
}
