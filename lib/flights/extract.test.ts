import { describe, expect, it } from "vitest";
import { extractFlights, parseResultLabel, resultsStillLoading } from "@/lib/flights/extract";

// Real aria-labels of Google Flights result rows, read on 8 November 2026 through the DevTools port (Paris to Bali,
// 23 November to 3 December, 1 adult, EUR). Only the public listing: no traveller data.
const EN_ETIHAD =
  "From 642 euros round trip total. 1 stop flight with Etihad. Leaves Aéroport de Paris-Charles de Gaulle at 9:55 AM on Monday, November 23 and arrives at I Gusti Ngurah Rai International Airport at 11:35 AM on Tuesday, November 24. Total duration 18 hr 40 min.  Layover (1 of 1) is a 2 hr 35 min layover at Zayed International Airport in Abu Dhabi. Select flight";
const EN_QATAR =
  "From 827 euros round trip total. 1 stop flight with Qatar Airways. Leaves Aéroport de Paris-Charles de Gaulle at 10:00 PM on Monday, November 23 and arrives at I Gusti Ngurah Rai International Airport at 10:40 PM on Tuesday, November 24. Total duration 17 hr 40 min.  Layover (1 of 1) is a 1 hr 50 min layover at Hamad International Airport in Doha. Select flight";
const EN_ITA_USD =
  "From 1671 US dollars round trip total. 2 stops flight with ITA and Cathay Pacific. Leaves Paris Orly Airport at 10:55 AM on Monday, November 23 and arrives at I Gusti Ngurah Rai International Airport at 3:20 PM on Wednesday, November 25. Total duration 45 hr 25 min.  Layover (1 of 2) is a 23 hr 30 min layover in Milan. Transfer here from Milan Linate Airport to Milano Malpensa Airport. Layover (2 of 2) is a 3 hr 45 min layover at Hong Kong International Airport in Hong Kong. Select flight";
const EN_ETIHAD_18H =
  "From 716 US dollars round trip total. 1 stop flight with Etihad. Leaves Aéroport de Paris-Charles de Gaulle at 9:15 PM on Monday, November 23 and arrives at I Gusti Ngurah Rai International Airport at 10:15 PM on Tuesday, November 24. Total duration 18 hr.  Layover (1 of 1) is a 2 hr 5 min layover at Zayed International Airport in Abu Dhabi. Select flight";
const FR_CHINA_SOUTHERN =
  "À partir de 642 euros aller-retour (prix total). Vol avec China Southern, 1 escale. Départ de I Gusti Ngurah Rai International Airport à 08:35 le jeudi, décembre 3, arrivée à Aéroport de Paris-Charles de Gaulle à 06:40 le vendredi, décembre 4. Durée totale : 29 h 5 min.  L'escale (1 sur 1) est une escale de 10 h 50 min à Canton (Aéroport international de Canton Baiyun). Billets séparés. Chaque billet de cet itinéraire devra être acheté individuellement. Sélectionner le vol";
const FR_ETIHAD =
  "À partir de 733 euros aller-retour (prix total). Vol avec Etihad, 1 escale. Départ de I Gusti Ngurah Rai International Airport à 01:35 le jeudi, décembre 3, arrivée à Aéroport de Paris-Charles de Gaulle à 12:25 le jeudi, décembre 3. Durée totale : 17 h 50 min.  L'escale (1 sur 1) est une escale de 1 h 15 min à Abou Dabi (Zayed International Airport). Sélectionner le vol";
const FR_ETIHAD_19H =
  "À partir de 733 euros aller-retour (prix total). Vol avec Etihad, 1 escale. Départ de I Gusti Ngurah Rai International Airport à 18:45 le jeudi, décembre 3, arrivée à Aéroport de Paris-Charles de Gaulle à 06:45 le vendredi, décembre 4. Durée totale : 19 h.  L'escale (1 sur 1) est une escale de 2 h 30 min à Abou Dabi (Zayed International Airport). Sélectionner le vol";
// Built from the format above, not yet seen on the real page (to confirm on the bench): a direct flight, two airlines in French.
const FR_DIRECT_TO_CONFIRM =
  "À partir de 1 240 € aller-retour (prix total). Vol avec Air France, sans escale. Départ de Aéroport Paris-Charles de Gaulle à 13:50 le lundi, novembre 23, arrivée à I Gusti Ngurah Rai International Airport à 11:05 le mardi, novembre 24. Durée totale : 15 h 15 min. Sélectionner le vol";
const FR_TWO_AIRLINES_TO_CONFIRM =
  "À partir de 1 030 euros aller-retour (prix total). Vol avec KLM et Garuda Indonesia, 2 escales. Départ de Aéroport Paris-Charles de Gaulle à 06:10 le lundi, novembre 23, arrivée à I Gusti Ngurah Rai International Airport à 08:40 le mardi, novembre 24. Durée totale : 18 h 30 min.  L'escale (1 sur 2) est une escale de 1 h 20 min à Amsterdam (Aéroport d'Amsterdam-Schiphol).  L'escale (2 sur 2) est une escale de 2 h à Jakarta (Aéroport international Soekarno-Hatta). Sélectionner le vol";
const EN_NONSTOP_TO_CONFIRM =
  "From 1240 euros round trip total. Nonstop flight with Air France. Leaves Aéroport de Paris-Charles de Gaulle at 1:50 PM on Monday, November 23 and arrives at I Gusti Ngurah Rai International Airport at 11:05 AM on Tuesday, November 24. Total duration 15 hr 15 min. Select flight";

