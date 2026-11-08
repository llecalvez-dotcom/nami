import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/agent/[id]/flights/route";
import { readFlightsPageText } from "@/lib/flights/page";
import { PAGE_UNREADABLE, REREAD_FLIGHTS, RESULTS_LOADING } from "@/lib/flights/read";

vi.mock("@/lib/flights/page", () => ({ readFlightsPageText: vi.fn(), FLIGHT_DOMAINS: ["www.google.com", "consent.google.com"] }));

const SCOOT = { index: 1, airline: "Scoot", price: 646, currency: "EUR", stops: 1, duration_min: 1325, depart_at: "13:50", arrive_at: "14:55+1", layovers: [{ airport: "Singapour" }] };
const QATAR = { index: 2, airline: "Qatar Airways", price: 912, currency: "EUR", stops: 1, duration_min: 1110, depart_at: "21:35", arrive_at: "22:05+1", layovers: [{ airport: "Doha" }] };
const PAGE = "13:50 Scoot 1 escale 646 € aller-retour\n21:35 Qatar Airways 912 € aller-retour";
const TOOL_REQ = { tool_name: "report_flights", args: { flights: [SCOOT, QATAR] }, id: "tool-1" };
// The results list as lib/flights/page.ts returns it: the body text, then the aria-label of each row.
const LABELS = [
  "Résultats de recherche\n3 résultats.",
  "À partir de 642 euros aller-retour (prix total). Vol avec Etihad, 1 escale. Départ de Aéroport de Paris-Charles de Gaulle à 09:55 le lundi, novembre 23, arrivée à I Gusti Ngurah Rai International Airport à 11:35 le mardi, novembre 24. Durée totale : 18 h 40 min.  L'escale (1 sur 1) est une escale de 2 h 35 min à Abou Dabi (Zayed International Airport). Sélectionner le vol",
  "À partir de 827 euros aller-retour (prix total). Vol avec Qatar Airways, 1 escale. Départ de Aéroport de Paris-Charles de Gaulle à 22:00 le lundi, novembre 23, arrivée à I Gusti Ngurah Rai International Airport à 22:40 le mardi, novembre 24. Durée totale : 17 h 40 min.  L'escale (1 sur 1) est une escale de 1 h 50 min à Doha (Hamad International Airport). Sélectionner le vol",
].join("\n");

const post = (body: unknown, id = "s-1") =>
  POST(new Request(`http://localhost/api/agent/${id}/flights`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

let fetch: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("HAI_API_KEY", "h-key");
  fetch = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
  vi.mocked(readFlightsPageText).mockReset().mockResolvedValue(PAGE);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const sentResult = () => JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);

describe("POST /api/agent/[id]/flights", () => {
  it("reads the flights on the page herself when the agent reports none, and keeps H waiting", async () => {
    vi.mocked(readFlightsPageText).mockResolvedValue(LABELS);
    const response = await post({ tool_req: { ...TOOL_REQ, args: {} } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ source: "page", dropped: 0, invalid: 0 });
    expect(body.flights.map((f: { index: number; airline: string; price: number; depart_at: string }) => [f.index, f.airline, f.price, f.depart_at])).toEqual([[1, "Etihad", 642, "09:55"], [2, "Qatar Airways", 827, "22:00"]]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("falls back on the flights the agent reports that are really on the page", async () => {
    const response = await post({ tool_req: { ...TOOL_REQ, args: { flights: [SCOOT, QATAR, { ...QATAR, index: 3, airline: "Air Nami", price: 10 }] } } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ flights: [SCOOT, QATAR], source: "agent", dropped: 1, invalid: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("asks H to wait while Google is still loading the results", async () => {
    vi.mocked(readFlightsPageText).mockResolvedValue("Chargement des résultats…\nRecherche de vol\nParis\nBali");
    const response = await post({ tool_req: { ...TOOL_REQ, args: {} } });
    expect(await response.json()).toMatchObject({ flights: [], retry: true, loading: true });
    expect(JSON.stringify(sentResult())).toContain(RESULTS_LOADING);
  });

  it("asks H to reread when fewer than two flights match the page", async () => {
    vi.mocked(readFlightsPageText).mockResolvedValue("13:50 Scoot 646 €");
    const response = await post({ tool_req: TOOL_REQ });
    expect(await response.json()).toMatchObject({ flights: [], retry: true, loading: false, dropped: 1 });
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(fetch.mock.calls[0][0])).toContain("/sessions/s-1/");
    expect(JSON.stringify(sentResult())).toContain(REREAD_FLIGHTS);
  });

  it("tells H to hand over to the traveller when the page cannot be read, without any flight", async () => {
    vi.mocked(readFlightsPageText).mockResolvedValue(null);
    const response = await post({ tool_req: TOOL_REQ });
    expect(await response.json()).toEqual({ flights: [], unreadable: true });
    expect(JSON.stringify(sentResult())).toContain(PAGE_UNREADABLE);
  });

  it("sends the traveller's choice to H as the tool result", async () => {
    const response = await post({ tool_req: TOOL_REQ, choice: { flight: QATAR } });
    expect(response.status).toBe(202);
    expect(vi.mocked(readFlightsPageText)).not.toHaveBeenCalled();
    const body = JSON.stringify(sentResult());
    expect(body).toContain("flight number 2 in the list: Qatar Airways, 912 €");
    expect(body).toContain("tool-1");
  });

  it("refuses other tools, malformed bodies and bad session ids", async () => {
    expect((await post({ tool_req: { ...TOOL_REQ, tool_name: "ask_user" } })).status).toBe(400);
    expect((await post({ tool_req: TOOL_REQ, choice: { flight: { ...QATAR, price: "912" } } })).status).toBe(400);
    expect((await post(null)).status).toBe(400);
    expect((await post({ tool_req: TOOL_REQ }, "bad id!")).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
