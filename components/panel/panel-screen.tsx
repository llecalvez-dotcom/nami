"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Plus, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Conversation } from "@/components/trip/conversation";
import { PassportCard } from "@/components/trip/passport-card";
import { PhotoCard } from "@/components/trip/photo-card";
import { useAgentRun } from "@/components/trip/use-agent-run";
import { useTripActions } from "@/components/trip/use-trip-actions";
import { MicButton, VoiceStatusLine } from "@/components/voice/mic-button";
import { MuteToggle } from "@/components/voice/mute-toggle";
import { useVoiceInput } from "@/components/voice/use-voice-input";
import type { DocumentExtraction, PassportFields } from "@/lib/contracts";
import { bestFirst, foundPassportText, foundPhotoText, readSummary, type Reader } from "@/lib/panel-documents";
import { requestTripParse } from "@/lib/trip-parse-client";
import {
  acceptProposal,
  createTripFromRequest,
  isAgentActive,
  needsPassportReconfirm,
  pushAgentMessage,
  pushProposal,
  type Trip,
} from "@/lib/trip-state";
import { getTrip, saveTrip, useTrips } from "@/lib/trip-store";
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

type Found = { id: string; name: string; score: number };

async function findDocuments(kind: "passport" | "photo"): Promise<Found[]> {
  try {
    const response = await fetch(`/api/documents/find?kind=${kind}`, { cache: "no-store" });
    if (!response.ok) return [];
    const body = (await response.json()) as { documents?: Found[] };
    return bestFirst(body.documents ?? []);
  } catch {
    return [];
  }
}

async function documentReader(): Promise<Reader | null> {
  try {
    const response = await fetch("/api/documents/extract", { cache: "no-store" });
    const body = (await response.json()) as { reader?: string };
    return body.reader === "h" || body.reader === "anthropic" ? body.reader : null;
  } catch {
    return null;
  }
}

