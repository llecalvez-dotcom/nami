import type { ModuleSuggestion, TripRequest } from "@/lib/contracts";

const EUROPEAN_UNION = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
] as const;
const EUROPEAN_ECONOMIC_AREA_OUTSIDE_EU = ["IS", "LI", "NO"] as const;
const SWITZERLAND = "CH";

export const NO_VISA_FOR_FRENCH_PASSPORT: ReadonlySet<string> = new Set([
  ...EUROPEAN_UNION,
  ...EUROPEAN_ECONOMIC_AREA_OUTSIDE_EU,
  SWITZERLAND,
]);

const BALI_PLACES = new Set([
  "bali",
  "denpasar",
  "ubud",
  "canggu",
  "seminyak",
  "kuta",
  "legian",
  "sanur",
  "uluwatu",
  "jimbaran",
  "nusa dua",
  "nusa penida",
  "amed",
  "lovina",
]);

export const ONE_FILE_AT_A_TIME = "I prepare one traveller's file at a time: let's start with yours.";

export const PAPERS_FOR_BALI = "For a French passport going to Bali, you need 3 entry papers. Shall I prepare them?";

export const FILLING_COUNTRY_BY_COUNTRY = "Automatic filling is validated country by country; Bali is the first.";

function normalizePlace(destination: string): string {
  return destination
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(",")[0]
    .trim();
}

export function isBali(request: Pick<TripRequest, "destination" | "country_iso2">): boolean {
  return request.country_iso2 === "ID" && BALI_PLACES.has(normalizePlace(request.destination));
}

function papersSuggestion(request: TripRequest): ModuleSuggestion {
  const french = request.nationality === "FR";
  if (french && request.origin_country === "FR" && isBali(request)) {
    const message = request.travellers > 1 ? `${ONE_FILE_AT_A_TIME} ${PAPERS_FOR_BALI}` : PAPERS_FOR_BALI;
    return { module: "papers", state: "suggested", message };
  }
  if (french && NO_VISA_FOR_FRENCH_PASSPORT.has(request.country_iso2)) {
    return {
      module: "papers",
      state: "none_needed",
      message: `No visa needed for a French passport in ${request.destination}: nothing to prepare.`,
    };
  }
  return {
    module: "papers",
    state: "not_supported_yet",
    message: `Let me check live, on the official sites, which entry papers you need for ${request.destination}.`,
  };
}

export function suggestModules(request: TripRequest): ModuleSuggestion[] {
  return [
    papersSuggestion(request),
    { module: "flights", state: "suggested", message: "Want me to find your flight?" },
    { module: "hotel", state: "soon", message: "Hotels are coming soon." },
  ];
}
