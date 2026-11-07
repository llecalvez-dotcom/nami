import { z } from "zod";
import { buildPaperInstructions, buildPaperTask } from "@/lib/agent-task";
import { getBaliPaper, type BaliPaper } from "@/lib/bali-papers";
import { PassportFieldsSchema, TripRequestSchema, type PassportFields, type TripRequest } from "@/lib/contracts";
import { HAgentError, type ToolSpec } from "@/lib/h-agent";

export const PAPER_MAX_TIME_S = 900;
export const PAPER_MAX_STEPS = 80;
import { H_SLOTS_BUSY } from "@/lib/paper-start-client";
export { H_SLOTS_BUSY };

// The only Bali paper the agent fills in (part A of ticket 05).
export const PILOT_PAPER_ID = "evoa";

export const ASK_USER_TOOL: ToolSpec = {
  name: "ask_user",
  description:
    "Ask the traveller one short question when a piece of information is missing, or hand over to the human for a captcha, an account creation, an e-mail code, or a file you could not upload. Wait for the answer before going on.",
  input_schema: {
    type: "object",
    properties: {
      question: { type: "string", description: "Short question shown and read aloud to the traveller." },
      field: { type: "string", description: "Form field concerned, for example email or accommodation_address." },
    },
    required: ["question", "field"],
  },
};

export const REPORT_READY_TOOL: ToolSpec = {
  name: "report_ready",
  description:
    "Call once the stop condition is reached, without clicking anything on that screen. This is your last action: Nami ends the session after this call.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "What was filled in and where you stopped." },
      filled_fields: { type: "array", items: { type: "string" }, description: "Names of the form fields you filled in." },
    },
    required: ["summary", "filled_fields"],
  },
};

export const PICK_OPTION_TOOL: ToolSpec = {
  name: "pick_option",
  description:
    "Pick a value in a dropdown list of the current page without opening it. Use it for every dropdown, instead of clicking it. The page already shows the selection. Do not reload or refresh the page or navigate away; take a screenshot and continue with the next field.",
  input_schema: {
    type: "object",
    properties: {
      field: { type: "string", description: "Label of the dropdown as shown on the page, for example Passport/Country/Region." },
      option: { type: "string", description: "Value to pick, as shown in the list, for example FRANCE or Tourism." },
    },
    required: ["field", "option"],
  },
};

export const UPLOAD_FILE_TOOL: ToolSpec = {
  name: "upload_file",
  description: "Ask Nami to give the confirmed passport file (purpose passport) or the confirmed identity photo (purpose photo) to the official form. Never open the OS file picker. After success, take a screenshot to verify the file is shown; do not reload or refresh the page or navigate away. If unavailable, call ask_user for a manual upload.",
  input_schema: {
    type: "object",
    properties: { purpose: { type: "string", enum: ["passport", "photo"] } },
    required: ["purpose"],
    additionalProperties: false,
  },
};

export const PAPER_TOOLS: ToolSpec[] = [ASK_USER_TOOL, REPORT_READY_TOOL, PICK_OPTION_TOOL, UPLOAD_FILE_TOOL];

export const LOCAL_SESSION_ID = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[\w.:-]+$/, "Unexpected characters in the local browser session id");

export const PaperStartSchema = z.object({
  request: TripRequestSchema,
  passport: PassportFieldsSchema,
  paper_id: z.literal(PILOT_PAPER_ID),
  local_session_id: LOCAL_SESSION_ID,
  document_id: z.string().min(1).max(100).optional(),
  photo_document_id: z.string().min(1).max(100).optional(),
  idempotency_key: z.uuid().optional(),
  resume: z.literal(true).optional(),
  file_paths: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
});
export type PaperStart = z.infer<typeof PaperStartSchema>;

export function describeTraveller(passport: PassportFields): string {
  return [
    `Surname: ${passport.surname}.`,
    `Given names: ${passport.given_names}.`,
    `Nationality: ${passport.nationality}.`,
    `Date of birth: ${passport.birth_date}.`,
    `Passport number: ${passport.passport_number}.`,
    `Passport issued on: ${passport.issue_date}.`,
    `Passport expires on: ${passport.expiry_date}.`,
    "Contact e-mail and address in Bali: not provided, ask the traveller with ask_user.",
  ].join(" ");
}

export function describeTrip(request: TripRequest): string {
  return [
    `Destination: ${request.destination} (country ${request.country_iso2}).`,
    `Purpose: ${request.purpose}.`,
    `Departure from ${request.origin_country} on ${request.departure_date}.`,
    `Arrival: ${request.arrival_at} (local time).`,
    `Return: ${request.return_date ?? "not known yet"}.`,
    `Travellers: ${request.travellers}.`,
  ].join(" ");
}

export function buildPilotInstructions(paper: BaliPaper = getBaliPaper(PILOT_PAPER_ID)): string {
  return buildPaperInstructions({
    domain: paper.domain,
    forbiddenButtons: [...paper.forbidden_buttons],
    stopCondition: paper.stop_condition,
  });
}

export function buildPilotTask(input: Pick<PaperStart, "request" | "passport">, paper: BaliPaper = getBaliPaper(PILOT_PAPER_ID)): string {
  return buildPaperTask({
    officialUrl: paper.official_url,
    formName: paper.name,
    traveller: describeTraveller(input.passport),
    trip: describeTrip(input.request),
    routeHint: paper.route_hint,
  });
}

export const SESSION_ID = z.string().regex(/^[\w-]{1,128}$/);

export function fail(error: string, status: number): Response {
  return Response.json({ error }, { status });
}

// Maps H errors to short messages; the H response body is never forwarded nor logged.
export function hErrorResponse(error: unknown): Response {
  if (error instanceof HAgentError) {
    if (error.status === 503) return fail("The H agent is not configured on this server (HAI_API_KEY).", 503);
    if (error.status === 429) return fail(H_SLOTS_BUSY, 429);
    if (error.status === 404) return fail("This agent session was not found on H.", 404);
    if (error.status === 409) return fail("This agent session has already finished.", 409);
    if (error.status === 422 || error.status === 400) return fail("H refused the session settings.", 502);
    if (error.status === 401 || error.status === 403) return fail("H refused the API key.", 502);
    console.error(`h-agent: ${error.message}`);
  } else {
    console.error("h-agent: request failed", error instanceof Error ? error.name : "unknown");
  }
  return fail("The H agent did not answer. Try again.", 502);
}
