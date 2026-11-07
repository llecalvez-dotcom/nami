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
  "arrival_at",
  "purpose",
  "travellers",
];

export type PlannerQuestion = { field: QuestionField; question: string };

function questionText(field: QuestionField, draft: TripRequestDraft): string {
  switch (field) {
    case "destination":
      return "Where are you going?";
    case "nationality":
      return "Do you travel with a French passport?";
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

export function missingFields(draft: TripRequestDraft): QuestionField[] {
  return QUESTION_ORDER.filter((field) => draft[field] === null);
}

export function nextQuestion(draft: TripRequestDraft): PlannerQuestion | null {
  const field = missingFields(draft)[0];
  return field ? { field, question: questionText(field, draft) } : null;
}
