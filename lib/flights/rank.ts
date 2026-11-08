import type { FlightCriterion, FlightOption } from "@/lib/contracts";

export const PROPOSED_FLIGHTS = 3;

// "best" scores each flight between 0 (the lowest of the list) and 1 (the highest) on price, duration and stops,
// then weighs them: price counts for half, duration for a third, stops for the rest. Smallest score wins.
export const BEST_WEIGHTS = { price: 0.5, duration: 0.3, stops: 0.2 } as const;

export const CRITERION_LABELS: Record<FlightCriterion, string> = {
  cheapest: "The cheapest",
  fastest: "The fastest",
  fewest_stops: "No stop if possible",
  // "Best" stays in the label (the spoken-answer interpreter relies on it); no "price" or "stops" in it, since a label
  // containing a said word is taken as the answer (matchOption) before the criterion words are looked at.
  best: "Best compromise",
  // Only offered when the traveller asked for it ("vols directs uniquement"): a one-stop flight is never shown as direct.
  direct_only: "Direct flights only",
};

function normalizer(values: number[]): (value: number) => number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (value) => (max === min ? 0 : (value - min) / (max - min));
}

function bestScore(options: FlightOption[]): (option: FlightOption) => number {
  const price = normalizer(options.map((o) => o.price));
  const duration = normalizer(options.map((o) => o.duration_min));
  const stops = normalizer(options.map((o) => o.stops));
  return (o) => BEST_WEIGHTS.price * price(o.price) + BEST_WEIGHTS.duration * duration(o.duration_min) + BEST_WEIGHTS.stops * stops(o.stops);
}

const byPriceThenDuration = (a: FlightOption, b: FlightOption) => a.price - b.price || a.duration_min - b.duration_min || a.index - b.index;

export function rankFlights(options: FlightOption[], criterion: FlightCriterion, count = PROPOSED_FLIGHTS): FlightOption[] {
  const sorted = [...options];
  switch (criterion) {
    case "cheapest":
      sorted.sort(byPriceThenDuration);
      break;
    case "fastest":
      sorted.sort((a, b) => a.duration_min - b.duration_min || a.price - b.price || a.index - b.index);
      break;
    case "fewest_stops":
      sorted.sort((a, b) => a.stops - b.stops || a.price - b.price || a.index - b.index);
      break;
    case "best": {
      const score = bestScore(options);
      sorted.sort((a, b) => score(a) - score(b) || byPriceThenDuration(a, b));
      break;
    }
    case "direct_only":
      return sorted.filter((o) => o.stops === 0).sort(byPriceThenDuration).slice(0, count);
  }
  return sorted.slice(0, count);
}

export function hasDirectFlight(options: FlightOption[]): boolean {
  return options.some((o) => o.stops === 0);
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, "0")}`;
}

export function formatPrice(option: Pick<FlightOption, "price" | "currency">): string {
  const amount = Number.isInteger(option.price) ? String(option.price) : option.price.toFixed(2);
  return option.currency === "EUR" ? `${amount} €` : `${amount} ${option.currency}`;
}

// "1 stop Doha", "2 stops Amsterdam, Jakarta": the layover cities as lib/flights/extract.ts cleaned them, never Google's
// long description ("Federal Territory of Kuala Lumpur").
function shortStops(option: FlightOption): string {
  if (option.stops === 0) return "direct";
  const where = option.layovers.map((l) => l.airport).filter(Boolean);
  const count = option.stops === 1 ? "1 stop" : `${option.stops} stops`;
  return where.length ? `${count} ${where.join(", ")}` : count;
}

function spokenStops(option: FlightOption): string {
  if (option.stops === 0) return "direct";
  return option.stops === 1 ? "one stop" : `${option.stops} stops`;
}

// "834 euros" said aloud; another currency keeps its code, as on the page.
function spokenPrice(option: Pick<FlightOption, "price" | "currency">): string {
  const amount = Number.isInteger(option.price) ? String(option.price) : option.price.toFixed(2);
  return option.currency === "EUR" ? `${amount} euros` : `${amount} ${option.currency}`;
}

// What Nami says about one flight: short, no full stop inside (spokenShort keeps the first sentence only), the layover
// city left out (the button shows it). Translated like every other text by requestTranslations.
export function describeFlight(option: FlightOption): string {
  return `${option.airline} at ${spokenPrice(option)}, ${spokenStops(option)}, ${formatDuration(option.duration_min)}`;
}

// The button of one flight: two lines at most in the panel (about 380 px), separated by middle dots so the translation
// stays as short. "Malaysia Airlines · 834 € · 1 stop Kuala Lumpur · 17 h 55 · leaves 11:10".
export function flightLabel(option: FlightOption): string {
  return [option.airline, formatPrice(option), shortStops(option), formatDuration(option.duration_min), `leaves ${option.depart_at}`].join(" · ");
}

// What Nami says before the list: the criterion, and a word when no flight is direct.
export function introduceFlights(criterion: FlightCriterion, options: FlightOption[]): string {
  if (criterion === "fewest_stops" && !hasDirectFlight(options)) return "No direct flight on those days, here are the flights with the fewest stops.";
  if (criterion === "direct_only") return "Direct flights only, as you asked, cheapest first.";
  return `${CRITERION_LABELS[criterion]} first.`;
}
