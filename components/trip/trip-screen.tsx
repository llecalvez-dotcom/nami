"use client";

import Link from "next/link";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SampleBadge } from "@/components/status-badge";
import { Conversation } from "@/components/trip/conversation";
import { Dossier } from "@/components/trip/dossier";
import { SAMPLE_TRIP_ID } from "@/data/sample";
import { answerQuestion, createSampleTrip, decideProposal, stopAgent, type Trip } from "@/lib/trip-state";
import { saveTrip, useTrips } from "@/lib/trip-store";

export function TripScreen({ id }: { id: string }) {
  const trips = useTrips();

  if (trips === null) return <div className="flex-1" aria-busy="true" />;

  const trip = trips.find((t) => t.id === id) ?? (id === SAMPLE_TRIP_ID ? createSampleTrip(new Date()) : null);

  if (!trip) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start gap-4 px-6 py-24">
        <h1 className="font-heading text-5xl">Trip not found</h1>
        <p className="text-muted-foreground">It may have been saved in another browser.</p>
        <Link href="/" className="text-primary underline-offset-4 hover:underline">
          Back to your trips
        </Link>
      </main>
    );
  }

  const update = (next: Trip) => saveTrip(next);

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Trips
          </Link>
          <p className="text-sm font-medium tracking-[0.18em] text-primary uppercase">Nami</p>
          <div className="ml-auto flex items-center gap-3">
            {trip.sample ? (
              <>
                <SampleBadge />
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  onClick={() => update(createSampleTrip(new Date()))}
                >
                  <RotateCcw /> Reset
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-10 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
        <section aria-label="Conversation" className="min-w-0">
          <h1 className="mb-8 font-heading text-5xl leading-none tracking-tight sm:text-6xl">
            {trip.request.destination ?? "Your trip"}
          </h1>
          <Conversation
            items={trip.conversation}
            onAnswer={(itemId, value, label) => update(answerQuestion(trip, itemId, value, label))}
            onDecide={(itemId, accepted) => update(decideProposal(trip, itemId, accepted, new Date()))}
          />
        </section>
        <aside aria-label="Trip folder" className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-3xl border bg-[#efebe4]/60 p-6">
            <Dossier trip={trip} onStop={() => update(stopAgent(trip))} />
          </div>
        </aside>
      </main>
    </div>
  );
}
