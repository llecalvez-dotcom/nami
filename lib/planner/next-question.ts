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
      return arrivalProposal(draft) ?? `When do you land in ${draft.destination ?? "your destination"}?`;
    case "purpose":
      return "What is the purpose of your trip?";
    case "travellers":
      return "How many of you are travelling?";
  }
}

const longDate = (isoDate: string) =>
  new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export function nextDay(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

// Nami proposes rather than asks (Nathan, 2026-11-07): from France, the flight to Bali lands the next day in the evening.
export function arrivalProposal(draft: TripRequestDraft): string | null {
  const bali = /bali/i.test(draft.destination ?? "") || draft.country_iso2 === "ID";
  if (!draft.departure_date || !bali) return null;
  return `You leave on ${longDate(draft.departure_date)}: from France you land in Bali the next day, ${longDate(nextDay(draft.departure_date))}, around 6 pm. Is that right? If you know your landing time, just tell me.`;
}

export function missingFields(draft: TripRequestDraft): QuestionField[] {
  return QUESTION_ORDER.filter((field) => draft[field] === null);
}

export function nextQuestion(draft: TripRequestDraft): PlannerQuestion | null {
  const field = missingFields(draft)[0];
  return field ? { field, question: questionText(field, draft) } : null;
}
