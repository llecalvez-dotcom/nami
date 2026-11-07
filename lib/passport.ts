import { z } from "zod";
import {
  DocumentExtractionSchema,
  PassportFieldKeySchema,
  PassportFieldsSchema,
  type DocumentExtraction,
  type PassportFieldKey,
} from "@/lib/contracts";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;
export const PASSPORT_FIELD_KEYS = PassportFieldKeySchema.options;
const READ_TIMEOUT_MS = 30_000;
const STAY_DAYS_WHEN_NO_RETURN = 30;

export type PassportImage = { base64: string; mimeType: (typeof ACCEPTED_IMAGE_TYPES)[number] };
export type ReaderName = "off" | "h" | "anthropic";

// Reads one passport image and returns the raw JSON text of the model. Never logs the image or the answer.
export type PassportReader = { name: string; read: (image: PassportImage) => Promise<string> };

export class PassportReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PassportReadError";
  }
}

const MODEL_OUTPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    ...Object.fromEntries(PASSPORT_FIELD_KEYS.map((key) => [key, { type: ["string", "null"] }])),
    confidence: {
      type: "object",
      properties: Object.fromEntries(PASSPORT_FIELD_KEYS.map((key) => [key, { type: "number", minimum: 0, maximum: 1 }])),
    },
  },
  required: [...PASSPORT_FIELD_KEYS, "confidence"],
};

const PROMPT = `Read the identity page of this passport (printed fields and the MRZ lines at the bottom).
Return one JSON object with:
- surname: as printed, uppercase
- given_names: as printed, separated by spaces
- nationality: ISO 3166-1 alpha-2 code of the nationality (French -> "FR")
- birth_date, issue_date, expiry_date: YYYY-MM-DD
- passport_number: exactly as printed, no spaces
- confidence: for each field, a number between 0 and 1 for how sure you are
A field you cannot read stays null with confidence 0. Never guess a value.`;

const ISO3_TO_ISO2: Record<string, string> = { FRA: "FR", BEL: "BE", CHE: "CH", DEU: "DE", ESP: "ES", ITA: "IT", GBR: "GB", USA: "US" };

function dataUri(image: PassportImage): string {
  return `data:${image.mimeType};base64,${image.base64}`;
}

async function okJson(response: Response, provider: string): Promise<unknown> {
  // The body may contain passport data: never copy it into the error.
  if (!response.ok) throw new PassportReadError(`${provider} returned ${response.status}`);
  return response.json();
}

export function hReader(apiKey: string, fetchImpl: typeof fetch = fetch): PassportReader {
  return {
    name: "h",
    read: async (image) => {
      const response = await fetchImpl("https://api.hcompany.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.HAI_VISION_MODEL || process.env.HAI_MODEL || "holo4-27b",
          messages: [
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: dataUri(image) } },
                { type: "text", text: PROMPT },
              ],
            },
          ],
          response_format: { type: "json_schema", json_schema: { name: "passport", schema: MODEL_OUTPUT_JSON_SCHEMA } },
          chat_template_kwargs: { enable_thinking: false },
          temperature: 0,
        }),
        signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      });
      const body = (await okJson(response, "H Models API")) as { choices?: { message?: { content?: string | null } }[] };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new PassportReadError("H Models API returned no content");
      return content;
    },
  };
}

export function anthropicReader(apiKey: string, fetchImpl: typeof fetch = fetch): PassportReader {
  return {
    name: "anthropic",
    read: async (image) => {
      const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",
          max_tokens: 1024,
          temperature: 0,
          system: `Answer with one JSON object only, matching this JSON Schema:\n${JSON.stringify(MODEL_OUTPUT_JSON_SCHEMA)}`,
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: image.mimeType, data: image.base64 } },
                { type: "text", text: PROMPT },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      });
      const body = (await okJson(response, "Anthropic")) as { content?: { type: string; text?: string }[] };
      const text = body.content?.find((c) => c.type === "text")?.text;
      if (!text) throw new PassportReadError("Anthropic returned no text");
      return text;
    },
  };
}

