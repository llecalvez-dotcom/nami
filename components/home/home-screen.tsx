"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Globe2, Plus } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { COUNTRY_STATUS } from "@/components/status-badge";
import { TripCard } from "@/components/trip/trip-card";
import { toCard, useAllTrips } from "@/components/trip/use-all-trips";
import { MicButton, VoiceStatusLine } from "@/components/voice/mic-button";
import { useVoiceInput } from "@/components/voice/use-voice-input";
import { createTripFromRequest } from "@/lib/trip-state";
import { requestTripParse } from "@/lib/trip-parse-client";
import { homeCountry, mapCountries } from "@/lib/trip-progress";
import { saveTrip } from "@/lib/trip-store";
import { useWishlist } from "@/lib/wishlist-store";

const EXAMPLES = [
  "I'm flying to Bali on Monday for a friend's wedding, staying ten days.",
  "Two weeks in Tokyo from 3 March, just me.",
  "Business trip to Nairobi next Tuesday, back on Friday.",
];

export function HomeScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const trips = useAllTrips();
  const wishlist = useWishlist();
  const [text, setText] = useState(params.get("q") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const rail = useRef<HTMLDivElement>(null);
  const voice = useVoiceInput(setText);

  const cards = (trips ?? []).map(toCard);
  const world = trips ? mapCountries(trips, wishlist, homeCountry(trips)) : {};
  const counts = Object.values(world).reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { request } = await requestTripParse({ transcript: value });
      const trip = createTripFromRequest(crypto.randomUUID(), request, new Date());
      saveTrip(trip);
      router.push(`/trip/${trip.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col pb-28 md:pb-16">
      <AppNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 sm:px-8">
        <section id="ask" className="scroll-mt-24 pt-10 sm:pt-20">
          <p className="text-sm font-medium text-muted-foreground">Your travel concierge</p>
          <h1 className="mt-3 max-w-3xl text-5xl leading-[1.02] font-semibold tracking-[-0.035em] sm:text-7xl">
            Where to <span className="text-primary">next?</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Tell me about your trip. I take care of what it takes, you keep the last word.
          </p>

          <form onSubmit={submit} className="mt-10 flex max-w-3xl items-center gap-2 rounded-full bg-card p-2 shadow-float">
            <MicButton voice={voice} className="size-12 rounded-full sm:size-14" />
            <label htmlFor="trip-text" className="sr-only">
              Tell me about your trip
            </label>
            <input
              id="trip-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Tell me about your trip"
              className="h-12 min-w-0 flex-1 bg-transparent px-2 text-base outline-none placeholder:text-muted-foreground/70 sm:h-14 sm:text-lg"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={!text.trim() || busy}
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-glow transition-opacity disabled:opacity-40 disabled:shadow-none sm:h-14 sm:px-6"
            >
              <span className="hidden sm:inline">{busy ? "Reading…" : "Send"}</span>
              <ArrowRight className="size-4" />
            </button>
          </form>
          <VoiceStatusLine voice={voice} className="mt-3 pl-4" />
          {error ? (
            <p role="alert" className="mt-3 pl-4 text-sm text-attention-foreground">
              I couldn&apos;t read your request: {error}
            </p>
          ) : (
            <div className="mt-4 flex max-w-3xl flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setText(example)}
                  className="rounded-full bg-card/70 px-4 py-2 text-left text-sm text-muted-foreground shadow-soft transition-colors hover:bg-card hover:text-foreground"
                >
                  {example}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="mt-20" aria-labelledby="trips-title">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="trips-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Let&apos;s pack for your trips
              </h2>
              <p className="mt-2 text-muted-foreground">Every paper, flight and question, one card per trip.</p>
            </div>
            <Link href="/trips" className="hidden shrink-0 text-sm font-medium text-primary sm:inline">
              See all
            </Link>
          </div>
          <div
            ref={rail}
            onScroll={(e) => {
              const el = e.currentTarget;
              const card = el.firstElementChild?.clientWidth ?? 1;
              setPage(Math.round(el.scrollLeft / (card + 20)));
            }}
            className="-mx-5 mt-8 flex snap-x snap-mandatory scroll-px-5 gap-5 sm:scroll-px-8 overflow-x-auto px-5 pt-2 pb-6 [scrollbar-width:none] sm:-mx-8 sm:px-8"
            aria-busy={trips === null}
          >
            {cards.map((card) => (
              <TripCard key={card.id} trip={card} className="w-[82%] shrink-0 snap-start sm:w-[320px]" />
            ))}
            {trips !== null && <Link
              href="#ask"
              className="flex w-[82%] shrink-0 snap-start flex-col items-center justify-center gap-4 rounded-[28px] border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary sm:w-[320px]"
            >
              <span className="grid size-14 place-items-center rounded-full bg-card shadow-soft">
                <Plus className="size-6" />
              </span>
              <span className="text-sm font-medium">Plan a new trip</span>
            </Link>}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex gap-2" aria-hidden>
              {[...cards, null].map((_, i) => (
                <span
                  key={i}
                  className={`size-1.5 rounded-full transition-colors ${i === page ? "bg-foreground" : "bg-foreground/20"}`}
                />
              ))}
            </div>
            <a href="#ask" className="inline-flex items-center gap-4 text-sm font-semibold">
              Add a trip
              <span className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow">
                <Plus className="size-6" />
              </span>
            </a>
          </div>
        </section>

        <section className="mt-16">
          <Link
            href="/map"
            className="group relative flex flex-col gap-6 overflow-hidden rounded-[32px] bg-foreground p-8 text-background sm:flex-row sm:items-end sm:justify-between sm:p-10"
          >
            <div
              aria-hidden
              className="absolute -top-24 -right-24 size-80 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgb(157_140_255/0.55),rgb(91_61_245/0.15)_55%,transparent_70%)]"
            />
            <div className="relative">
              <Globe2 className="size-8 text-[#b9adff]" />
              <h2 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">Your world, at a glance</h2>
              <p className="mt-2 max-w-md text-background/60">
                Home, the places you dream of, and every visa on its way, on one 3D globe.
              </p>
            </div>
            <div className="relative flex flex-wrap items-center gap-x-6 gap-y-3">
              {(["in_progress", "planned", "wish"] as const).map((status) => (
                <span key={status} className="inline-flex items-center gap-2 text-sm text-background/80">
                  <span className="size-2.5 rounded-full" style={{ background: COUNTRY_STATUS[status].color }} />
                  {counts[status] ?? 0} {COUNTRY_STATUS[status].label.toLowerCase()}
                </span>
              ))}
              <span className="grid size-12 place-items-center rounded-full bg-background text-foreground transition-transform group-hover:rotate-45">
                <ArrowUpRight className="size-5" />
              </span>
            </div>
          </Link>
        </section>
      </main>
    </div>
  );
}
