"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ExternalLink, Heart, MessageCircleQuestion, Octagon, Search, Sparkles, Trash2, X } from "lucide-react";
import { CountryStatusPill, SampleBadge, StatusBadge } from "@/components/status-badge";
import { LivePapersList, useLivePapers, type PapersQuery } from "@/components/trip/live-papers";
import { VisaProgress } from "@/components/trip/visa-progress";
import { countryName } from "@/lib/countries";
import { destinationImage } from "@/lib/destination-images";
import { formatDate, formatTime } from "@/lib/format";
import { hostOf } from "@/lib/official-sites";
import { tripStatus, visaSteps, type MapCountry } from "@/lib/trip-progress";
import { isAgentActive, stopAgent, type Trip } from "@/lib/trip-state";
import { saveTrip } from "@/lib/trip-store";
import { addWish, removeWish, useWishlist } from "@/lib/wishlist-store";

function LivePapersButton({ iso2, destination }: { iso2: string; destination: string }) {
  const [query, setQuery] = useState<PapersQuery | null>(null);
  const papers = useLivePapers(query);
  if (papers) return <LivePapersList papers={papers} />;
  return (
    <button
      type="button"
      onClick={() => setQuery({ destination, country_iso2: iso2 })}
      className="inline-flex h-10 items-center gap-2 rounded-full bg-muted px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <Search className="size-4" /> What papers do I need? (live check)
    </button>
  );
}

