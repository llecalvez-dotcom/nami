"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Globe2, RotateCcw } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { CountryStatusPill, SampleBadge } from "@/components/status-badge";
import { AgentSettingsCard, filePaths, readAgentSettings } from "@/components/trip/agent-settings";
import { Conversation } from "@/components/trip/conversation";
import { Dossier } from "@/components/trip/dossier";
import { useLivePapers } from "@/components/trip/live-papers";
import { PassportCard } from "@/components/trip/passport-card";
import { TryAnotherCountry } from "@/components/trip/try-another-country";
import { cancelAgent, rawToolReq, sendAgentAnswer, useAgentRun } from "@/components/trip/use-agent-run";
import { VisaProgress } from "@/components/trip/visa-progress";
import { SAMPLE_TRIP_ID } from "@/data/sample";
import { countryName } from "@/lib/countries";
import { destinationImage } from "@/lib/destination-images";
import { requestTripParse } from "@/lib/trip-parse-client";
import { missingPassportMessage } from "@/lib/passport-reminder";
import type { PassportFields } from "@/lib/contracts";
import { tripStatus, visaSteps } from "@/lib/trip-progress";
import {
  answerAgentQuestion,
  answerQuestion,
  answerQuestionWithText,
  createSampleTrip,
  decideProposal,
  needsPassportReconfirm,
  pushAgentMessage,
  reopenAgentQuestion,
  startVisaRun,
  stopAgent,
  type Trip,
} from "@/lib/trip-state";
import { getTrip, saveTrip, useTrips } from "@/lib/trip-store";