// What lib/flights/page.ts returns: the body text, then one aria-label per line, with Google's repeats.
const BODY_EN = ["Skip to main content", "Flight search", "Round trip", "1", "Economy", "Paris", "Bali", "Search results", "11 results returned.", "Top departing flights", "9:55 AM", " – ", "11:35 AM+1", "Etihad", "18 hr 40 min", "CDG–DPS", "1 stop", "€642", "round trip"].join("\n");
const PAGE_EN = [BODY_EN, "Change appearance", "642 euros", EN_ETIHAD, "642 euros", "827 euros", EN_QATAR, "Select flight", EN_ITA_USD, EN_ETIHAD, EN_QATAR].join("\n");

describe("parseResultLabel", () => {
  it("reads an English row: price, airline, stops, times with the next-day mark, duration, layover", () => {
    expect(parseResultLabel(EN_ETIHAD, 1)).toEqual({
      index: 1, airline: "Etihad", price: 642, currency: "EUR", stops: 1, duration_min: 1120,
      depart_at: "9:55 AM", arrive_at: "11:35 AM+1", layovers: [{ airport: "Abu Dhabi", duration_min: 155 }],
    });
  });

  it("reads a French row, a same-day arrival and a duration in whole hours", () => {
    expect(parseResultLabel(FR_ETIHAD, 2)).toEqual({
      index: 2, airline: "Etihad", price: 733, currency: "EUR", stops: 1, duration_min: 1070,
      depart_at: "01:35", arrive_at: "12:25", layovers: [{ airport: "Abou Dabi", duration_min: 75 }],
    });
    expect(parseResultLabel(FR_ETIHAD_19H, 3)).toMatchObject({ duration_min: 1140, arrive_at: "06:45+1" });
    expect(parseResultLabel(EN_ETIHAD_18H, 4)).toMatchObject({ duration_min: 1080, currency: "USD", price: 716 });
  });

  it("reads separate tickets, two airlines, two stops, a layover without an airport, an arrival two days later", () => {
    expect(parseResultLabel(FR_CHINA_SOUTHERN, 1)).toMatchObject({ airline: "China Southern", price: 642, stops: 1, duration_min: 1745, arrive_at: "06:40+1", layovers: [{ airport: "Canton", duration_min: 650 }] });
    expect(parseResultLabel(EN_ITA_USD, 1)).toMatchObject({
      airline: "ITA, Cathay Pacific", price: 1671, currency: "USD", stops: 2, duration_min: 2725, depart_at: "10:55 AM", arrive_at: "3:20 PM+2",
      layovers: [{ airport: "Milan", duration_min: 1410 }, { airport: "Hong Kong", duration_min: 225 }],
    });
  });

  it("reads the rows built from the format (to confirm on the real page): direct flights, grouped prices, two airlines in French", () => {
    expect(parseResultLabel(FR_DIRECT_TO_CONFIRM, 1)).toMatchObject({ airline: "Air France", price: 1240, currency: "EUR", stops: 0, duration_min: 915, depart_at: "13:50", arrive_at: "11:05+1", layovers: [] });
    expect(parseResultLabel(EN_NONSTOP_TO_CONFIRM, 1)).toMatchObject({ airline: "Air France", stops: 0, depart_at: "1:50 PM", arrive_at: "11:05 AM+1" });
    expect(parseResultLabel(FR_TWO_AIRLINES_TO_CONFIRM, 1)).toMatchObject({ airline: "KLM, Garuda Indonesia", price: 1030, stops: 2, layovers: [{ airport: "Amsterdam", duration_min: 80 }, { airport: "Jakarta", duration_min: 120 }] });
  });

  it("ignores what is not a whole flight row", () => {
    expect(parseResultLabel("642 euros", 1)).toBeNull();
    expect(parseResultLabel("Chercher des vols de Atlanta (ATL) à Las Vegas (LAS) à partir de 107 €.  Vol opéré par Frontier. Du 1 févr. au 10 févr.. 1 escale", 1)).toBeNull();
    expect(parseResultLabel("From 642 euros round trip total. 1 stop flight with Etihad. Select flight", 1)).toBeNull();
    expect(parseResultLabel("Sélectionner le vol", 1)).toBeNull();
  });
});

describe("extractFlights", () => {
  it("lists the flights of the page once each, in the order of the list, numbered from 1", () => {
    const flights = extractFlights(PAGE_EN);
    expect(flights.map((f) => [f.index, f.airline, f.price])).toEqual([[1, "Etihad", 642], [2, "Qatar Airways", 827], [3, "ITA, Cathay Pacific", 1671]]);
  });

  it("reads the French page and caps the list", () => {
    const page = ["Résultats de recherche", "3 résultats.", FR_CHINA_SOUTHERN, FR_ETIHAD, FR_ETIHAD_19H].join("\n");
    expect(extractFlights(page).map((f) => f.depart_at)).toEqual(["08:35", "01:35", "18:45"]);
    expect(extractFlights(page, 2)).toHaveLength(2);
  });

  it("finds nothing on the home page, on a loading page or on an error page", () => {
    expect(extractFlights("Explorer\nVols\nAtlanta\nà partir de 107 €")).toEqual([]);
    expect(extractFlights("Loading results\nFlight search\nParis\nBali")).toEqual([]);
    expect(extractFlights("No results returned.\n\nOops, something went wrong.\n\nReload")).toEqual([]);
  });
});

describe("resultsStillLoading", () => {
  it("is true while Google says it is loading, false once the count of results is shown", () => {
    expect(resultsStillLoading("Loading results\nFlight search")).toBe(true);
    expect(resultsStillLoading("Chargement des résultats…\nRecherche de vol")).toBe(true);
    expect(resultsStillLoading(BODY_EN)).toBe(false);
    expect(resultsStillLoading("Chargement des résultats…\n3 résultats.")).toBe(false);
    expect(resultsStillLoading("Oops, something went wrong.")).toBe(false);
  });
});
