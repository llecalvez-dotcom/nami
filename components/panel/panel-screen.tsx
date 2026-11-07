"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Plus, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Conversation } from "@/components/trip/conversation";
import { PassportCard } from "@/components/trip/passport-card";
import { useAgentRun } from "@/components/trip/use-agent-run";
import { useTripActions } from "@/components/trip/use-trip-actions";
import { MicButton, VoiceStatusLine } from "@/components/voice/mic-button";
import { MuteToggle } from "@/components/voice/mute-toggle";
import { useVoiceInput } from "@/components/voice/use-voice-input";
import type { PassportFields } from "@/lib/contracts";
import { agentOfficialUrl, showOfficialSite } from "@/lib/official-tab";
import { requestTripParse } from "@/lib/trip-parse-client";
import { createTripFromRequest, isAgentActive, needsPassportReconfirm, pushAgentMessage, type Trip } from "@/lib/trip-state";
import { saveTrip, useTrips } from "@/lib/trip-store";
import { cn } from "@/lib/utils";

const CURRENT_TRIP_KEY = "nami.panel.trip";
export const WATCH_MESSAGE = "Watch the tab on the left: you will see every click. I never click Pay.";

function readCurrentTrip(): string | null {
  try {
    return localStorage.getItem(CURRENT_TRIP_KEY);
  } catch {
    return null;
  }
}

function writeCurrentTrip(id: string | null) {
  try {
    if (id) localStorage.setItem(CURRENT_TRIP_KEY, id);
    else localStorage.removeItem(CURRENT_TRIP_KEY);
  } catch {
    // The panel still works for this visit without storage.
  }
}

// One line for the agent, under the conversation: the last step only, and Stop while it runs.
export function AgentLine({ trip, onStop }: { trip: Trip; onStop: () => void }) {
  const run = trip.agent_run;
  if (!run) return null;
  const active = isAgentActive(run);
  const step = trip.agent_steps.at(-1) ?? "Starting…";
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-2xl bg-[#102934] px-4 py-3 text-[#fffdf3]">
      <span className={cn("size-2.5 shrink-0 rounded-full", active ? "animate-pulse bg-primary" : "bg-[#fffdf3]/40")} aria-hidden />
      <p className="min-w-0 flex-1 truncate text-sm">{step}</p>
      {active ? (
        <button
          type="button"
          onClick={onStop}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-attention px-3 text-xs font-semibold text-white"
        >
          <Square className="size-3 fill-current" /> Stop
        </button>
      ) : null}
    </div>
  );
}

function StartView({ onTrip }: { onTrip: (trip: Trip) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (value: string) => {
    const transcript = value.trim();
    if (!transcript || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { request } = await requestTripParse({ transcript });
      const trip = createTripFromRequest(crypto.randomUUID(), request, new Date());
      saveTrip(trip);
      onTrip(trip);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  };
  // One gesture: what is said is sent right away.
  const voice = useVoiceInput((said) => {
    setText(said);
    void submit(said);
  });

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <p className="label-mono text-[11px] text-muted-foreground">Nami</p>
        <h1 className="mt-2 text-[34px] leading-[1.1] font-medium tracking-[-0.03em]">Where to next?</h1>
        <p className="mt-2 text-sm text-muted-foreground">Tell me about your trip. I fill in the papers, you keep the last word.</p>
      </div>
      <MicButton voice={voice} className="size-24 rounded-full bg-primary text-primary-foreground shadow-glow [&_svg]:size-7" />
      <VoiceStatusLine voice={voice} />
      <form
        className="flex w-full gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(text);
        }}
      >
        <label htmlFor="panel-trip" className="sr-only">
          Tell me about your trip
        </label>
        <input
          id="panel-trip"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="I'm flying to Bali on Monday…"
          className="h-11 min-w-0 flex-1 rounded-full bg-muted px-4 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
        />
        <Button type="submit" size="icon" className="size-11 shrink-0 rounded-full" disabled={!text.trim() || busy} aria-label="Send">
          <ArrowRight className="size-4" />
        </Button>
      </form>
      {busy ? <p role="status" className="text-sm text-muted-foreground">Reading your trip…</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-attention-foreground">
          I couldn&apos;t read your trip yet: {error}
        </p>
      ) : null}
    </div>
  );
}