async function startVisaSession(trip: Trip, passport: PassportFields, documentId: string | null): Promise<string> {
  const settings = readAgentSettings();
  const response = await fetch("/api/papers/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      request: trip.request,
      passport,
      paper_id: "evoa",
      local_session_id: settings.local_session_id.trim(),
      file_paths: filePaths(settings.files),
      ...(documentId ? { document_id: documentId } : {}),
    }),
  });
  const body = (await response.json().catch(() => null)) as { session_id?: string; error?: string } | null;
  if (!response.ok || !body?.session_id) throw new Error(body?.error ?? `The agent could not start (${response.status}).`);
  return body.session_id;
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="label-mono text-muted-foreground">{label}</p>
      <p className={value ? "text-[32px] leading-[1.15] font-medium tracking-[-0.04em]" : "text-[32px] leading-[1.15] font-medium tracking-[-0.04em] text-muted-foreground/60"}>
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
  const [passport, setPassport] = useState<PassportFields | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [passportSearchRequest, setPassportSearchRequest] = useState(0);
  const passportCard = useRef<HTMLDivElement>(null);
  const [starting, setStarting] = useState(false);
  const secrets = useMemo(() => [passport?.passport_number, passport?.birth_date], [passport]);
  const liveRun = found && !found.sample ? found.agent_run : null;
  const reconfirm = needsPassportReconfirm(liveRun, passport !== null);
  useAgentRun(id, liveRun?.session_id ?? null, liveRun !== null && !liveRun.drained && !reconfirm, secrets);
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
        <main className="poster poster-alu mx-auto mt-16 flex w-[calc(100%-2rem)] max-w-3xl flex-col items-start gap-4 p-8 sm:p-12">
          <p className="label-mono">Nami · trip</p>
          <h1 className="text-[45px] leading-[1.05] font-medium tracking-[-0.04em]">Trip not found</h1>
          <p className="text-muted-foreground">It may have been saved in another browser.</p>
          <Link href="/trips" className="font-medium text-primary underline-offset-4 hover:underline">
            Back to your trips
          </Link>
        </main>
      </div>
    );
  }

  const update = (next: Trip) => saveTrip(next);
  const latest = () => getTrip(trip.id) ?? trip;

  const createVisa = async (itemId: string) => {
    if (starting) return;
    if (!passport) {
      let documentsAvailable = false;
      try {
        const response = await fetch("/api/documents/find", { cache: "no-store" });
        if (response.ok) {
          const result = await response.json() as { enabled?: boolean };
          documentsAvailable = result.enabled === true;
        }
      } catch {
        // Upload and manual entry remain available if search discovery fails.
      }
      let readerAvailable = false;
      try {
        const response = await fetch("/api/documents/extract");
        if (response.ok) {
          const result = await response.json() as { reader?: string };
          readerAvailable = result.reader === "h" || result.reader === "anthropic";
        }
      } catch {
        // Manual entry remains available if reader discovery fails.
      }
      const reminder = missingPassportMessage(readerAvailable, documentsAvailable);
      const current = latest();
      const lastMessage = [...current.conversation].reverse().find((item) => item.kind === "agent");
      if (lastMessage?.text !== reminder) update(pushAgentMessage(current, reminder));
      if (documentsAvailable) {
        setPassportSearchRequest((request) => request + 1);
      } else {
        requestAnimationFrame(() => {
          const card = passportCard.current;
          card?.scrollIntoView({ behavior: "smooth", block: "center" });
          const field = card?.querySelector<HTMLInputElement>('input:not([type="checkbox"]):not([type="file"])');
          (field ?? card)?.focus({ preventScroll: true });
        });
      }
      return;
    }
    if (!readAgentSettings().local_session_id.trim()) {
      update(pushAgentMessage(trip, "Open this page with ?demo=1 and fill in Local browser session (the id printed by holo local browser) first."));
      return;
    }
    setStarting(true);
    try {
      const sessionId = await startVisaSession(trip, passport, documentId);
      update(startVisaRun(latest(), itemId, sessionId, new Date(), documentId !== null));
    } catch (error) {
      update(pushAgentMessage(latest(), (error as Error).message));
    } finally {
      setStarting(false);
    }
  };

  const decide = (itemId: string, accepted: boolean) => {
    const item = trip.conversation.find((i) => i.id === itemId);
    if (accepted && !trip.sample && item?.kind === "proposal" && item.action === "create_visa") return void createVisa(itemId);
    update(decideProposal(trip, itemId, accepted, new Date()));
  };

  const onAnswerAgent = async (itemId: string, value: string) => {
    const current = latest();
    const answered = answerAgentQuestion(current, itemId, value);
    const item = current.conversation.find((i) => i.id === itemId);
    if (answered === current || item?.kind !== "agent_question" || !current.agent_run) return;
    update(answered);
    try {
      await sendAgentAnswer(current.agent_run.session_id, rawToolReq(current.agent_run.session_id, item.tool_req), value);
    } catch {
      update(reopenAgentQuestion(latest(), itemId));
    }
  };

  const stop = async () => {
    const current = latest();
    if (!current.sample && current.agent_run) {
      try {
        await cancelAgent(current.agent_run.session_id);
      } catch (error) {
        update(pushAgentMessage(latest(), `${(error as Error).message} Run holo local stop in a terminal to stop it.`));
        return;
      }
    }
    update(stopAgent(latest()));
  };
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
              className="glass inline-flex h-10 items-center gap-1.5 px-3 font-mono text-[11px] tracking-[0.1em] uppercase sm:px-4"
              onClick={() => update(createSampleTrip(new Date()))}
            >
              <RotateCcw className="size-3.5" /> <span className="sr-only sm:not-sr-only">Reset</span>
            </button>
          </>
        ) : null}
      </AppNav>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 sm:px-7 sm:pt-10">
        <section className="poster poster-alu grid overflow-hidden md:grid-cols-[1.1fr_1fr]">
          <div className="flex flex-col gap-5 p-7 sm:p-10">
            <div className="flex items-center justify-between gap-3">
              <span className="label-mono">Nami · trip folder</span>
              <CountryStatusPill status={tripStatus(trip)} />
            </div>
            <Fact label="From" value={request.origin_country ? countryName(request.origin_country) : null} />
            <Fact label="To" value={request.destination ?? (request.country_iso2 ? countryName(request.country_iso2) : null)} />
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">“{request.raw_text}”</p>
          </div>
          <div className="riso relative min-h-56 md:min-h-full">
            <Image
              src={destinationImage(request.destination, request.country_iso2)}
              alt={request.destination ?? "Destination"}
              fill
              priority
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
            <Link
              href="/map"
              className="glass absolute right-4 bottom-4 z-10 inline-flex h-11 bg-[rgb(255_253_243/0.88)] items-center gap-2 px-4 font-mono text-[11px] tracking-[0.1em] text-[#102934] uppercase"
            >
              <Globe2 className="size-4" /> See on the map
            </Link>
          </div>
        </section>

        <section className="poster poster-alu mt-6 p-6 sm:p-8" aria-label="Visa progress">
          <h2 className="mb-4 text-[20px] font-medium tracking-[-0.5px]">Visa progress</h2>
          <VisaProgress steps={visaSteps(trip)} />
        </section>

        <div className="poster poster-alu mt-6 grid gap-10 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12">
          <section aria-label="Conversation" className="min-w-0">
            <p className="label-mono">Conversation</p>
            <h2 className="mt-2 mb-6 text-[32px] leading-[1.15] font-medium">
              Talk with <span className="mix-serif">Nami.</span>
            </h2>
            <Conversation
              items={trip.conversation}
              onAnswer={(itemId, value, label) => update(answerQuestion(trip, itemId, value, label))}
              onAnswerText={answerWithText}
              onAnswerAgent={(itemId, value) => void onAnswerAgent(itemId, value)}
              onDecide={decide}
            />
          </section>
          <aside aria-label="Trip folder" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <Dossier trip={trip} onStop={() => void stop()} livePapers={livePapers}>
              {reconfirm ? (
                <p role="status" className="rounded-2xl border border-primary/40 bg-background p-4 text-sm">
                  The agent may still be running in Chrome. Confirm your passport fields again: I show its progress here
                  only after that. Stop agent works meanwhile.
                </p>
              ) : null}
              {trip.formalities.length > 0 || demo || reconfirm ? (
                <div ref={passportCard} tabIndex={-1} className="scroll-mt-24">
                  <PassportCard
                    demo={demo}
                    returnDate={trip.request.return_date}
                    arrivalAt={trip.request.arrival_at}
                    onConfirm={setPassport}
                    onDocumentConfirmed={setDocumentId}
                    searchRequest={passportSearchRequest}
                  />
                </div>
              ) : null}
              {demo && !trip.sample ? <AgentSettingsCard /> : null}
              {demo ? <TryAnotherCountry /> : null}
            </Dossier>
          </aside>
        </div>
      </main>
    </div>
  );
}
