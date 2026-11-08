import type { FlightOption } from "@/lib/contracts";
import { parseResultLabel } from "@/lib/flights/extract";
import { evaluateInSearchTab } from "@/lib/flights/page";

// Nami brings the row of the traveller's choice on screen herself: looking for it cost the agent 4 to 5 s per scroll, 22 s
// for a hotel and 38 s on the return flights (run of 8 Nov 2026 at 11:12). Each row carries its aria-label
// (lib/flights/extract.ts, lib/hotels/extract.ts); the elements of height 0 are copies Google keeps hidden.

export type Shown = "scrolled" | "visible" | "missing";
export type PageRow = { i: number; label: string };
type PageRows = { returning: boolean; rows: PageRow[] };
type Evaluate = (expression: string, section: string) => Promise<string | null>;

export type ReturnFlight = { flight: FlightOption; position: number } | "no_match" | "not_displayed";

const FLIGHTS_SECTION = "/travel/flights";
const HOTELS_SECTION = "/travel/search";
// The list replaces the outbound one 0.5 s after the click (seen on the real page on 8 Nov 2026): 6 s is generous.
const RETURN_LIST_WAIT_MS = 6000;
const RETURN_LIST_POLL_MS = 300;
const HOTEL_ROW = "Prices starting from";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (text: string) => text.replace(/\s+/g, " ").trim();

export function rowsExpression(): string {
  return `(() => JSON.stringify({
  returning: document.body.innerText.includes("Returning flights"),
  rows: [...document.querySelectorAll("[aria-label]")]
    .map((el, i) => ({ i, label: (el.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim(), high: el.getBoundingClientRect().height }))
    .filter((row) => row.high > 0 && /^(From |À partir de |${HOTEL_ROW} )/.test(row.label))
    .map(({ i, label }) => ({ i, label })),
}))()`;
}

// Only scrolls when the row is out of sight: the agent's last screenshot stays right when it does not move.
export function bringExpression(row: PageRow): string {
  return `(() => {
  const el = [...document.querySelectorAll("[aria-label]")][${row.i}];
  if (!el || (el.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim() !== ${JSON.stringify(row.label)}) return "missing";
  const box = el.getBoundingClientRect();
  if (box.top >= 120 && box.bottom <= innerHeight - 20) return "visible";
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  return "scrolled";
})()`;
}

export function outboundRow(rows: PageRow[], flight: Pick<FlightOption, "airline" | "price" | "depart_at">): PageRow | null {
  return rows.find((row) => {
    const read = parseResultLabel(row.label, 1);
    return read?.price === flight.price && read.depart_at === flight.depart_at && read.airline === flight.airline;
  }) ?? null;
}

export function hotelRow(rows: PageRow[], name: string): PageRow | null {
  const ending = `, ${clean(name)}`;
  return rows.find((row) => row.label.startsWith(HOTEL_ROW) && row.label.endsWith(ending)) ?? null;
}

export function returnRow(rows: PageRow[], price: number): { row: PageRow; flight: FlightOption; position: number } | null {
  const flights = rows.flatMap((row) => {
    const flight = parseResultLabel(row.label, 1);
    return flight ? [{ row, flight }] : [];
  });
  const position = flights.findIndex(({ flight }) => flight.price === price);
  return position === -1 ? null : { ...flights[position], flight: { ...flights[position].flight, index: position + 1 }, position: position + 1 };
}

async function readRows(section: string, evaluate: Evaluate): Promise<PageRows | null> {
  try {
    const raw = await evaluate(rowsExpression(), section);
    const parsed = raw === null ? null : JSON.parse(raw) as PageRows;
    return Array.isArray(parsed?.rows) ? parsed : null;
  } catch {
    return null;
  }
}

async function bring(row: PageRow | null, section: string, evaluate: Evaluate): Promise<Shown> {
  if (!row) return "missing";
  try {
    const shown = await evaluate(bringExpression(row), section);
    return shown === "scrolled" || shown === "visible" ? shown : "missing";
  } catch {
    return "missing";
  }
}

export async function showOutboundFlight(flight: Pick<FlightOption, "airline" | "price" | "depart_at">, evaluate: Evaluate = evaluateInSearchTab): Promise<Shown> {
  const page = await readRows(FLIGHTS_SECTION, evaluate);
  return bring(page ? outboundRow(page.rows, flight) : null, FLIGHTS_SECTION, evaluate);
}

export async function showHotel(name: string, evaluate: Evaluate = evaluateInSearchTab): Promise<Shown> {
  const page = await readRows(HOTELS_SECTION, evaluate);
  return bring(page ? hotelRow(page.rows, name) : null, HOTELS_SECTION, evaluate);
}

// Waits for the return list, then finds the flight at the total price the traveller chose and brings it on screen.
export async function showReturnFlight(price: number, evaluate: Evaluate = evaluateInSearchTab, pause: (ms: number) => Promise<unknown> = sleep): Promise<ReturnFlight> {
  for (let waited = 0; waited <= RETURN_LIST_WAIT_MS; waited += RETURN_LIST_POLL_MS) {
    const page = await readRows(FLIGHTS_SECTION, evaluate);
    if (page?.returning && page.rows.length > 0) {
      const found = returnRow(page.rows, price);
      if (!found) return "no_match";
      await bring(found.row, FLIGHTS_SECTION, evaluate);
      return { flight: found.flight, position: found.position };
    }
    await pause(RETURN_LIST_POLL_MS);
  }
  return "not_displayed";
}
