import { z } from "zod";
import { UNTRUSTED_CONTENT_RULE } from "@/lib/agent-task";
import { HotelCriterionSchema, HotelOptionSchema, type HotelCriterion, type HotelOption } from "@/lib/contracts";
import type { ToolSpec } from "@/lib/h-agent";
import { ASK_USER_TOOL, LOCAL_SESSION_ID, REPORT_READY_TOOL } from "@/lib/paper-agent";
import { formatHotelPrice } from "@/lib/hotels/rank";
import type { Shown } from "@/lib/flights/show-row";

// Module Hôtel: like the flights, the agent opens Google Hotels in the traveller's Chrome and tells Nami when the list is
// on screen; Nami reads the hotels herself (lib/hotels/extract.ts), and once the traveller has chosen one, the agent opens
// it up to its prices and stops there. Nothing is booked.
export const HOTELS_MAX_STEPS = 30;
export const HOTELS_MAX_TIME_S = 600;
export const HOTELS_FORBIDDEN_BUTTONS = ["Visit site", "View site", "Book", "Réserver", "Reserve", "Pay", "Payer", "Sign in", "Se connecter"] as const;
export const HOTELS_PAGE_SECTION = "/travel/search";

export const HotelsStartSchema = z.object({
  destination: z.string().trim().min(1).max(120),
  checkin: z.iso.date(),
  checkout: z.iso.date(),
  criterion: HotelCriterionSchema.optional(),
  local_session_id: LOCAL_SESSION_ID,
  idempotency_key: z.uuid().optional(),
}).refine((v) => v.checkout > v.checkin, { message: "checkout not after checkin", path: ["checkout"] });
export type HotelsStart = z.infer<typeof HotelsStartSchema>;

export const HotelChoiceSchema = z.object({ hotel: HotelOptionSchema });

// "November 23 2026": with the year, or Google reads the dates in the wrong year and shows no price (seen on 8 Nov 2026).
function queryDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const month = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(date);
  return `${month} ${date.getUTCDate()} ${date.getUTCFullYear()}`;
}

// The number of guests is not in the query: Google ignores it there and keeps its default of 2 (seen on 8 Nov 2026).
export function googleHotelsUrl(input: Pick<HotelsStart, "destination" | "checkin" | "checkout">): string {
  const q = `hotels in ${input.destination} from ${queryDate(input.checkin)} to ${queryDate(input.checkout)}`;
  return `https://www.google.com${HOTELS_PAGE_SECTION}?${new URLSearchParams({ q, hl: "en", curr: "EUR" }).toString()}`;
}

export const REPORT_HOTELS_TOOL: ToolSpec = {
  name: "report_hotels",
  description:
    "Call it as soon as the Google Hotels results list is on screen with prices: Nami reads the hotels from the page herself, you do not read them. Then wait: the answer tells you which hotel the traveller chose, or what to do next.",
  input_schema: { type: "object", properties: {}, required: [] },
};

export const HOTELS_TOOLS: ToolSpec[] = [ASK_USER_TOOL, REPORT_READY_TOOL, REPORT_HOTELS_TOOL];

export function buildHotelsInstructions(): string {
  return [
    "You are Nami's hotel agent. You search hotels on Google Hotels (www.google.com/travel/search) in the traveller's own Chrome, and nowhere else.",
    "Stay on www.google.com. On Google's cookie consent page (consent.google.com), click \"Tout refuser\" or \"Reject all\": this is not a block.",
    `Never click ${HOTELS_FORBIDDEN_BUTTONS.map((b) => `"${b}"`).join(", ")} or any link that opens a hotel, an agency or a payment page. Never sign in.`,
    "Never type personal data: no name, no passport, no e-mail, no card.",
    "Be quick: Nami reads the results herself. Do not scroll to read hotels and do not open a hotel before Nami names it. One action per step, no pause between steps.",
    "If a captcha or an \"unusual traffic\" page appears, stop and call ask_user.",
    "Stop condition: the page of the chosen hotel shows its Prices section, the list of sites where it can be booked. Then call report_ready and do nothing more.",
    UNTRUSTED_CONTENT_RULE,
  ].join("\n");
}

// What the agent does on the page for the traveller's criterion, so that the page visibly answers it (Nathan, 2026-11-08:
// « une image figée avec juste un curseur »). Purely visible: Nami ranks the hotels herself (lib/hotels/rank.ts). The "Sort
// by" menu is not used: it is hidden at the end of the row of filters and the agent never reached it in 2 real runs.
const PAGE_ACTIONS: Record<HotelCriterion, string> = {
  cheapest: "As soon as the list of hotels is displayed with prices, go on.",
  best_rated: 'As soon as the list of hotels is displayed with prices, click the "4+ rating" filter above the list.',
  best: 'As soon as the list of hotels is displayed with prices, click the "4+ rating" filter above the list.',
};

export function buildHotelsTask(input: HotelsStart): string {
  return [
    "Google Hotels is normally already open with this search in the active tab: do not open it again. Work only in that tab: the other tabs hold the traveller's forms and flight, so never navigate or close them.",
    `If the current tab is not Google Hotels, first call switch_tab_web to go to the Google Hotels tab, or to the about:blank tab if there is none. If that tab is about:blank, open exactly this URL: ${googleHotelsUrl(input)}`,
    "If the cookie consent page appears first, click \"Tout refuser\" or \"Reject all\".",
    PAGE_ACTIONS[input.criterion ?? "best"],
    "Then call wait_web for 2 seconds, scroll down the list of hotels once so the traveller sees it, and call report_hotels. Do not read the hotels: Nami reads them herself.",
    "report_hotels answers with the hotel the traveller chose, or tells you what to do next. Click that hotel in the list, by its name (scroll the list if it is lower down). On its page, click the \"Prices\" tab.",
    `Stop there and call report_ready with a short summary (hotel, price). Do not click ${HOTELS_FORBIDDEN_BUTTONS.slice(0, 5).map((b) => `"${b}"`).join(", ")} or anything that leaves Google.`,
  ].join("\n");
}

// After a tool result the agent gets no new screenshot: when Nami has moved the page, it must look again before clicking.
export function hotelChoiceResult(hotel: HotelOption, shown: Shown = "missing"): string {
  const click = shown === "scrolled"
    ? "Nami has just brought it to the middle of the screen: call wait_web for 1 second to see it, then click it, by its name"
    : "Click it in the list, by its name";
  return `The traveller chose this hotel: ${hotel.name}, from ${formatHotelPrice(hotel)} a night, rated ${hotel.rating}/5. ${click}, then click its "Prices" tab, and call report_ready.`;
}

export const HOTELS_RETRY = "Nami could not read enough hotels yet. Call wait_web for 2 seconds, then call report_hotels again. After two tries, call ask_user and tell the traveller to choose a hotel in the tab.";
export const HOTELS_PAGE_UNREADABLE = "Nami could not read the page. Call ask_user and tell the traveller to choose a hotel in the tab.";
