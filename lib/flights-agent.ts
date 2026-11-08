import { z } from "zod";
import { UNTRUSTED_CONTENT_RULE } from "@/lib/agent-task";
import { FlightCriterionSchema, FlightOptionSchema, type FlightOption } from "@/lib/contracts";
import type { ToolSpec } from "@/lib/h-agent";
import { ASK_USER_TOOL, LOCAL_SESSION_ID, REPORT_READY_TOOL } from "@/lib/paper-agent";
import { MAX_REPORTED_FLIGHTS } from "@/lib/flights/read";
import { formatPrice } from "@/lib/flights/rank";
import type { ReturnFlight, Shown } from "@/lib/flights/show-row";

export { FLIGHT_DOMAINS } from "@/lib/flights/page";

// Module Vol (ticket 18): the agent opens Google Flights in the traveller's Chrome and tells Nami when the list is on
// screen; Nami reads the flights herself (lib/flights/extract.ts), and once the traveller has chosen one, the agent
// opens it up to Google's booking options page and stops there. About 10 steps when all goes well.
export const FLIGHTS_MAX_STEPS = 40;
export const FLIGHTS_MAX_TIME_S = 600;
// For offDomainHost: www.google.com and consent.google.com both end with it.
export const FLIGHTS_DOMAIN = "google.com";
export const FLIGHTS_ORIGIN = "Paris";
export const FLIGHTS_FORBIDDEN_BUTTONS = ["Réserver", "Book", "Continuer", "Continue", "Pay", "Payer", "Sign in", "Se connecter"] as const;

// The sessions started by /api/flights/start, so that the domain guard follows Google instead of an official site.
// In memory, like the papers: after a server restart a session counts as a paper.
const shared = globalThis as typeof globalThis & { namiFlightSessions?: Set<string> };
const flightSessions = (shared.namiFlightSessions ??= new Set<string>());

export function bindFlightsSession(sessionId: string) {
  flightSessions.add(sessionId);
}

export function isFlightsSession(sessionId: string): boolean {
  return flightSessions.has(sessionId);
}

// The off-domain guard of a flights session is armed once the agent has been seen on Google Flights.
const armedGuards = new Set<string>();
export function armFlightsGuard(sessionId: string) {
  armedGuards.add(sessionId);
}
export function isFlightsGuardArmed(sessionId: string): boolean {
  return armedGuards.has(sessionId);
}

export const FlightsStartSchema = z.object({
  origin: z.string().trim().min(1).max(120).default(FLIGHTS_ORIGIN),
  destination: z.string().trim().min(1).max(120),
  departure_date: z.iso.date(),
  return_date: z.iso.date(),
  travellers: z.number().int().min(1).max(9).default(1),
  criterion: FlightCriterionSchema.optional(),
  local_session_id: LOCAL_SESSION_ID,
  idempotency_key: z.uuid().optional(),
}).refine((v) => v.return_date >= v.departure_date, { message: "return_date before departure_date", path: ["return_date"] });
export type FlightsStart = z.infer<typeof FlightsStartSchema>;

// Google resolves the city names itself ("Bali", "Lisbonne"). hl=en on purpose: the "Flights from … to … on … through …"
// query is only understood by the English page; with a French browser and hl=fr, Google opens its home page with no
// search (seen on 8 Nov 2026), and the agent would have to fill the form itself (6 to 10 steps). Prices stay in EUR, and
// lib/flights/extract.ts reads the English results list.
export function googleFlightsUrl(input: Pick<FlightsStart, "origin" | "destination" | "departure_date" | "return_date" | "travellers">): string {
  const adults = input.travellers === 1 ? "1 adult" : `${input.travellers} adults`;
  const q = `Flights from ${input.origin} to ${input.destination} on ${input.departure_date} through ${input.return_date} for ${adults} economy`;
  const params = new URLSearchParams({ q, hl: "en", curr: "EUR" });
  return `https://www.google.com/travel/flights?${params.toString()}`;
}

export const REPORT_FLIGHTS_TOOL: ToolSpec = {
  name: "report_flights",
  description:
    "Call it with no flights as soon as the Google Flights results list is on screen: Nami reads the flights from the page herself, you do not read them. Then wait: the answer tells you which flight the traveller chose, or what to do next. Only when the answer asks you to, call it again with the flights you can read, exactly as displayed. Never invent a flight.",
  input_schema: {
    type: "object",
    properties: {
      flights: {
        type: "array",
        description: "Leave empty on the first call. Only when asked: the round trips exactly as displayed on the page.",
        maxItems: MAX_REPORTED_FLIGHTS,
        items: {
          type: "object",
          properties: {
            index: { type: "integer", minimum: 1, description: "Position of the flight in the list, 1 for the first one shown." },
            airline: { type: "string", description: "Airline name(s) exactly as displayed." },
            price: { type: "number", description: "Total round-trip price shown, digits only." },
            currency: { type: "string", description: "Currency code shown, for example EUR." },
            stops: { type: "integer", minimum: 0, description: "Number of stops on the outbound leg, 0 if direct." },
            duration_min: { type: "integer", minimum: 1, description: "Total duration of the outbound leg in minutes." },
            depart_at: { type: "string", description: "Departure time as displayed, for example 13:50." },
            arrive_at: { type: "string", description: "Arrival time as displayed, for example 10:25+1." },
            layovers: {
              type: "array",
              items: {
                type: "object",
                properties: { airport: { type: "string" }, duration_min: { type: "integer", minimum: 0 } },
                required: ["airport"],
              },
            },
          },
          required: ["index", "airline", "price", "currency", "stops", "duration_min", "depart_at", "arrive_at"],
        },
      },
    },
    required: [],
  },
};

