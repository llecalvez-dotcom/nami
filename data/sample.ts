import { BALI_PAPERS } from "@/lib/bali-papers";
import type { AgentRun, Formality, ModuleSuggestion, TripRequest, TripRequestDraft } from "@/lib/contracts";
import { isOfficialUrl } from "@/lib/official-sites";

export const SAMPLE_LABEL = "Sample data";

export const SAMPLE_TRIP_ID = "sample-bali";

export const SAMPLE_TRIP: TripRequest = {
  raw_text: "I'm flying to Bali on Monday for a friend's wedding, staying ten days.",
  nationality: "FR",
  origin_country: "FR",
  destination: "Bali",
  country_iso2: "ID",
  departure_date: "2026-11-09",
  arrival_at: "2026-11-10T14:30+08:00",
  return_date: "2026-11-20",
  purpose: "tourism",
  travellers: 1,
  status: "planning",
};

export const SAMPLE_DRAFT: TripRequestDraft = { ...SAMPLE_TRIP, arrival_at: null };

export const SAMPLE_LANDING_OPTIONS: { label: string; arrival_at: string }[] = [
  { label: "Tue 10 Nov, 14:30", arrival_at: SAMPLE_TRIP.arrival_at! },
  { label: "I don't know yet", arrival_at: "2026-11-10T00:00+08:00" },
];

export const SAMPLE_SUGGESTIONS: ModuleSuggestion[] = [
  {
    module: "papers",
    state: "suggested",
    message: "For a French passport going to Bali, you need 3 entry papers. Shall I prepare them?",
  },
  { module: "flights", state: "suggested", message: "Want me to find your flight?" },
  { module: "hotel", state: "soon", message: "Hotels are coming soon." },
];

const SAMPLE_WINDOWS: Record<string, Pick<Formality, "opens_at" | "closes_at">> = {
  evoa: { opens_at: null, closes_at: null },
  arrival_card: { opens_at: "2026-11-07T14:30+08:00", closes_at: SAMPLE_TRIP.arrival_at },
  bali_levy: { opens_at: null, closes_at: null },
};

export const SAMPLE_FORMALITIES: Formality[] = BALI_PAPERS.map((paper) => ({
  id: paper.id,
  name: paper.name,
  required: true,
  official_url: paper.official_url,
  official_cost: paper.official_cost,
  ...SAMPLE_WINDOWS[paper.id],
  sources: paper.source_urls.map((url) => ({ url, official: isOfficialUrl(url) })),
  status: "suggested",
  checked_at: null,
}));

export const SAMPLE_EMAIL_QUESTION = {
  tool_req: "sample-tool-req-1",
  question: "Which email should receive your visa?",
  field: "email",
};

export const SAMPLE_AGENT_RUN: AgentRun = {
  session_id: "sample-session-0001",
  kind: "paper",
  started_at: "2026-11-08T13:52:00+01:00",
  state: "awaiting_tool_results",
  pending_question: SAMPLE_EMAIL_QUESTION,
};

export const SAMPLE_AGENT_STEPS: string[] = [
  "Opened evisa.imigrasi.go.id",
  "Selected B1: Tourist (Visa On Arrival)",
  "Uploaded passport scan and photo",
  "Filled in identity from the passport",
  "Filled in arrival date from your request",
  "Asked you for the contact e-mail",
];

export const SAMPLE_FILLED_FIELDS: string[] = [
  "visa_type",
  "passport_upload",
  "photo_upload",
  "surname",
  "given_names",
  "passport_number",
  "arrival_date",
  "email",
];
