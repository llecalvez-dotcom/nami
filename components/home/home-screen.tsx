"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SampleBadge } from "@/components/status-badge";
import { SAMPLE_DRAFT, SAMPLE_TRIP_ID } from "@/data/sample";
import { formatDate } from "@/lib/format";
import { createTripFromText, type Trip } from "@/lib/trip-state";
import { saveTrip, useTrips } from "@/lib/trip-store";

function tripTitle(trip: Pick<Trip, "request">): string {
  return trip.request.destination ?? trip.request.raw_text;
}

function tripDates(trip: Pick<Trip, "request">): string {
  const { departure_date, return_date } = trip.request;
  if (!departure_date) return "Dates to confirm";
  return return_date ? `${formatDate(departure_date)} → ${formatDate(return_date)}` : formatDate(departure_date);
}

export function HomeScreen() {
  const router = useRouter();
  const trips = useTrips();
  const [text, setText] = useState("");

  const savedTrips = trips ?? [];
  const hasSample = savedTrips.some((t) => t.id === SAMPLE_TRIP_ID);
  const listed: Pick<Trip, "id" | "sample" | "request">[] = hasSample
    ? savedTrips
    : [...savedTrips, { id: SAMPLE_TRIP_ID, sample: true, request: SAMPLE_DRAFT }];

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    const trip = createTripFromText(crypto.randomUUID(), value, new Date());
    saveTrip(trip);
    router.push(`/trip/${trip.id}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pt-16 pb-24 sm:pt-24">
      <p className="text-sm font-medium tracking-[0.18em] text-primary uppercase">Nami</p>
      <h1 className="mt-6 font-heading text-6xl leading-[0.95] tracking-tight sm:text-8xl">
        Where to <em className="text-primary">next?</em>
      </h1>
      <p className="mt-5 max-w-lg text-lg text-muted-foreground">
        Tell me about your trip. I take care of what it takes, you keep the last word.
      </p>

      <form onSubmit={submit} className="mt-12 flex items-center gap-3 rounded-2xl border bg-card p-2.5 shadow-[0_1px_2px_rgba(36,42,41,0.04),0_8px_24px_-12px_rgba(36,42,41,0.12)]">
        <button
          type="button"
          disabled
          title="Voice input is not wired yet"
          aria-label="Record your trip (not available yet)"
          className="grid size-14 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground opacity-60"
        >
          <Mic className="size-6" />
        </button>
        <label htmlFor="trip-text" className="sr-only">
          Tell me about your trip
        </label>
        <input
          id="trip-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tell me about your trip"
          className="h-14 min-w-0 flex-1 bg-transparent px-2 text-lg outline-none placeholder:text-muted-foreground/70"
        />
        <Button type="submit" size="lg" className="h-12 rounded-xl px-4" disabled={!text.trim()}>
          Go <ArrowRight />
        </Button>
      </form>
      <p className="mt-3 pl-1 text-sm text-muted-foreground">
        e.g. “I&apos;m flying to Bali on Monday for a friend&apos;s wedding, staying ten days.”
      </p>

      <section className="mt-20">
        <h2 className="text-sm font-medium tracking-[0.18em] text-muted-foreground uppercase">Your trips</h2>
        <ul className="mt-4 divide-y rounded-2xl border bg-card">
          {listed.map((trip) => (
            <li key={trip.id}>
              <Link
                href={`/trip/${trip.id}`}
                className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading text-2xl">{tripTitle(trip)}</p>
                  <p className="text-sm text-muted-foreground">{tripDates(trip)}</p>
                </div>
                {trip.sample ? <SampleBadge /> : null}
                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
