"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { TripCard } from "@/components/trip/trip-card";
import { toCard, useAllTrips } from "@/components/trip/use-all-trips";

export function TripsScreen() {
  const trips = useAllTrips();
  return (
    <div className="flex flex-1 flex-col pb-28 md:pb-16">
      <AppNav>
        <Link
          href="/#ask"
          className="hidden h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-glow md:inline-flex"
        >
          <Plus className="size-4" /> New trip
        </Link>
      </AppNav>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-10 sm:px-8 sm:pt-16">
        <h1 className="text-4xl font-semibold tracking-[-0.03em] sm:text-6xl">Your trips</h1>
        <p className="mt-3 text-muted-foreground">Open a trip to answer Nami, follow your papers and the agent.</p>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-busy={trips === null}>
          {(trips ?? []).map((trip) => (
            <TripCard key={trip.id} trip={toCard(trip)} />
          ))}
        </div>
      </main>
    </div>
  );
}
