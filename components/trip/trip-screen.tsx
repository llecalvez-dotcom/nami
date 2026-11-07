"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SampleBadge } from "@/components/status-badge";
import { AgentSettingsCard, filePaths, readAgentSettings } from "@/components/trip/agent-settings";
import { Conversation } from "@/components/trip/conversation";
import { Dossier } from "@/components/trip/dossier";
import { useLivePapers } from "@/components/trip/live-papers";
import { PassportCard } from "@/components/trip/passport-card";
import { TryAnotherCountry } from "@/components/trip/try-another-country";
import { cancelAgent, rawToolReq, sendAgentAnswer, useAgentRun } from "@/components/trip/use-agent-run";
import { SAMPLE_TRIP_ID } from "@/data/sample";
import { requestTripParse } from "@/lib/trip-parse-client";
import type { PassportFields } from "@/lib/contracts";
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

async function startVisaSession(trip: Trip, passport: PassportFields): Promise<string> {
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
    }),
  });
  const body = (await response.json().catch(() => null)) as { session_id?: string; error?: string } | null;
  if (!response.ok || !body?.session_id) throw new Error(body?.error ?? `The agent could not start (${response.status}).`);
  return body.session_id;
}

export function TripScreen({ id }: { id: string }) {
  const trips = useTrips();
  const demo = useSearchParams().get("demo") === "1";
  const found = trips?.find((t) => t.id === id) ?? null;
  const { destination, country_iso2, arrival_at } = found?.request ?? {};
  const [passport, setPassport] = useState<PassportFields | null>(null);
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
  const latest = () => getTrip(trip.id) ?? trip;

  const createVisa = async (itemId: string) => {
    if (starting) return;
    if (!readAgentSettings().local_session_id.trim()) {
      update(pushAgentMessage(trip, "Open this page with ?demo=1 and fill in Local browser session (the id printed by holo local browser) first."));
      return;
    }
    if (!passport) {
      update(pushAgentMessage(trip, "Send me a photo of your passport and confirm its fields first: the agent needs them."));
      return;
    }
    setStarting(true);
    try {
      const sessionId = await startVisaSession(trip, passport);
      update(startVisaRun(latest(), itemId, sessionId, new Date()));
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
            onAnswerText={answerWithText}
            onAnswerAgent={(itemId, value) => void onAnswerAgent(itemId, value)}
            onDecide={decide}
          />
        </section>
        <aside aria-label="Trip folder" className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-3xl border bg-[#efebe4]/60 p-6">
            <Dossier trip={trip} onStop={() => void stop()} livePapers={livePapers}>
              {reconfirm ? (
                <p role="status" className="rounded-2xl border border-primary/40 bg-background p-4 text-sm">
                  The agent may still be running in Chrome. Send your passport photo again and confirm its fields: I show
                  its progress here only after that. Stop agent works meanwhile.
                </p>
              ) : null}
              {trip.formalities.length > 0 || demo || reconfirm ? (
                <PassportCard
                  demo={demo}
                  returnDate={trip.request.return_date}
                  arrivalAt={trip.request.arrival_at}
                  onConfirm={setPassport}
                />
              ) : null}
              {demo && !trip.sample ? <AgentSettingsCard /> : null}
              {demo ? <TryAnotherCountry /> : null}
            </Dossier>
          </div>
        </aside>
      </main>
    </div>
  );
}
