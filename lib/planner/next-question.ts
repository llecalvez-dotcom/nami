import type { TripRequestDraft } from "@/lib/contracts";

export type QuestionField =
  | "destination"
  | "nationality"
  | "origin_country"
  | "departure_date"
  | "arrival_at"
  | "purpose"
  | "travellers";

export const QUESTION_ORDER: readonly QuestionField[] = [
  "destination",
  "nationality",
  "origin_country",
  "departure_date",
  "purpose",
  "travellers",
];

export type PlannerQuestion = { field: QuestionField; question: string };

export const FRENCH_FROM_FRANCE_QUESTION = "Do you travel with a French passport, leaving from France?";

// The landing time is never asked (Clément, 2026-11-07, real test: the traveller does not know it, Nami will find the
// flight): "arrival_at" stays in the type for the sample trip, and the papers assume the day after the departure (assumedArrival).

function questionText(field: QuestionField, draft: TripRequestDraft): string {
  switch (field) {
    case "destination":
      return "Where are you going?";
    case "nationality":
      // One question for the two most common facts (Nami proposes rather than asks): a "no" falls back to the two separate questions.
      return draft.origin_country === null ? FRENCH_FROM_FRANCE_QUESTION : "Do you travel with a French passport?";
    case "origin_country":
      return "Are you leaving from France?";
    case "departure_date":
      return "When do you leave?";
    case "arrival_at":
      return `When do you land in ${draft.destination ?? "your destination"}?`;
    case "purpose":
      return "What is the purpose of your trip?";
    case "travellers":
      return "How many of you are travelling?";
  }
}

export function nextDay(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function missingFields(draft: TripRequestDraft): QuestionField[] {
  return QUESTION_ORDER.filter((field) => draft[field] === null);
}

export function nextQuestion(draft: TripRequestDraft): PlannerQuestion | null {
  const field = missingFields(draft)[0];
  return field ? { field, question: questionText(field, draft) } : null;
}
