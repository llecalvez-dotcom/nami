"use client";

import { SAMPLE_TRIP_ID } from "@/data/sample";
import { tripStatus } from "@/lib/trip-progress";
import { createSampleTrip, type Trip } from "@/lib/trip-state";
import { useTrips } from "@/lib/trip-store";
import type { TripCardData } from "@/components/trip/trip-card";

// Saved trips plus the sample trip (always listed, even before it is opened). null while loading.
export function useAllTrips(): Trip[] | null {
  const trips = useTrips();
  if (trips === null) return null;
  return trips.some((t) => t.id === SAMPLE_TRIP_ID) ? trips : [...trips, createSampleTrip(new Date())];
}

export function toCard(trip: Trip): TripCardData {
  return { id: trip.id, sample: trip.sample, request: trip.request, status: tripStatus(trip) };
}