function TripBlock({ trip }: { trip: Trip }) {
  const { request } = trip;
  const run = trip.agent_run;
  const active = isAgentActive(run);
  const openQuestion = trip.conversation.find(
    (i): i is Extract<Trip["conversation"][number], { kind: "question" }> => i.kind === "question" && i.answer === null,
  );
  return (
    <article className="space-y-5">
      <div className="relative aspect-[16/9] overflow-hidden rounded-[22px] bg-muted">
        <Image
          src={destinationImage(request.destination, request.country_iso2)}
          alt={request.destination ?? "Destination"}
          fill
          sizes="420px"
          className="object-cover"
        />
        <div className="absolute top-3 left-3 flex gap-2">
          <CountryStatusPill status={tripStatus(trip)} className="shadow-soft" />
          {trip.sample ? <SampleBadge className="bg-card/90" /> : null}
        </div>
      </div>
      <div>
        <p className="text-2xl font-semibold tracking-tight">{request.destination ?? request.raw_text}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {request.departure_date ? formatDate(request.departure_date) : "Dates to confirm"}
          {request.return_date ? ` to ${formatDate(request.return_date)}` : ""}
        </p>
      </div>

      <section className="rounded-[22px] bg-muted/60 p-4">
        <h3 className="mb-3 text-sm font-semibold">Visa progress</h3>
        <VisaProgress steps={visaSteps(trip)} compact />
      </section>

      {openQuestion ? (
        <Link
          href={`/trip/${trip.id}`}
          className="flex items-start gap-3 rounded-[22px] bg-accent p-4 text-sm text-accent-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          <MessageCircleQuestion className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="block font-semibold">{openQuestion.from === "agent_h" ? "The agent asks you" : "Nami asks you"}</span>
            {openQuestion.question}
          </span>
        </Link>
      ) : null}

      {trip.formalities.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Entry papers</h3>
          <ul className="divide-y divide-border rounded-[22px] bg-card ring-1 ring-border">
            {trip.formalities.map((f) => {
              const host = hostOf(f.official_url) ?? f.official_url;
              return (
                <li key={f.id} className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{f.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {f.official_cost} ·{" "}
                      <a
                        href={f.official_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-primary hover:underline"
                      >
                        {host} <ExternalLink className="size-3" />
                      </a>
                    </p>
                  </div>
                  <StatusBadge status={f.status} checkedAt={f.checked_at} />
                </li>
              );
            })}
          </ul>
        </section>
      ) : request.country_iso2 ? (
        <LivePapersButton iso2={request.country_iso2} destination={request.destination ?? countryName(request.country_iso2)} />
      ) : null}

      {run ? (
        <section className="rounded-[22px] bg-foreground p-4 text-background">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Sparkles className="size-3.5 text-[#b9adff]" /> Agent activity
              </p>
              <p className="text-xs text-background/60">
                Started at {formatTime(run.started_at)} · {run.state.replaceAll("_", " ")}
              </p>
            </div>
            {active ? (
              <button
                type="button"
                onClick={() => saveTrip(stopAgent(trip))}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-destructive px-3 text-xs font-medium text-white"
              >
                <Octagon className="size-3.5" /> Stop
              </button>
            ) : null}
          </div>
          <ol className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-xs text-background/80">
            {trip.agent_steps.slice(-3).map((step, i) => (
              <li key={`${i}-${step}`}>· {step}</li>
            ))}
          </ol>
        </section>
      ) : null}

      <Link
        href={`/trip/${trip.id}`}
        className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-foreground shadow-glow"
      >
        Open the trip <ArrowRight className="size-4" />
      </Link>
    </article>
  );
}

export function CountryPanel({
  country,
  iso2,
  homeTrips,
  passports,
  onClose,
}: {
  country: MapCountry | null;
  iso2: string;
  homeTrips: number;
  passports: string[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const name = countryName(iso2);
  const status = country?.status ?? null;
  const wished = useWishlist().includes(iso2);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center md:justify-end md:p-6" role="presentation">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-foreground/30" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="country-panel-title"
        className="relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-[32px] bg-card shadow-float animate-in slide-in-from-bottom-8 fade-in duration-300 md:max-h-[calc(100vh-3rem)] md:w-[440px] md:rounded-[32px] md:slide-in-from-right-8 md:slide-in-from-bottom-0"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
          <div>
            {status ? <CountryStatusPill status={status} /> : null}
            <h2 id="country-panel-title" className="mt-3 text-3xl font-semibold tracking-tight">
              {name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-muted transition-colors hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 space-y-8 overflow-y-auto px-6 pb-8">
          {status === "home" ? (
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Where you live and where your trips start.
                {passports.length
                  ? ` Nami checks every entry rule for your ${passports.map(countryName).join(" and ")} ${passports.length > 1 ? "passports" : "passport"}.`
                  : null}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[22px] bg-muted p-4">
                  <p className="text-sm text-muted-foreground">{passports.length > 1 ? "Passports" : "Passport"}</p>
                  <p className="text-2xl font-semibold">{passports.length ? passports.join(", ") : "To confirm"}</p>
                </div>
                <div className="rounded-[22px] bg-muted p-4">
                  <p className="text-sm text-muted-foreground">Trips from here</p>
                  <p className="text-2xl font-semibold">{homeTrips}</p>
                </div>
              </div>
            </div>
          ) : null}

          {country?.trips.map((trip) => (
            <TripBlock key={trip.id} trip={trip} />
          ))}

          {wished && status !== "wish" ? (
            <button
              type="button"
              onClick={() => removeWish(iso2)}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-medium text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" /> Remove from wishlist
            </button>
          ) : null}

          {status === "wish" || status === null ? (
            <div className="space-y-4">
              <p className="text-muted-foreground">
                {status === "wish"
                  ? "On your wishlist. Check what it takes to get in, then let Nami plan it."
                  : "Not on your map yet."}
              </p>
              <LivePapersButton iso2={iso2} destination={name} />
              <Link
                href={`/?q=${encodeURIComponent(`I want to go to ${name}`)}#ask`}
                className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-foreground shadow-glow"
              >
                Plan this trip <ArrowRight className="size-4" />
              </Link>
              {status === "wish" ? (
                <button
                  type="button"
                  onClick={() => {
                    removeWish(iso2);
                    onClose();
                  }}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-medium text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" /> Remove from wishlist
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => addWish(iso2)}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-muted text-sm font-medium"
                >
                  <Heart className="size-4" /> Add to wishlist
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
