import { describe, expect, it } from "vitest";
import { extractHotels } from "@/lib/hotels/extract";
import { describeHotel, hotelLabel, rankHotels } from "@/lib/hotels/rank";

// Labels read on the real page on 8 November 2026 (Bali, 23 Nov to 3 Dec 2026, EUR).
const PAGE = [
  "Skip to main content",
  "Adiwana Dara Ayu €47 4.3 (387) Amenities for Adiwana Dara Ayu, a 4-star hotel.: Breakfast, Free Wi-Fi",
  "Serela Kuta Bali €11 3.7 (991) Amenities for Serela Kuta Bali, a 3-star hotel.: Breakfast",
  "Alila Ubud €113 4.6 (1.6K) Amenities for Alila Ubud, a 5-star hotel.: Free breakfast",
  "Prices starting from €47, Adiwana Dara Ayu",
  "4.3 out of 5 stars from 387 reviews, Adiwana Dara Ayu",
  "Prices starting from €47, Adiwana Dara Ayu",
  "Prices starting from €11, Serela Kuta Bali",
  "3.7 out of 5 stars from 991 reviews, Serela Kuta Bali",
  "Prices starting from €113, Alila Ubud",
  "4.6 out of 5 stars from 1,593 reviews, Alila Ubud",
  "Prices starting from €16, Prasi Sunset Bungalows - Bungalow with Ocean View",
  "4.8 out of 5 stars from 8 reviews, Prasi Sunset Bungalows - Bungalow with Ocean View",
  "Prices starting from €90, No Rating Hotel",
  "4+ rating, Guest rating, Not selected",
].join("\n");

describe("hotels read in the page", () => {
  it("reads name, nightly price, rating, reviews and class, once each, in the order of the list", () => {
    expect(extractHotels(PAGE)).toEqual([
      { index: 1, name: "Adiwana Dara Ayu", price: 47, currency: "EUR", rating: 4.3, reviews: 387, stars: 4 },
      { index: 2, name: "Serela Kuta Bali", price: 11, currency: "EUR", rating: 3.7, reviews: 991, stars: 3 },
      { index: 3, name: "Alila Ubud", price: 113, currency: "EUR", rating: 4.6, reviews: 1593, stars: 5 },
    ]);
  });

  it("leaves out a place with too few reviews or no rating", () => {
    const names = extractHotels(PAGE).map((h) => h.name);
    expect(names).not.toContain("No Rating Hotel");
    expect(names.some((n) => n.includes("Prasi"))).toBe(false);
  });

  it("reads a price with a thousands separator", () => {
    expect(extractHotels("Prices starting from €1,047, Grand\n4.5 out of 5 stars from 900 reviews, Grand")[0].price).toBe(1047);
  });
});

describe("ranking the hotels", () => {
  const hotels = extractHotels(PAGE);

  it("cheapest, best rated, and a compromise between price and rating", () => {
    expect(rankHotels(hotels, "cheapest")[0].name).toBe("Serela Kuta Bali");
    expect(rankHotels(hotels, "best_rated")[0].name).toBe("Alila Ubud");
    expect(rankHotels(hotels, "best")[0].name).toBe("Adiwana Dara Ayu");
  });

  it("says the price is per night, on the button and aloud, without a full stop inside", () => {
    expect(hotelLabel(hotels[2])).toBe("Alila Ubud · 113 € a night · 4.6/5 · 5-star");
    expect(describeHotel(hotels[2])).toBe("Alila Ubud at 113 euros a night, rated 4.6 out of 5");
  });
});
