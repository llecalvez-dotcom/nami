import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTrips, getTrip, saveTrip } from "@/lib/trip-store";
import { readSpokenLanguage, resetSpokenLanguage, setSpokenLanguage } from "@/lib/voice/language";
import type { Trip } from "@/lib/trip-state";

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("a new trip in the side panel starts from zero", () => {
  it("deletes every saved trip", () => {
    saveTrip({ id: "a" } as Trip);
    saveTrip({ id: "b" } as Trip);
    clearTrips();
    expect(getTrip("a")).toBeNull();
    expect(getTrip("b")).toBeNull();
  });

  it("forgets the spoken language until the traveller speaks again", () => {
    setSpokenLanguage("ms");
    expect(readSpokenLanguage()).toBe("ms");
    resetSpokenLanguage();
    expect(readSpokenLanguage()).toBe("en");
  });
});