export const SHOW_RETURN_FLIGHT_TOOL: ToolSpec = {
  name: "show_return_flight",
  description:
    "Call it as soon as the return list is displayed, after clicking the outbound flight: Nami finds the return flight at the total price the traveller chose, brings it on screen and tells you which row to click. Do not look for it yourself.",
  input_schema: { type: "object", properties: {}, required: [] },
};

export const FLIGHTS_TOOLS: ToolSpec[] = [ASK_USER_TOOL, REPORT_READY_TOOL, REPORT_FLIGHTS_TOOL, SHOW_RETURN_FLIGHT_TOOL];

export function buildFlightsInstructions(): string {
  return [
    "You are Nami's flight agent. You search flights on Google Flights (www.google.com/travel/flights) in the traveller's own Chrome, and nowhere else.",
    "Stay on www.google.com. On Google's cookie consent page (consent.google.com), click \"Tout refuser\" or \"Reject all\": this is not a block.",
    `Never click ${FLIGHTS_FORBIDDEN_BUTTONS.map((b) => `"${b}"`).join(", ")} or any button that opens an airline, an agency or a payment page. Never sign in.`,
    "Never type personal data: no name, no passport, no e-mail, no card.",
    "Never invent a flight, a price or a time: report only what you can read on the page. If you cannot read the flights, say so with ask_user.",
    "Be quick: Nami reads the results page herself. Do not scroll to read flights, do not open flight details, do not take extra looks at the page. One action per step, no pause between steps.",
    "If a captcha or an \"unusual traffic\" page appears, or if Google does not recognise the city, stop and call ask_user.",
    "Stop condition: the Google Flights booking options page of the chosen flight is displayed (the page that lists where to book, with prices). Then call report_ready and do nothing more.",
    UNTRUSTED_CONTENT_RULE,
  ].join("\n");
}

export function buildFlightsTask(input: FlightsStart, tabId: string | null = null): string {
  const adults = input.travellers === 1 ? "1 adult" : `${input.travellers} adults`;
  return [
    // Nami has opened the page in its own tab (lib/agent-tab.ts), but the bridge may start on any tab.
    ...(tabId
      ? [`Google Flights is already open with this search in the tab whose id is ${tabId}. If it is not the current tab, first call switch_tab_web with exactly this tab_id. Do not open the page again and never visit any other tab: they hold the traveller's forms.`]
      : [
          "Google Flights is normally already open with this search in the active tab: do not open it again. Work only in that tab: the other tabs hold the traveller's forms, so never navigate or close them.",
          `If the current tab is not Google Flights, first call switch_tab_web to go to the Google Flights tab, or to the about:blank tab if there is none. If that tab is about:blank, open exactly this URL: ${googleFlightsUrl(input)}`,
        ]),
    `It should show round trips from ${input.origin} to ${input.destination}, leaving ${input.departure_date} and returning ${input.return_date}, ${adults}, economy, prices in EUR.`,
    "If the cookie consent page appears first, click \"Tout refuser\" or \"Reject all\".",
    "Do not read the flights and do not scroll: Nami reads the page herself. As soon as the list of flights is displayed with prices, call report_flights with no flights. If the page still says the results are loading, call wait_web for 2 seconds first. Only if the top of the page shows another city, another date, or no search at all, fix the form on the page and search, then call report_flights with no flights.",
    "report_flights answers with the flight the traveller chose (airline, total price, departure time) or tells you what to do next. Click that outbound flight: the row showing this airline, price and departure time. Then, as soon as the return list is displayed (\"Returning flights\"), call show_return_flight and click the row it names. Never scroll to look for it. Google Flights then shows the booking options page for this trip.",
    `Stop on that booking options page and call report_ready with a short summary (airline, price, stops). Do not click ${FLIGHTS_FORBIDDEN_BUTTONS.slice(0, 4).map((b) => `"${b}"`).join(", ")} or anything that leaves Google.`,
  ].join("\n");
}

export const FlightChoiceSchema = z.object({ flight: FlightOptionSchema });

// The tool result sent to H once the traveller has chosen: it tells which line to click, nothing personal.
// After a tool result the agent gets no new screenshot: when Nami has moved the page, it must look again before clicking.
export function flightChoiceResult(flight: FlightOption, shown: Shown = "missing"): string {
  const stops = flight.stops === 0 ? "direct" : `${flight.stops} stop${flight.stops > 1 ? "s" : ""}`;
  const row = `the outbound row showing ${flight.airline}, ${formatPrice(flight)} and ${flight.depart_at}`;
  const click = shown === "scrolled"
    ? `Nami has just brought ${row} to the middle of the screen: call wait_web for 1 second to see it, then click it.`
    : `Click ${row} (row ${flight.index} from the top of the results).`;
  return `The traveller chose flight number ${flight.index} in the list: ${flight.airline}, ${formatPrice(flight)}, ${stops}, leaving at ${flight.depart_at}. ${click} Then, as soon as the return list is displayed, call show_return_flight. When the Google Flights booking options page is shown, call report_ready. Do not book.`;
}

export function returnFlightResult(found: ReturnFlight): string {
  if (found === "not_displayed") return "The return list is not displayed yet. If you have not clicked the outbound flight, click it first. Then call show_return_flight again.";
  if (found === "no_match") return "Nami found no return flight at the total price the traveller chose. Call wait_web for 1 second and look at the return list. If a flight shows that price, click it. Otherwise call ask_user and tell the traveller the price has changed.";
  return `The return flight to click is ${found.flight.airline}, leaving at ${found.flight.depart_at}, ${formatPrice(found.flight)}: row ${found.position} of the return list. Nami has brought it on screen: call wait_web for 1 second to see it, then click that row. When the Google Flights booking options page is shown, call report_ready. Do not book.`;
}
