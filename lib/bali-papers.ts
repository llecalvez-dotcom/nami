import { OBSERVED_ON } from "@/lib/official-sites";

export type BaliPaperId = "evoa" | "arrival_card" | "bali_levy";

export type BaliPaper = {
  id: BaliPaperId;
  name: string;
  short_name: string;
  official_cost: string;
  official_url: string;
  domain: string;
  opens_hours_before_arrival: number | null;
  deadline: "before_departure" | "before_arrival" | "before_departure_or_at_airport";
  window_note: string;
  pilot_priority: 1 | 2 | 3;
  stop_condition: string;
  observed_on: string;
  source_urls: string[];
};

export const BALI_PAPERS: readonly BaliPaper[] = [
  {
    id: "evoa",
    name: "e-VOA: B1 Tourist Visa On Arrival",
    short_name: "Visa (e-VOA)",
    official_cost: "IDR 500,000",
    official_url: "https://evisa.imigrasi.go.id/web/visa-selection",
    domain: "evisa.imigrasi.go.id",
    opens_hours_before_arrival: null,
    deadline: "before_departure",
    window_note: "Apply before departure. 30 days, extendable once by 30 days; valid 90 days from issue.",
    pilot_priority: 1,
    stop_condition: "Stop on the summary screen or the payment screen, without clicking anything on it.",
    observed_on: OBSERVED_ON,
    source_urls: ["https://evisa.imigrasi.go.id/web/visa-selection", "https://evisa.imigrasi.go.id"],
  },
  {
    id: "arrival_card",
    name: "All Indonesia arrival card",
    short_name: "Arrival card",
    official_cost: "Free",
    official_url: "https://allindonesia.imigrasi.go.id/arrival-card-submission/personal-information",
    domain: "allindonesia.imigrasi.go.id",
    opens_hours_before_arrival: 72,
    deadline: "before_arrival",
    window_note: "Opens 72 h before arrival (“within 3 (three) days prior arrival”). 4 steps.",
    pilot_priority: 2,
    stop_condition:
      "Stop when step 4 (Deklarasi) is displayed, with the declaration left unchecked and the submit button not clicked.",
    observed_on: OBSERVED_ON,
    source_urls: ["https://allindonesia.imigrasi.go.id/arrival-card-submission/personal-information"],
  },
  {
    id: "bali_levy",
    name: "Bali tourist levy (Love Bali)",
    short_name: "Bali levy",
    official_cost: "IDR 150,000",
    official_url: "https://lovebali.baliprov.go.id",
    domain: "lovebali.baliprov.go.id",
    opens_hours_before_arrival: null,
    deadline: "before_departure_or_at_airport",
    window_note: "No official window: pay before departure or at the airport. Voucher sent by e-mail.",
    pilot_priority: 3,
    stop_condition: "Stop before choosing the payment method.",
    observed_on: OBSERVED_ON,
    source_urls: ["https://lovebali.baliprov.go.id", "https://lovebali.baliprov.go.id/faq"],
  },
];

export const BALI_TIME_ZONE = "Asia/Makassar";

export function getBaliPaper(id: BaliPaperId): BaliPaper {
  const paper = BALI_PAPERS.find((p) => p.id === id);
  if (!paper) throw new Error(`Unknown Bali paper: ${id}`);
  return paper;
}
