import { HotelOptionSchema, type HotelOption } from "@/lib/contracts";

// Nami reads the Google Hotels results herself, from the aria-labels of the list (lib/flights/read.ts, pageTextExpression,
// puts one per line after the body text). Each hotel carries two labels, read on the real page on 8 November 2026:
//   "Prices starting from €47, Adiwana Dara Ayu"
//   "4.3 out of 5 stars from 387 reviews, Adiwana Dara Ayu"
// and the body text gives its class: "Amenities for Adiwana Dara Ayu, a 4-star hotel."
// The price is for one night. Nothing is computed from elsewhere: a place without a rating is left out.

export const MAX_EXTRACTED_HOTELS = 20;
// Under this, a 5/5 means little: Google's list mixes in vacation rentals with a handful of reviews.
export const MIN_HOTEL_REVIEWS = 50;

const PRICE = /^Prices starting from\s*(€|\$|£)\s*([\d][\d.,\s]*),\s*(.+)$/;
const RATING = /^(\d(?:\.\d)?) out of 5 stars from ([\d][\d.,\s]*) reviews?, (.+)$/;
const STARS = /Amenities for (.+?), a (\d)-star hotel/g;
const CURRENCIES: Record<string, string> = { "€": "EUR", $: "USD", "£": "GBP" };

const whole = (digits: string) => Number(digits.replace(/[.,\s]/g, ""));

export function extractHotels(pageText: string, max = MAX_EXTRACTED_HOTELS): HotelOption[] {
  const prices = new Map<string, { price: number; currency: string }>();
  const ratings = new Map<string, { rating: number; reviews: number }>();
  for (const raw of pageText.split("\n")) {
    const line = raw.replace(/[   ]/g, " ").trim();
    const price = PRICE.exec(line);
    if (price && !prices.has(price[3])) prices.set(price[3], { price: whole(price[2]), currency: CURRENCIES[price[1]] });
    const rating = RATING.exec(line);
    if (rating && !ratings.has(rating[3])) ratings.set(rating[3], { rating: Number(rating[1]), reviews: whole(rating[2]) });
  }
  const stars = new Map([...pageText.matchAll(STARS)].map((m) => [m[1], Number(m[2])] as const));
  const hotels: HotelOption[] = [];
  for (const [name, price] of prices) {
    const rated = ratings.get(name);
    if (!rated || rated.reviews < MIN_HOTEL_REVIEWS) continue;
    const parsed = HotelOptionSchema.safeParse({ index: hotels.length + 1, name, ...price, ...rated, stars: stars.get(name) ?? null });
    if (parsed.success) hotels.push(parsed.data);
    if (hotels.length >= max) break;
  }
  return hotels;
}
