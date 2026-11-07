import { z } from "zod";

const CountryIso2 = z.string().regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2, uppercase");
const IsoDate = z.iso.date();
const IsoDateTime = z.union([
  z.iso.datetime({ offset: true }),
  z.iso.datetime({ offset: true, precision: -1 }),
]);

const tripFields = {
  nationality: CountryIso2,
  origin_country: CountryIso2,
  destination: z.string().min(1),
  country_iso2: CountryIso2,
  departure_date: IsoDate,
  arrival_at: IsoDateTime,
  return_date: IsoDate,
  purpose: z.string().min(1),
  travellers: z.number().int().positive(),
  status: z.string().min(1),
};

type TripFieldKey = keyof typeof tripFields;

export const TRIP_FIELDS = Object.keys(tripFields) as TripFieldKey[];

export const DEFAULT_TRIP_STATUS = "planning";

export const TripRequestSchema = z.object({
  raw_text: z.string().min(1),
  ...tripFields,
  // Not asked by the agent, so it may stay unknown. The "passport valid 6 months" rule uses
  // return_date when known, otherwise arrival_at + 30 days (length of the e-VOA stay).
  return_date: tripFields.return_date.nullable().default(null),
  status: tripFields.status
    .nullish()
    .transform((status) => status ?? DEFAULT_TRIP_STATUS),
});
export type TripRequest = z.infer<typeof TripRequestSchema>;

export const TripRequestDraftSchema = z.object({
  raw_text: z.string().min(1),
  nationality: tripFields.nationality.nullable().default(null),
  origin_country: tripFields.origin_country.nullable().default(null),
  destination: tripFields.destination.nullable().default(null),
  country_iso2: tripFields.country_iso2.nullable().default(null),
  departure_date: tripFields.departure_date.nullable().default(null),
  arrival_at: tripFields.arrival_at.nullable().default(null),
  return_date: tripFields.return_date.nullable().default(null),
  purpose: tripFields.purpose.nullable().default(null),
  travellers: tripFields.travellers.nullable().default(null),
  status: tripFields.status.nullable().default(null),
});
export type TripRequestDraft = z.infer<typeof TripRequestDraftSchema>;

export const ModuleKindSchema = z.enum(["papers", "flights", "hotel"]);
export type ModuleKind = z.infer<typeof ModuleKindSchema>;

export const ModuleStateSchema = z.enum([
  "suggested",
  "accepted",
  "declined",
  "soon",
  "none_needed",
  "not_supported_yet",
]);
export type ModuleState = z.infer<typeof ModuleStateSchema>;

export const ModuleSuggestionSchema = z.object({
  module: ModuleKindSchema,
  state: ModuleStateSchema,
  message: z.string(),
});
export type ModuleSuggestion = z.infer<typeof ModuleSuggestionSchema>;

export const ItemStatusSchema = z.enum(["suggested", "checked", "pending_approval", "confirmed"]);
export type ItemStatus = z.infer<typeof ItemStatusSchema>;

export const SourceSchema = z.object({
  url: z.url(),
  official: z.boolean(),
});
export type Source = z.infer<typeof SourceSchema>;

export const FormalitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  required: z.boolean(),
  official_url: z.url(),
  official_cost: z.string().min(1),
  opens_at: IsoDateTime.nullable(),
  closes_at: IsoDateTime.nullable(),
  sources: z.array(SourceSchema),
  status: ItemStatusSchema,
  checked_at: IsoDateTime.nullable(),
});
export type Formality = z.infer<typeof FormalitySchema>;

export const AgentStateSchema = z.enum([
  "pending",
  "queued",
  "running",
  "awaiting_tool_results",
  "paused",
  "idle",
  "completed",
  "failed",
  "timed_out",
  "interrupted",
]);
export type AgentState = z.infer<typeof AgentStateSchema>;

export const AgentQuestionSchema = z.object({
  tool_req: z.string().min(1),
  question: z.string().min(1),
  field: z.string(),
});
export type AgentQuestion = z.infer<typeof AgentQuestionSchema>;

export const AgentRunSchema = z.object({
  session_id: z.string().min(1),
  kind: z.enum(["paper", "flights"]),
  started_at: IsoDateTime,
  state: AgentStateSchema,
  pending_question: AgentQuestionSchema.optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  // Live session (ticket 05): next event index to read, tool calls already answered, usage and cost.
  next_index: z.number().int().nonnegative().optional(),
  handled_tool_ids: z.array(z.string()).optional(),
  metrics: z.object({ steps: z.number(), total_cost: z.number().nullable() }).optional(),
  // Terminal and every event read: polling stops.
  drained: z.boolean().optional(),
  // Last state reported by H itself: a local stop waits for H to confirm it.
  h_status: AgentStateSchema.optional(),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;

export const PassportFieldsSchema = z.object({
  surname: z.string().min(1),
  given_names: z.string().min(1),
  nationality: CountryIso2,
  birth_date: IsoDate,
  passport_number: z.string().min(1),
  issue_date: IsoDate,
  expiry_date: IsoDate,
});
export type PassportFields = z.infer<typeof PassportFieldsSchema>;

export const PassportFieldKeySchema = PassportFieldsSchema.keyof();
export type PassportFieldKey = z.infer<typeof PassportFieldKeySchema>;

export const DocumentExtractionSchema = z.object({
  fields: z.object({
    surname: PassportFieldsSchema.shape.surname.nullable(),
    given_names: PassportFieldsSchema.shape.given_names.nullable(),
    nationality: PassportFieldsSchema.shape.nationality.nullable(),
    birth_date: PassportFieldsSchema.shape.birth_date.nullable(),
    passport_number: PassportFieldsSchema.shape.passport_number.nullable(),
    issue_date: PassportFieldsSchema.shape.issue_date.nullable(),
    expiry_date: PassportFieldsSchema.shape.expiry_date.nullable(),
  }),
  confidence_per_field: z.partialRecord(PassportFieldKeySchema, z.number().min(0).max(1)),
  mrz_verified: z.array(PassportFieldKeySchema).optional(),
  warnings: z.array(z.string()),
});
export type DocumentExtraction = z.infer<typeof DocumentExtractionSchema>;
