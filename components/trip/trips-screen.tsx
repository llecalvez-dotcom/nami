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
          className="glass hidden h-11 items-center gap-2 px-4 text-sm font-medium md:inline-flex"
        >
          <Plus className="size-4" /> New trip
        </Link>
      </AppNav>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-12 sm:px-7 sm:pt-20">
        <div className="on-sky text-center">
          <p className="label-mono text-[11px]">Selected trips</p>
          <h1 className="mt-3 text-[45px] leading-[1.05] sm:text-7xl">
            <span className="font-script font-bold">Your</span> <span className="mix-serif">trips.</span>
          </h1>
        </div>
        <section className="poster poster-chartreuse mt-12 p-5 sm:p-8">
          <div className="flex items-center justify-between label-mono">
            <span>Nami · trips</span>
            <span>Take a look</span>
          </div>
          <p className="mt-4 max-w-md text-[18px] leading-snug">Open a trip to answer Nami, follow your papers and the agent.</p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy={trips === null}>
            {(trips ?? []).map((trip) => (
              <TripCard key={trip.id} trip={toCard(trip)} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
