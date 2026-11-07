"use client";

import { useSyncExternalStore } from "react";
import type { Trip } from "@/lib/trip-state";

const STORAGE_KEY = "nami.trips.v1";
const listeners = new Set<() => void>();

let cachedRaw: string | null | undefined;
let cachedTrips: Trip[] = [];

function readTrips(): Trip[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedTrips = raw ? (JSON.parse(raw) as Trip[]) : [];
    } catch {
      cachedTrips = [];
    }
  }
  return cachedTrips;
}

function writeTrips(trips: Trip[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
  listeners.forEach((listener) => listener());
}

export function subscribeTrips(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function useTrips(): Trip[] | null {
  return useSyncExternalStore(subscribeTrips, readTrips, () => null);
}

// Latest saved version, for async loops that must not work on a stale render.
export function getTrip(id: string): Trip | null {
  return readTrips().find((t) => t.id === id) ?? null;
}

export function saveTrip(trip: Trip) {
  const others = readTrips().filter((t) => t.id !== trip.id);
  writeTrips([trip, ...others]);
}

export function deleteTrip(id: string) {
  writeTrips(readTrips().filter((t) => t.id !== id));
}
