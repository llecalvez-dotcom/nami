import { z } from "zod";
import { FlightOptionSchema, type FlightOption } from "@/lib/contracts";

// The agent reports what it reads on Google Flights; Nami keeps only the flights whose airline and price are
// really in the text of the page (document.body.innerText plus the aria-labels of the results list). Nothing is
// invented: a flight that is not on the page is dropped, and with fewer than 2 flights left the agent rereads.

export const MIN_VERIFIED_FLIGHTS = 2;
export const MAX_REPORTED_FLIGHTS = 20;

export const ReportFlightsArgsSchema = z.object({ flights: z.array(z.unknown()).max(MAX_REPORTED_FLIGHTS) });

export const REREAD_FLIGHTS =
  "Nami could not match enough of these flights with the text of the page. Scroll to the list of flights, take a screenshot, read the airline and the total price of each flight exactly as displayed, then call report_flights again.";
export const PAGE_UNREADABLE =
  "Nami could not read the page to check these flights. Call ask_user and tell the traveller to choose a flight themselves in Chrome.";

export type ReadResult = { kept: FlightOption[]; dropped: number; invalid: number };

// Runs in the page (through the CDP guard on google.com): the visible text and the aria-labels of the results.
export function pageTextExpression(): string {
  return `(() => {
  const labels = [...document.querySelectorAll("[aria-label]")].map((el) => el.getAttribute("aria-label") || "");
  return [document.body ? document.body.innerText : "", ...labels].join("\\n").slice(0, 400000);
})()`;
}

export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u00a0\u202f\u2009]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// 1 234 €, 1234 €, €1234, 1,234 €, 1234 euros: the page writes the price in one of these.
function priceForms(price: number): string[] {
  const whole = Math.round(price);
  const plain = String(whole);
  const grouped = plain.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const commaGrouped = plain.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const dotGrouped = plain.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return [...new Set([plain, grouped, commaGrouped, dotGrouped])];
}

const CURRENCY_SIGNS: Record<string, string[]> = { EUR: ["€", "eur", "euros", "euro"], USD: ["$", "usd"], GBP: ["£", "gbp"], CHF: ["chf"] };

// The amount must be written as a price, next to its currency: "646 €", "€646", "1 030 € aller-retour", never a bare
// "1" that would match "1 escale" or a time.
function priceOnPage(price: number, currency: string, page: string): boolean {
  const signs = (CURRENCY_SIGNS[currency.toUpperCase()] ?? [currency.toLowerCase()]).map((s) => s.replace(/[$]/g, "\\$"));
  const sign = `(?:${signs.join("|")})`;
  return priceForms(price).some((form) => {
    const amount = form.replace(/[.]/g, "\\.");
    return new RegExp(`(^|[^\\d.,])${amount}\\s?${sign}(?![a-z])`).test(page) || new RegExp(`${sign}\\s?${amount}(?![\\d.,])`).test(page);
  });
}

function airlineOnPage(airline: string, page: string): boolean {
  const name = normalizeText(airline);
  if (!name) return false;
  if (page.includes(name)) return true;
  // "Qatar Airways, Scoot" or "Singapore Airlines + Scoot": every airline named must be there.
  const parts = name.split(/\s*(?:,|\+|\/|&| and | et | with )\s*/).filter(Boolean);
  return parts.length > 1 && parts.every((part) => page.includes(part));
}

export function verifyAgainstPage(flights: FlightOption[], pageText: string): ReadResult {
  const page = normalizeText(pageText);
  const kept = flights.filter((f) => priceOnPage(f.price, f.currency, page) && airlineOnPage(f.airline, page));
  return { kept, dropped: flights.length - kept.length, invalid: 0 };
}

export function parseReportedFlights(raw: unknown): { flights: FlightOption[]; invalid: number } {
  const args = ReportFlightsArgsSchema.safeParse(raw);
  if (!args.success) return { flights: [], invalid: 0 };
  const flights: FlightOption[] = [];
  let invalid = 0;
  for (const item of args.data.flights) {
    const parsed = FlightOptionSchema.safeParse(item);
    if (parsed.success) flights.push(parsed.data);
    else invalid += 1;
  }
  // One flight per position on the page.
  const seen = new Set<number>();
  return { flights: flights.filter((f) => (seen.has(f.index) ? false : (seen.add(f.index), true))), invalid };
}

export function readFlights(raw: unknown, pageText: string): ReadResult {
  const { flights, invalid } = parseReportedFlights(raw);
  const verified = verifyAgainstPage(flights, pageText);
  return { ...verified, invalid };
}

export function enoughFlights(result: ReadResult): boolean {
  return result.kept.length >= MIN_VERIFIED_FLIGHTS;
}