function TripView({ trip, onNewTrip }: { trip: Trip; onNewTrip: () => void }) {
  const [passport, setPassport] = useState<PassportFields | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  // Set by the photo card when the spoken path falls back to the cards.
  const [photoDocumentId, setPhotoDocumentId] = useState<string | null>(null);
  const [searchRequest, setSearchRequest] = useState(0);
  const [manual, setManual] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // The spoken passport and photo steps, in memory only (never in the saved trip).
  const flow = useRef<{
    visaItem: string | null;
    passports: Found[];
    reader: Reader | null;
    offered: string | null;
    read: { fields: PassportFields; documentId: string } | null;
    photos: Found[];
  }>({ visaItem: null, passports: [], reader: null, offered: null, read: null, photos: [] });
  const secrets = useMemo(() => [passport?.passport_number, passport?.birth_date], [passport]);
  const run = trip.agent_run;
  const reconfirm = needsPassportReconfirm(run, passport !== null);
  useAgentRun(trip.id, run?.session_id ?? null, run !== null && !run.drained && !reconfirm, secrets);

  const actions = useTripActions({
    trip,
    passport,
    documentId,
    photoDocumentId,
    onNeedPassport: () => setSearchRequest((request) => request + 1),
    // No tab is opened here: the agent drives the tab already open next to the panel. Opening the official site
    // before the agent reaches it would create a second official tab, and upload_file refuses to choose between two.
    onStarted: (started) => saveTrip(pushAgentMessage(started, WATCH_MESSAGE)),
  });
  const latest = () => getTrip(trip.id) ?? trip;
  const say = (text: string) => saveTrip(pushAgentMessage(latest(), text));
  const ask = (action: "read_passport" | "confirm_passport" | "use_photo", text: string, yes: string, no: string) =>
    saveTrip(pushProposal(latest(), action, text, yes, no));

  // The visa first: the entry papers are accepted for the traveller, the visa proposal follows right away.
  useEffect(() => {
    const papers = trip.conversation.find((i) => i.kind === "proposal" && i.action === "papers" && i.decision === null);
    if (papers) actions.decide(papers.id, true);
  });

  const fallBackToCard = (text: string) => {
    say(text);
    setManual(true);
    setSearchRequest((request) => request + 1);
  };

  const startAgent = (photoDocumentId?: string) => {
    const read = flow.current.read;
    const visaItem = flow.current.visaItem;
    if (!read || !visaItem) return;
    void actions.createVisa(visaItem, { passport: read.fields, documentId: read.documentId, photoDocumentId });
  };

  const offerPassport = () => {
    const next = flow.current.passports.shift();
    if (!next || !flow.current.reader) {
      fallBackToCard("I could not find your passport on this computer. Send me a photo of it, or type its fields below.");
      return;
    }
    flow.current.offered = next.id;
    ask("read_passport", foundPassportText(next, flow.current.reader), "Yes, read it", "Not this one");
  };

  const lookForPassport = async () => {
    setBusy("Looking for your passport…");
    const [passports, reader] = await Promise.all([findDocuments("passport"), documentReader()]);
    setBusy(null);
    flow.current.passports = passports;
    flow.current.reader = reader;
    offerPassport();
  };

  const readPassport = async () => {
    const documentToRead = flow.current.offered;
    const reader = flow.current.reader;
    if (!documentToRead || !reader) return;
    setBusy("Reading your passport…");
    try {
      const response = await fetch("/api/documents/extract-found", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: documentToRead, consent_provider: reader }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The passport could not be read.");
      const summary = readSummary(body as DocumentExtraction);
      if (!summary.ok) return fallBackToCard(summary.text);
      flow.current.read = { fields: summary.fields, documentId: documentToRead };
      ask("confirm_passport", summary.text, "Yes, that's me", "Let me check");
    } catch (error) {
      fallBackToCard(`${(error as Error).message} Send me a photo of your passport, or type its fields below.`);
    } finally {
      setBusy(null);
    }
  };

  const confirmPassport = async () => {
    const read = flow.current.read;
    if (!read) return;
    setPassport(read.fields);
    setDocumentId(read.documentId);
    setBusy("Looking for your ID photo…");
    const photos = await findDocuments("photo");
    setBusy(null);
    flow.current.photos = photos;
    const photo = photos[0];
    if (photo) ask("use_photo", foundPhotoText(photo), "Yes, use it", "No");
    else startAgent();
  };

  const decide = (itemId: string, accepted: boolean) => {
    const current = latest();
    const item = current.conversation.find((i) => i.id === itemId);
    if (item?.kind !== "proposal") return actions.decide(itemId, accepted);
    if (item.action === "create_visa" && accepted && !passport) {
      flow.current.visaItem = itemId;
      saveTrip(pushAgentMessage(acceptProposal(current, itemId), "I need your passport: I am looking for it on this computer."));
      void lookForPassport();
      return;
    }
    if (item.action === "read_passport" || item.action === "confirm_passport" || item.action === "use_photo") {
      actions.decide(itemId, accepted);
      if (item.action === "read_passport") return void (accepted ? readPassport() : offerPassport());
      if (item.action === "confirm_passport") return accepted ? void confirmPassport() : fallBackToCard("Check the fields below, then confirm them.");
      return startAgent(accepted ? flow.current.photos[0]?.id : undefined);
    }
    actions.decide(itemId, accepted);
  };

  const showCard = manual || reconfirm;
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
        {busy ? (
          <p role="status" className="px-2 text-sm text-muted-foreground">
            {busy}
          </p>
        ) : null}
        {reconfirm ? (
          <p role="status" className="rounded-2xl bg-muted p-4 text-sm">
            The agent may still be running. Confirm your passport again so I can follow it here; Stop works meanwhile.
          </p>
        ) : null}
        {compact ? (
          <div className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-soft">
            <Check className="size-5 shrink-0 text-success" />
            <p className="min-w-0 flex-1 truncate text-sm">
              Passport confirmed · {passport.surname} · expires {passport.expiry_date}
            </p>
            <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={() => { setEditing(true); setManual(true); }}>
              Edit
            </Button>
          </div>
        ) : null}
        {showCard ? (
          // Only when the spoken path fails or the traveller asks to edit: kept mounted, its fields live in its memory.
          <section aria-label="Passport" className={compact ? "hidden" : undefined}>
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
                const visaItem = flow.current.visaItem;
                if (visaItem && !isAgentActive(latest().agent_run)) {
                  flow.current.visaItem = null;
                  void actions.createVisa(visaItem, { passport: fields, documentId });
                }
              }}
            />
            {documentId ? <div className="mt-4"><PhotoCard demo onConfirm={setPhotoDocumentId} /></div> : null}
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
