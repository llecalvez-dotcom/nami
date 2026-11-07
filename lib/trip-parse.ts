import { z } from "zod";
import { TripRequestDraftSchema, type TripRequestDraft } from "@/lib/contracts";
import type { CompleteJson } from "@/lib/llm";
import { missingFields, type QuestionField } from "@/lib/planner";

export const ParseInputSchema = z.object({
  transcript: z.string().trim().min(1).max(2000),
  today: z.iso.date(),
  current_request: TripRequestDraftSchema.optional(),
  question: z.string().max(300).optional(),
});
export type ParseInput = z.infer<typeof ParseInputSchema>;

export type ParseResult = { request: TripRequestDraft; missing: QuestionField[]; changed: string[] };

const ModelOutputSchema = TripRequestDraftSchema.omit({ raw_text: true, status: true });
type ModelOutput = z.infer<typeof ModelOutputSchema>;

export const MODEL_OUTPUT_JSON_SCHEMA = z.toJSONSchema(ModelOutputSchema);

const SYSTEM_PROMPT = `You turn a traveller's request into a JSON trip request. Never guess: a field the traveller did not give stays null.
Fields:
- nationality: ISO 3166-1 alpha-2 of the passport, only if stated ("French passport", "je suis français" -> "FR"). Never infer it from the language.
- origin_country: ISO alpha-2 of the departure country, only if stated or implied by a departure city ("from Brussels" -> "BE").
- destination: the place in English as named by the traveller (e.g. "Bali", "Jakarta", "Lombok", "Barcelona", "Geneva", "Tanzania"). Any place on the island of Bali (Ubud, Canggu, Seminyak, Denpasar...) becomes "Bali".
- country_iso2: ISO alpha-2 of the destination country (Bali -> "ID").
- departure_date: YYYY-MM-DD, only for an exact day. Resolve relative days from today: "Monday" or "lundi" is the next Monday strictly after today. A month alone ("in March") stays null.
- arrival_at: landing date-time in the destination's local time with its UTC offset, "YYYY-MM-DDTHH:mm+HH:mm" (Bali is +08:00). Only if the traveller gives both the landing day and a time of day. If the time is unknown, leave null; never default to midnight.
- return_date: YYYY-MM-DD, from an explicit return date or a stay length counted from departure_date ("ten days" -> departure_date + 10).
- purpose: one lowercase word: "tourism" (holidays, weddings, visiting friends), "business", "family", "study" or "other".
- travellers: number of people travelling. If the traveller only speaks about themselves ("I", "je") with no companion, 1. A group without a number ("with my family") stays null.
When a current request is given, the traveller is answering a question about it: return the full request with that answer applied, keeping every other field unchanged.`;

function weekday(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(new Date(`${isoDate}T00:00:00Z`));
}

export function buildUserPrompt({ transcript, today, current_request, question }: ParseInput): string {
  const lines = [`Today is ${weekday(today)} ${today}.`];
  if (current_request) {
    lines.push(`Current request: ${JSON.stringify(ModelOutputSchema.parse(current_request))}`);
    if (question) lines.push(`Question asked: ${question}`);
    lines.push(`Answer: ${transcript}`);
  } else {
    lines.push(`Request: ${transcript}`);
  }
  return lines.join("\n");
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(candidate);
}

export class ModelOutputError extends Error {}

function statesTimeOfDay(transcript: string): boolean {
  const text = transcript.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const hours = "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|un|une|deux|trois|quatre|cinq|sept|huit|neuf|dix|onze|douze|midi|minuit)";
  const spokenTime = new RegExp(
    `(?:\\b(?:at|around|vers)|(?:^|\\s)à)\\s+(?:(?:half|quarter)\\s+(?:past|to)\\s+)?${hours}\\b`,
    "i",
  );
  return /\b(?:[01]?\d|2[0-3])[:h][0-5]\d(?:\s*[ap]\.?\s*m\.?)?\b/.test(text)
    || /\b(?:[01]?\d|2[0-3])\s*h\b/.test(text)
    || /\b(?:0?[1-9]|1[0-2])\s*[ap]\.?\s*m\.?\b/.test(text)
    || /\b(?:at|around|vers)\s+(?:[01]?\d|2[0-3])\b/.test(text)
    || /(?:^|\s)à\s+(?:[01]?\d|2[0-3])\b/i.test(transcript)
    || spokenTime.test(transcript)
    || new RegExp(`\\b${hours}\\s+(?:o['’]clock|heures?)\\b`).test(text)
    || /\b(?:morning|afternoon|evening|night|tonight|noon|midnight|matin|apres-midi|soir|nuit|midi|minuit)\b/.test(text);
}

export async function parseTrip(input: ParseInput, complete: CompleteJson): Promise<ParseResult> {
  const text = await complete({ system: SYSTEM_PROMPT, user: buildUserPrompt(input), schema: MODEL_OUTPUT_JSON_SCHEMA });
  let output: ModelOutput;
  try {
    output = ModelOutputSchema.parse(extractJson(text));
  } catch (error) {
    throw new ModelOutputError(`The model did not return a valid trip request: ${(error as Error).message}`);
  }
  if (!statesTimeOfDay(input.transcript)) output.arrival_at = null;

  const current = input.current_request ?? TripRequestDraftSchema.parse({ raw_text: input.transcript });
  const request: TripRequestDraft = { ...current };
  const changed: string[] = [];
  for (const [key, value] of Object.entries(output) as [keyof ModelOutput, ModelOutput[keyof ModelOutput]][]) {
    if (value === null || value === current[key]) continue;
    (request as Record<string, unknown>)[key] = value;
    changed.push(key);
  }
  return { request, missing: missingFields(request), changed };
}