function TripView({ trip, onNewTrip }: { trip: Trip; onNewTrip: () => void }) {
  const [passport, setPassport] = useState<PassportFields | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [searchRequest, setSearchRequest] = useState(0);
  const [editing, setEditing] = useState(false);
  // The visa proposal the traveller accepted before the passport was there: it starts once the passport is confirmed.
  const waitingVisa = useRef<string | null>(null);
  const secrets = useMemo(() => [passport?.passport_number, passport?.birth_date], [passport]);
  const run = trip.agent_run;
  const reconfirm = needsPassportReconfirm(run, passport !== null);
  useAgentRun(trip.id, run?.session_id ?? null, run !== null && !run.drained && !reconfirm, secrets);

  const actions = useTripActions({
    trip,
    passport,
    documentId,
    onNeedPassport: () => setSearchRequest((request) => request + 1),
    onStarted: (started) => {
      saveTrip(pushAgentMessage(started, WATCH_MESSAGE));
      const url = agentOfficialUrl(started);
      if (url) void showOfficialSite(url);
    },
  });

  const decide = (itemId: string, accepted: boolean) => {
    const item = trip.conversation.find((i) => i.id === itemId);
    if (accepted && item?.kind === "proposal" && item.action === "create_visa" && !passport) waitingVisa.current = itemId;
    actions.decide(itemId, accepted);
  };

  const showPassport = searchRequest > 0 || passport !== null || reconfirm;
  const compact = passport !== null && !editing;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card backdrop-blur-xl">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="label-mono text-[11px] text-muted-foreground">Nami</p>
          <p className="truncate text-sm font-medium">{trip.request.destination ?? "Your trip"}</p>
        </div>
        <div className="flex items-center gap-1">
          <MuteToggle />
          <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={onNewTrip}>
            <Plus className="size-4" /> New trip
          </Button>
        </div>
      </header>
      <main className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        <Conversation
          items={trip.conversation}
          onAnswer={actions.answer}
          onAnswerText={actions.answerWithText}
          onAnswerAgent={(itemId, value) => void actions.answerAgent(itemId, value)}
          onDecide={decide}
        />
        {reconfirm ? (
          <p role="status" className="rounded-2xl bg-muted p-4 text-sm">
            The agent may still be running. Confirm your passport again so I can follow it here; Stop works meanwhile.
          </p>
        ) : null}
        {showPassport ? (
          <section aria-label="Passport">
            {compact ? (
              <div className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-soft">
                <Check className="size-5 shrink-0 text-success" />
                <p className="min-w-0 flex-1 truncate text-sm">
                  Passport confirmed · {passport.surname} · expires {passport.expiry_date}
                </p>
                <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              </div>
            ) : null}
            {/* Kept mounted while compact: the photo and the fields live in its memory only. */}
            <div className={compact ? "hidden" : undefined}>
              <PassportCard
                demo
                returnDate={trip.request.return_date}
                arrivalAt={trip.request.arrival_at}
                searchRequest={searchRequest}
                onDocumentConfirmed={setDocumentId}
                onConfirm={(fields) => {
                  setPassport(fields);
                  if (!fields) return;
                  setEditing(false);
                  const itemId = waitingVisa.current;
                  waitingVisa.current = null;
                  if (itemId) void actions.createVisa(itemId, fields);
                }}
              />
            </div>
          </section>
        ) : null}
      </main>
      {run ? (
        <footer className="border-t border-border px-4 py-3">
          <AgentLine trip={trip} onStop={() => void actions.stop()} />
        </footer>
      ) : null}
    </div>
  );
}

export function PanelScreen() {
  const trips = useTrips();
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  if (trips === null) return <div className="flex-1" aria-busy="true" />;

  const currentId = chosen !== undefined ? chosen : readCurrentTrip();
  const trip = trips.find((t) => t.id === currentId && !t.sample) ?? null;
  const choose = (id: string | null) => {
    writeCurrentTrip(id);
    setChosen(id);
  };

  return (
    <div className="relative z-10 flex h-dvh flex-col">
      {trip ? <TripView key={trip.id} trip={trip} onNewTrip={() => choose(null)} /> : <StartView onTrip={(t) => choose(t.id)} />}
    </div>
  );
}
