import type { HotelCriterion, HotelOption } from "@/lib/contracts";

export const PROPOSED_HOTELS = 3;

export const HOTELS_PROPOSAL = {
  kind: "proposal", action: "hotels", text: "Do you also want me to find you a hotel?", accept_label: "Find my hotel", decline_label: "Not now", decision: null,
} as const;

export const HOTEL_CRITERION_LABELS: Record<HotelCriterion, string> = {
  cheapest: "The cheapest",
  best_rated: "The best rated",
  // "Best" and "compromise" stay in the label: the spoken-answer interpreter relies on them.
  best: "Best compromise",
};

function normalizer(values: number[]): (value: number) => number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return (value) => (max === min ? 0 : (value - min) / (max - min));
}

export function rankHotels(options: HotelOption[], criterion: HotelCriterion, count = PROPOSED_HOTELS): HotelOption[] {
  const sorted = [...options];
  if (criterion === "cheapest") sorted.sort((a, b) => a.price - b.price || b.rating - a.rating || a.index - b.index);
  if (criterion === "best_rated") sorted.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews || a.index - b.index);
  if (criterion === "best") {
    // Price and rating count the same; 0 is the best of the list on both.
    const price = normalizer(options.map((o) => o.price));
    const rating = normalizer(options.map((o) => o.rating));
    const score = (o: HotelOption) => 0.5 * price(o.price) + 0.5 * (1 - rating(o.rating));
    sorted.sort((a, b) => score(a) - score(b) || a.price - b.price || a.index - b.index);
  }
  return sorted.slice(0, count);
}

export function formatHotelPrice(option: Pick<HotelOption, "price" | "currency">): string {
  return option.currency === "EUR" ? `${option.price} €` : `${option.price} ${option.currency}`;
}

// The button of one hotel: "Alila Ubud · 113 € a night · 4.6/5 · 5-star".
export function hotelLabel(option: HotelOption): string {
  return [option.name, `${formatHotelPrice(option)} a night`, `${option.rating}/5`, ...(option.stars ? [`${option.stars}-star`] : [])].join(" · ");
}

// What Nami says about one hotel, in one sentence.
export function describeHotel(option: HotelOption): string {
  const price = option.currency === "EUR" ? `${option.price} euros` : `${option.price} ${option.currency}`;
  return `${option.name} at ${price} a night, rated ${option.rating} out of 5`;
}