export function configuredReader(env: Record<string, string | undefined> = process.env): PassportReader | null {
  if (env.PASSPORT_READER === "h" && env.HAI_API_KEY) return hReader(env.HAI_API_KEY);
  if (env.PASSPORT_READER === "anthropic" && env.ANTHROPIC_API_KEY) return anthropicReader(env.ANTHROPIC_API_KEY);
  return null;
}

export function readerName(env: Record<string, string | undefined> = process.env): ReaderName {
  const reader = configuredReader(env);
  return reader ? (reader.name as ReaderName) : "off";
}

function parseModelJson(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new PassportReadError("The model did not return JSON");
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (typeof parsed !== "object" || parsed === null) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new PassportReadError("The model did not return valid JSON");
  }
}

function cleanValue(key: PassportFieldKey, value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let text = value.trim();
  if (key === "nationality") text = ISO3_TO_ISO2[text.toUpperCase()] ?? text.toUpperCase();
  if (key === "passport_number") text = text.replace(/\s+/g, "").toUpperCase();
  if (key === "surname") text = text.toUpperCase();
  const field = PassportFieldsSchema.shape[key].safeParse(text);
  return field.success ? field.data : null;
}

const FIELD_LABELS: Record<PassportFieldKey, string> = {
  surname: "Surname",
  given_names: "Given names",
  nationality: "Nationality",
  birth_date: "Date of birth",
  passport_number: "Passport number",
  issue_date: "Date of issue",
  expiry_date: "Expiry date",
};

function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const TripDatesSchema = z.object({
  return_date: z.iso.date().nullish(),
  arrival_at: z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullish(),
});
export type TripDates = z.infer<typeof TripDatesSchema>;

// Same rule as contracts: return_date when known, otherwise arrival + 30 days (length of the e-VOA stay).
export function returnReference({ return_date, arrival_at }: TripDates): string | null {
  if (return_date) return return_date;
  if (arrival_at) return addDays(arrival_at.slice(0, 10), STAY_DAYS_WHEN_NO_RETURN);
  return null;
}

export function expiryWarning(expiryDate: string, trip: TripDates): string | null {
  const reference = returnReference(trip);
  if (!reference || expiryDate >= addMonths(reference, 6)) return null;
  const basis = trip.return_date ? `your return on ${reference}` : `${reference} (arrival + 30 days)`;
  return `Your passport expires on ${expiryDate}, less than 6 months after ${basis}. Indonesia requires 6 months of validity: renew it before you travel.`;
}

export function toExtraction(modelText: string, trip: TripDates): DocumentExtraction {
  const raw = parseModelJson(modelText);
  const rawConfidence = (typeof raw.confidence === "object" && raw.confidence !== null ? raw.confidence : {}) as Record<
    string,
    unknown
  >;
  const fields = Object.fromEntries(PASSPORT_FIELD_KEYS.map((key) => [key, cleanValue(key, raw[key])])) as DocumentExtraction["fields"];
  const confidence_per_field = Object.fromEntries(
    PASSPORT_FIELD_KEYS.map((key) => {
      const c = rawConfidence[key];
      return [key, fields[key] === null ? 0 : typeof c === "number" && Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0.5];
    }),
  );
  const warnings = PASSPORT_FIELD_KEYS.filter((key) => fields[key] === null).map(
    (key) => `${FIELD_LABELS[key]} could not be read: type it in.`,
  );
  if (fields.expiry_date) {
    const warning = expiryWarning(fields.expiry_date, trip);
    if (warning) warnings.unshift(warning);
  }
  return DocumentExtractionSchema.parse({ fields, confidence_per_field, warnings });
}

export async function extractPassport(image: PassportImage, trip: TripDates, reader: PassportReader): Promise<DocumentExtraction> {
  try {
    return toExtraction(await reader.read(image), trip);
  } catch (error) {
    console.error(`passport: ${reader.name} reader failed:`, error instanceof PassportReadError ? error.message : "request failed");
    throw error instanceof PassportReadError ? error : new PassportReadError("Passport reading failed");
  }
}
