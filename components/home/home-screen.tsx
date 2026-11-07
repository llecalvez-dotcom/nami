"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type CSSProperties } from "react";
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
  const sample = (trips ?? []).find((trip) => trip.sample && trip.request.destination === "Bali");
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
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-7">
        <section id="ask" className="on-sky mx-auto flex max-w-3xl scroll-mt-24 flex-col items-center pt-14 text-center sm:pt-24">
          <p className="label-mono text-[11px]">Your travel concierge</p>
          <h1 className="mt-4 text-[45px] leading-[1.05] sm:text-[88px]">
            <span className="font-script font-bold tracking-[-0.025em]">Where to</span> <span className="mix-serif">next?</span>
          </h1>
          <p className="mt-5 max-w-xl text-[18px] leading-[1.4] opacity-85">
            Tell me about your trip. I take care of what it takes, you keep the last word.
          </p>

          <form onSubmit={submit} className="glass mt-10 flex w-full flex-wrap items-center gap-2 p-1.5 text-left focus-within:ring-3 focus-within:ring-[var(--ink)]/60 sm:flex-nowrap">
            <MicButton voice={voice} className="size-12 rounded-full" />
            <label htmlFor="trip-text" className="sr-only">
              Tell me about your trip
            </label>
            <input
              id="trip-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Tell me about your trip"
              className="h-12 min-w-0 flex-1 bg-transparent px-2 text-base text-[var(--ink)] outline-none placeholder:text-[var(--ink)]/60 sm:text-lg"
            />
            <button
              type="submit"
              disabled={!text.trim() || busy}
              className="inline-flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-[#102934] px-5 text-sm font-semibold text-[#fffdf3] disabled:opacity-40 sm:w-auto night:bg-[#f4faff] night:text-[#102934]"
            >
              <span>{busy ? "Reading…" : "Plan my trip"}</span>
              <ArrowRight className="size-4" />
            </button>
          </form>
          <VoiceStatusLine voice={voice} className="mt-3" />
          {error ? (
            <div role="alert" className="glass-help mt-3 px-4 py-3 text-left text-sm">
              <p>I couldn&apos;t plan your trip yet. Your text is saved here. Try again or explore the sample trip.</p>
              <p className="mt-1 text-xs opacity-75">{error}</p>
              {sample ? (
                <Link href={`/trip/${sample.id}`} className="mt-2 inline-flex min-h-11 items-center gap-2 font-semibold underline underline-offset-4">
                  Open sample Bali trip <ArrowRight className="size-4" />
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="stagger-in mt-4 flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((example, i) => (
                <button
                  key={example}
                  type="button"
                  style={{ "--i": i } as CSSProperties}
                  onClick={() => setText(example)}
                  className="min-h-11 rounded-2xl px-3 py-2 text-left text-xs opacity-75 hover:bg-white/10 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {example}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="poster poster-yellow mx-auto mt-20 max-w-[960px] overflow-hidden pt-6" aria-labelledby="trips-title">
          <div className="flex items-center justify-between px-6 label-mono sm:px-8">
            <span>Nami · trips</span>
            <Link href="/trips" className="underline-offset-4 hover:underline">
              See all
            </Link>
          </div>
          <div className="px-6 pt-6 sm:px-8">
            <h2 id="trips-title" className="display-title text-[45px] sm:text-[56px]">
              Let&apos;s pack for your <span className="mix-serif">trips.</span>
            </h2>
            <p className="mt-2 text-[18px] leading-[1.4]">Every paper, flight and question, one card per trip.</p>
          </div>
          <div
            ref={rail}
            onScroll={(e) => {
              const el = e.currentTarget;
              const card = el.firstElementChild?.clientWidth ?? 1;
              setPage(Math.round(el.scrollLeft / (card + 20)));
            }}
            className="mt-8 flex snap-x snap-mandatory scroll-px-6 gap-5 overflow-x-auto px-6 pt-2 pb-6 [scrollbar-width:none] sm:scroll-px-8 sm:px-8"
            aria-busy={trips === null}
          >
            {cards.map((card) => (
              <TripCard key={card.id} trip={card} className="w-[82%] shrink-0 snap-start sm:w-[300px]" />
            ))}
            {trips !== null && (
              <Link
                href="#ask"
                className="flex min-h-64 w-[82%] shrink-0 snap-start flex-col items-center justify-center gap-4 rounded-[18px] border-2 border-dashed border-border transition-colors hover:border-primary sm:w-[300px]"
              >
                <span className="glass grid size-14 place-items-center">
                  <Plus className="size-6" />
                </span>
                <span className="label-mono">Plan a new trip</span>
              </Link>
            )}
          </div>
          <div className="flex items-center justify-between px-6 pb-6 sm:px-8">
            <div className="flex gap-2" aria-hidden>
              {[...cards, null].map((_, i) => (
                <span
                  key={i}
                  className={`size-1.5 rounded-full transition-colors ${i === page ? "bg-foreground" : "bg-foreground/25"}`}
                />
              ))}
            </div>
            <a href="#ask" className="glass inline-flex h-12 items-center gap-3 px-5 font-mono text-[11px] tracking-[0.1em] uppercase">
              Add a trip <Plus className="size-4" />
            </a>
          </div>
          <div className="marquee overflow-hidden bg-foreground py-2.5 text-background" aria-hidden>
            <div>
              {[0, 1].map((k) => (
                <span key={k} className="flex shrink-0 font-mono text-[11px] tracking-[0.12em] uppercase">
                  {Array.from({ length: 6 }, (_, i) => (
                    <span key={i} className="px-4">
                      Plan a trip · Check your papers · Nami fills the forms · You keep the last word ·
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto mt-10 max-w-[960px]">
          <Link
            href="/map"
            className="group poster poster-mint flex flex-col gap-6 p-7 sm:flex-row sm:items-end sm:justify-between sm:p-10"
          >
            <div>
              <p className="label-mono flex items-center gap-2">
                <Globe2 className="size-3.5" /> World map
              </p>
              <h2 className="mt-5 text-[32px] leading-[1.15] font-medium sm:text-[40px]">
                Your world, at a <span className="mix-serif">glance.</span>
              </h2>
              <p className="mt-2 max-w-md text-muted-foreground">
                Home, the places you dream of, and every visa on its way, on one 3D globe.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {(["in_progress", "planned", "wish"] as const).map((status) => (
                <span key={status} className="inline-flex items-center gap-2 text-sm">
                  <span className="size-2.5 rounded-full ring-1 ring-black/15" style={{ background: COUNTRY_STATUS[status].color }} />
                  {counts[status] ?? 0} {COUNTRY_STATUS[status].label.toLowerCase()}
                </span>
              ))}
              <span className="glass grid size-12 place-items-center transition-transform group-hover:rotate-45">
                <ArrowUpRight className="size-5" />
              </span>
            </div>
          </Link>
        </section>
      </main>
    </div>
  );
}
