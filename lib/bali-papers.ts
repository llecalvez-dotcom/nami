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
  // Buttons the agent must never click on this site, on top of ALWAYS_FORBIDDEN_BUTTONS (lib/agent-task.ts).
  // To adjust after the first real run (docs/tests/f1-evoa.md).
  forbidden_buttons: readonly string[];
  stop_condition: string;
  // Path through the official menus, checked by hand; added to the task right after its first line.
  route_hint?: string;
  // What the agent does right after Nami uploaded a file, told in the upload_file result so it needs no extra look.
  // wait_for_text: Nami waits (a few seconds at most) until the page shows this text before answering.
  after_upload?: Partial<Record<"passport" | "photo" | "return_ticket", { wait_for_text?: string; next: string }>>;
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
    forbidden_buttons: [
      "Pay",
      "Bayar",
      "Submit",
      "Kirim",
      "Proceed to payment",
      "any button that chooses a payment method (card, bank transfer, e-wallet, virtual account)",
    ],
    // Decision of 2026-11-07, 21 h: the demo stops before any data is sent to the government.
    stop_condition: "Stop on step 1 of the application form, once the passport and the photo are uploaded or the page refuses them: never click Next there, because the next steps send the traveller's data to the government.",
    route_hint:
      "The e-VOA is applied for on this visa selection page: do not look for another page or site. Pick, in this order, one after the other with pick_option and without scrolling (pick_option works on lists that are not on screen; the fourth list appears below once the third is picked): the passport country (for example FRANCE), then General, Family, or Social, then Tourism, Family Visit, and Transit, then B1 - Tourist (Visa On Arrival). The length of stay (30 Days) fills itself. Then click Detail & Apply: a window with the visa conditions opens; click Apply in it to reach the application form. When pick_option answers that an option is picked, it is: do not reopen that menu to pick it by hand, go to the next one. On the form, step 1 asks for the passport and the profile photo: use upload_file for each. After the passport upload the site shows its reading in a window with Reupload and Ok at the bottom: scroll_web does not move that window, press Page Down to reach Ok. The site fills some fields from the passport and shows countries in Indonesian: for a French passport, Passport/Country/Region and Issuing Country show PRANCIS, which is France; that is correct, leave it. For any other passport, check that both fields match the passport's country. If the site puts the whole name in First Name, set First Name to the given names and Last Name to every word of the passport surname (for example LE CALVEZ, not CALVEZ). Address in Indonesia: write the Postal Code with fill_field (field Postal Code), not by typing: the page then fills Province, City, District and Village; if they stay empty on the screenshot, call ask_user. Port of Entry Mode is Airport; for Bali, Port of Entry is listed as NGURAH RAI AIRPORT: pick it with pick_option (field Port of Entry). Return Ticket is a required PDF: call upload_file with purpose return_ticket; if Nami has no return ticket, call ask_user and never upload another file there.",
    after_upload: {
      passport: {
        wait_for_text: "Reupload",
        next: "The site has read the passport and shows its reading in a window with Reupload and Ok at the bottom: press Page Down to reach Ok, then click Ok.",
      },
      photo: {
        next: "If the passport reading was confirmed with Ok, step 1 is done: call report_ready now, without clicking anything else.",
      },
    },
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
    forbidden_buttons: ["Submit", "Kirim"],
    // Decision of 2026-11-07, 21 h, as for the e-VOA: nothing is sent to the government in the demo.
    stop_condition:
      "Stop on the first page (personal information) once every field you can fill is filled: never click Next or Submit there, because the next steps send the traveller's data to the government.",
    route_hint:
      "The arrival card starts on this personal information page: fill it in for the traveller from the details below. For anything you do not know (flight number, address in Indonesia), call ask_user.",
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
    forbidden_buttons: ["Pay", "Bayar", "any button that chooses a payment method"],
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
