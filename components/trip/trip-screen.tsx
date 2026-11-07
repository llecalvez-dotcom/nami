"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Globe2, RotateCcw } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { CountryStatusPill, SampleBadge } from "@/components/status-badge";
import { Conversation } from "@/components/trip/conversation";
import { Dossier } from "@/components/trip/dossier";
import { useLivePapers } from "@/components/trip/live-papers";
import { PassportCard } from "@/components/trip/passport-card";
import { TryAnotherCountry } from "@/components/trip/try-another-country";
import { VisaProgress } from "@/components/trip/visa-progress";
import { SAMPLE_TRIP_ID } from "@/data/sample";
import { countryName } from "@/lib/countries";
import { destinationImage } from "@/lib/destination-images";
import { requestTripParse } from "@/lib/trip-parse-client";
import { tripStatus, visaSteps } from "@/lib/trip-progress";
import {
  answerQuestion,
  answerQuestionWithText,
  createSampleTrip,
  decideProposal,
  stopAgent,
  type Trip,
} from "@/lib/trip-state";
import { saveTrip, useTrips } from "@/lib/trip-store";

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={value ? "text-2xl font-semibold tracking-tight sm:text-3xl" : "text-2xl font-semibold tracking-tight text-muted-foreground/50 sm:text-3xl"}>
        {value ?? "To confirm"}
      </p>
    </div>
  );
}

export function TripScreen({ id }: { id: string }) {
  const trips = useTrips();
  const demo = useSearchParams().get("demo") === "1";
  const found = trips?.find((t) => t.id === id) ?? null;
  const { destination, country_iso2, arrival_at } = found?.request ?? {};
  const livePapers = useLivePapers(
    found && !found.sample && found.formalities.length > 0 && destination && country_iso2
      ? { destination, country_iso2, arrival_at }
      : null,
  );

  if (trips === null) return <div className="flex-1" aria-busy="true" />;

  const trip = found ?? (id === SAMPLE_TRIP_ID ? createSampleTrip(new Date()) : null);

  if (!trip) {
    return (
      <div className="flex flex-1 flex-col">
        <AppNav />
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start gap-4 px-6 py-24">
          <h1 className="text-5xl font-semibold tracking-tight">Trip not found</h1>
          <p className="text-muted-foreground">It may have been saved in another browser.</p>
          <Link href="/trips" className="font-medium text-primary underline-offset-4 hover:underline">
            Back to your trips
          </Link>
        </main>
      </div>
    );
  }

  const update = (next: Trip) => saveTrip(next);
  const { request } = trip;

  const answerWithText = async (itemId: string, text: string) => {
    const item = trip.conversation.find((i) => i.id === itemId);
    const { request } = await requestTripParse({
      transcript: text,
      current_request: trip.request,
      question: item?.kind === "question" ? item.question : undefined,
    });
    update(answerQuestionWithText(trip, itemId, text, request));
  };

  return (
    <div className="flex flex-1 flex-col pb-28 md:pb-16">
      <AppNav>
        {trip.sample ? (
          <>
            <SampleBadge />
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-card px-3.5 text-sm font-medium shadow-soft transition-colors hover:text-primary"
              onClick={() => update(createSampleTrip(new Date()))}
            >
              <RotateCcw className="size-3.5" /> Reset
            </button>
          </>
        ) : null}
      </AppNav>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-6 sm:px-8 sm:pt-10">
        <section className="grid overflow-hidden rounded-[32px] bg-card shadow-soft md:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col gap-5 p-7 sm:p-10">
            <CountryStatusPill status={tripStatus(trip)} className="self-start" />
            <Fact label="From" value={request.origin_country ? countryName(request.origin_country) : null} />
            <Fact label="To" value={request.destination ?? (request.country_iso2 ? countryName(request.country_iso2) : null)} />
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">“{request.raw_text}”</p>
          </div>
          <div className="relative min-h-56 md:min-h-full">
            <Image
              src={destinationImage(request.destination, request.country_iso2)}
              alt={request.destination ?? "Destination"}
              fill
              priority
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
            <Link
              href="/map"
              className="absolute right-4 bottom-4 inline-flex h-10 items-center gap-2 rounded-full bg-card/90 px-4 text-sm font-medium shadow-soft backdrop-blur transition-colors hover:text-primary"
            >
              <Globe2 className="size-4" /> See on the map
            </Link>
          </div>
        </section>

        <section className="mt-6 rounded-[28px] bg-card p-6 shadow-soft sm:p-8" aria-label="Visa progress">
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Visa progress</h2>
          <VisaProgress steps={visaSteps(trip)} />
        </section>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12">
          <section aria-label="Conversation" className="min-w-0">
            <h2 className="mb-6 text-2xl font-semibold tracking-tight">Talk with Nami</h2>
            <Conversation
              items={trip.conversation}
              onAnswer={(itemId, value, label) => update(answerQuestion(trip, itemId, value, label))}
              onAnswerText={answerWithText}
              onDecide={(itemId, accepted) => update(decideProposal(trip, itemId, accepted, new Date()))}
            />
          </section>
          <aside aria-label="Trip folder" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <Dossier trip={trip} onStop={() => update(stopAgent(trip))} livePapers={livePapers}>
              {trip.formalities.length > 0 || demo ? (
                <PassportCard demo={demo} returnDate={trip.request.return_date} arrivalAt={trip.request.arrival_at} />
              ) : null}
              {demo ? <TryAnotherCountry /> : null}
            </Dossier>
          </aside>
        </div>
      </main>
    </div>
  );
}
