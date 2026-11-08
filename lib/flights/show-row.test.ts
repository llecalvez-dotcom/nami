import { describe, expect, it, vi } from "vitest";
import { bringExpression, hotelRow, outboundRow, returnRow, rowsExpression, showHotel, showOutboundFlight, showReturnFlight, type PageRow } from "@/lib/flights/show-row";

const outbound = (price: number, airline: string, time: string) =>
  `From ${price} euros round trip total. 1 stop flight with ${airline}. Leaves Aéroport de Paris-Charles de Gaulle at ${time} on Monday, November 23 and arrives at I Gusti Ngurah Rai International Airport at 11:35 AM on Tuesday, November 24. Total duration 18 hr 40 min. Select flight`;
const back = (price: number, airline: string, time: string) =>
  `From ${price} euros round trip total. 1 stop flight with ${airline}. Leaves I Gusti Ngurah Rai International Airport at ${time} on Thursday, December 3 and arrives at Aéroport de Paris-Charles de Gaulle at 12:25 PM on Thursday, December 3. Total duration 17 hr 50 min. Select flight`;

const ETIHAD = { airline: "Etihad", price: 642, depart_at: "9:15 PM" };
const OUTBOUND: PageRow[] = [
  { i: 4, label: outbound(642, "Etihad", "9:55 AM") },
  { i: 9, label: outbound(827, "Qatar Airways", "10:00 PM") },
  { i: 12, label: outbound(642, "Etihad", "9:15 PM") },
];
const RETURNS: PageRow[] = [
  { i: 3, label: back(733, "Etihad", "1:35 AM") },
  { i: 7, label: back(642, "China Southern", "8:35 AM") },
  { i: 8, label: back(642, "Etihad", "6:45 PM") },
];

// A page answering the two expressions of lib/flights/show-row.ts.
function page(rows: PageRow[], returning: boolean, shown = "scrolled") {
  return vi.fn(async (expression: string) => (expression === rowsExpression() ? JSON.stringify({ returning, rows }) : shown));
}

describe("finding the chosen row", () => {
  it("tells apart two outbound flights at the same price by their time", () => {
    expect(outboundRow(OUTBOUND, ETIHAD)?.i).toBe(12);
    expect(outboundRow(OUTBOUND, { ...ETIHAD, price: 700 })).toBeNull();
  });

  it("takes the first return flight at the total price chosen, and gives its position", () => {
    const found = returnRow(RETURNS, 642);
    expect(found?.row.i).toBe(7);
    expect(found?.position).toBe(2);
    expect(found?.flight.airline).toBe("China Southern");
    expect(returnRow(RETURNS, 999)).toBeNull();
  });

  it("finds a hotel by its name, not by the end of a longer name", () => {
    const rows = [{ i: 1, label: "Prices starting from €47, Grand MiCasa" }, { i: 2, label: "Prices starting from €52, MiCasa" }];
    expect(hotelRow(rows, "MiCasa")?.i).toBe(2);
    expect(hotelRow(rows, "Alila")).toBeNull();
  });
});

describe("bringing it on screen", () => {
  it("scrolls to the outbound flight chosen", async () => {
    const evaluate = page(OUTBOUND, false);
    await expect(showOutboundFlight(ETIHAD, evaluate)).resolves.toBe("scrolled");
    expect(evaluate).toHaveBeenLastCalledWith(bringExpression(OUTBOUND[2]), "/travel/flights");
  });

  it("looks for the hotel in the hotels tab", async () => {
    const evaluate = page([{ i: 2, label: "Prices starting from €52, MiCasa" }], false, "visible");
    await expect(showHotel("MiCasa", evaluate)).resolves.toBe("visible");
    expect(evaluate).toHaveBeenLastCalledWith(expect.any(String), "/travel/search");
  });

  it("says missing when the row is not there or the page cannot be read, and never throws", async () => {
    await expect(showOutboundFlight({ ...ETIHAD, price: 700 }, page(OUTBOUND, false))).resolves.toBe("missing");
    await expect(showHotel("MiCasa", vi.fn(async () => null))).resolves.toBe("missing");
    await expect(showHotel("MiCasa", vi.fn(async () => { throw new Error("no chrome"); }))).resolves.toBe("missing");
    await expect(showHotel("MiCasa", vi.fn(async () => "not json"))).resolves.toBe("missing");
  });
});

describe("the return flight", () => {
  const pause = vi.fn(async () => undefined);

  it("does not take the outbound list for the return list", async () => {
    const evaluate = page(OUTBOUND, false);
    await expect(showReturnFlight(642, evaluate, pause)).resolves.toBe("not_displayed");
    expect(evaluate.mock.calls.every(([expression]) => expression === rowsExpression())).toBe(true);
  });

  it("waits for the return list, then brings the right flight on screen", async () => {
    const replies = [{ returning: false, rows: OUTBOUND }, { returning: true, rows: RETURNS }];
    const evaluate = vi.fn(async (expression: string) => (expression === rowsExpression() ? JSON.stringify(replies.shift()) : "scrolled"));
    const found = await showReturnFlight(642, evaluate, pause);
    expect(found).toMatchObject({ position: 2, flight: { airline: "China Southern", price: 642 } });
    expect(evaluate).toHaveBeenLastCalledWith(bringExpression(RETURNS[1]), "/travel/flights");
  });

  it("says so when no return flight is at that price", async () => {
    await expect(showReturnFlight(999, page(RETURNS, true), pause)).resolves.toBe("no_match");
  });
});
