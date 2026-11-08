"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, MessagesSquare, Plus, X } from "lucide-react";
import { FocusStage, PAPER_COLORS, Sentence, STAGE_TEXTS, TypeInstead, VoiceHint, WaveMic, waveState, type AgentView, type StageVisual, type Translate } from "@/components/panel/focus-stage";
import { Painting } from "@/components/panel/backdrop";
import { PassportCard } from "@/components/trip/passport-card";
import { PhotoCard } from "@/components/trip/photo-card";
import { ReturnTicketCard } from "@/components/trip/return-ticket-card";
import { useAgentRun } from "@/components/trip/use-agent-run";
import { usePapersCheck } from "@/components/trip/use-papers-check";
import { useTripActions } from "@/components/trip/use-trip-actions";
import { MuteToggle } from "@/components/voice/mute-toggle";
import { useVoiceInput } from "@/components/voice/use-voice-input";
import { speakLine, stopSpeaking, useConversationSpeech, useSpeaking } from "@/components/voice/speech";
import { resetSpokenLanguage, useSpokenLanguage } from "@/lib/voice/language";
import { requestTranslations, translated, useTranslatedConversation, useTranslationsVersion } from "@/lib/voice/translations";
import type { DocumentExtraction, PassportFields } from "@/lib/contracts";
import { bestFirst, foundPassportText, foundPhotoText, foundReturnTicketText, readSummary, type Reader } from "@/lib/panel-documents";
import { agentChecklist, CHECKLIST_LABELS, focusItem, paperInFocus, readyPaper, sceneFor, type Paper } from "@/lib/panel-focus";
import { isFlightReadyMessage } from "@/lib/flights/flow";
import { requestTripParse } from "@/lib/trip-parse-client";
import {
  acceptProposal,
  ARRIVAL_CARD_READY_MESSAGE,
  createTripFromRequest,
  isAgentActive,
  needsPassportReconfirm,
  pushAgentMessage,
  pushProposal,
  VISA_READY_MESSAGE,
  type ConversationItem,
  type Trip,
} from "@/lib/trip-state";
import { clearTrips, getTrip, saveTrip, useTrips } from "@/lib/trip-store";
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

// What Nami says aloud about the agent's work: its first sentence, and nothing for the technical steps.
export function agentSpeech(step: string): string | null {
  const text = step.trim();
  if (text.length < 12 || /^(Action:|On [\w.-]+$|Session created|Passport file ready|Agent started|Agent finished)|step failed/i.test(text)) return null;
  return text.split(/(?<=[.!?])\s/)[0];
}

const AGENT_SPEECH_GAP_MS = 20_000;
const RECONFIRM_TEXT = "The agent may still be running. Confirm your passport again so I can follow it here; Stop works meanwhile.";

// The fixed texts of the panel, translated like the rest.
export const PANEL_TEXTS = [
  ...STAGE_TEXTS,
  ...CHECKLIST_LABELS,
  "Tell me where you're going. I'll take care of the papers.",
  "Speak, in any language. You keep the last word.",
  "Type instead",
  "Reading your trip…",
  "I couldn't read your trip yet:",
  "What we said",
  "New trip",
  "Close",
  "Passport",
  "Photo",
  "Visa",
  "Arrival card",
  "Starting…",
  "Looking for your passport…",
  "Reading your passport…",
  "Looking for your ID photo…",
  RECONFIRM_TEXT,
];

function useT(language: string): Translate {
  useTranslationsVersion();
  useEffect(() => {
    void requestTranslations(language, PANEL_TEXTS);
  }, [language]);
  return (text: string) => translated(language, text) ?? text;
}

const EXAMPLES = ["I'm flying to Bali on Monday for a friend's wedding.", "Je pars à Bali lundi pour deux semaines.", "Me voy a Bali en diciembre."];

function Wordmark() {
  return <span className="text-[19px] leading-none font-bold tracking-[-0.03em]">nami</span>;
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="np-press grid size-10 place-items-center rounded-full text-[var(--np-ink)] outline-none hover:bg-[rgb(19_48_58/0.08)] focus-visible:ring-2 focus-visible:ring-[var(--paper)]"
    >
      {children}
    </button>
  );
}

// A sheet over the panel: the only place that scrolls.
function Sheet({ title, onClose, t, children }: { title: string; onClose?: () => void; t: Translate; children: ReactNode }) {
  return (
    <div role="dialog" aria-label={title} className="np-enter absolute inset-0 z-30 flex flex-col bg-[var(--np-wall)]">
      <header className="flex items-center justify-between px-5 pt-4 pb-2">
        <p className="text-[22px] font-bold tracking-[-0.02em]">{title}</p>
        {onClose ? (
          <IconButton label={t("Close")} onClick={onClose}>
            <X className="size-5" />
          </IconButton>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">{children}</div>
    </div>
  );
}

function History({ items, t, onClose }: { items: ConversationItem[]; t: Translate; onClose: () => void }) {
  return (
    <Sheet title={t("What we said")} t={t} onClose={onClose}>
      <ol className="flex flex-col gap-3 pt-2">
        {items.map((item) =>
          item.kind === "user" ? (
            <li key={item.id} className="ml-auto max-w-[85%] rounded-[20px] rounded-br-md bg-[var(--np-ink)] px-4 py-2.5 text-[15px] text-[var(--np-on-accent)]">
              {item.text}
            </li>
          ) : (
            <li key={item.id} className="max-w-[92%] text-[15px] leading-snug">
              <p>{item.kind === "question" || item.kind === "agent_question" ? item.question : item.text}</p>
              {item.kind === "proposal" && item.decision ? (
                <p className="mt-1 text-[13px] text-[var(--np-ink-soft)]">→ {item.decision === "accepted" ? item.accept_label : item.decline_label}</p>
              ) : (item.kind === "question" || item.kind === "agent_question") && item.answer ? (
                <p className="mt-1 text-[13px] text-[var(--np-ink-soft)]">→ {item.answer}</p>
              ) : null}
            </li>
          ),
        )}
      </ol>
    </Sheet>
  );
}

type Mark = { label: string; done: boolean; paper?: Paper };

// The shore: what is already done, in the color of its paper.
function Shore({ marks, t, onPassport }: { marks: Mark[]; t: Translate; onPassport?: () => void }) {
  return (
    <ul className="flex flex-wrap gap-1.5 px-5 pb-1">
      {marks.map((mark) => {
        const content = (
          <>
            <span
              aria-hidden
              className={cn("grid size-4 place-items-center rounded-full", mark.done ? "text-[var(--np-on-accent)]" : "ring-1 ring-[var(--np-line)] ring-inset")}
              style={mark.done ? { background: PAPER_COLORS[mark.paper ?? "visa"] } : undefined}
            >
              {mark.done ? <Check className="size-2.5" strokeWidth={3.5} /> : null}
            </span>
            {t(mark.label)}
          </>
        );
        const className = cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium",
          mark.done ? "bg-[var(--np-fill)]" : "text-[var(--np-ink-soft)]",
        );
        return (
          <li key={mark.label}>
            {mark.label === "Passport" && mark.done && onPassport ? (
              <button type="button" onClick={onPassport} className={cn(className, "np-press")}>
                {content}
              </button>
            ) : (
              <span className={className}>{content}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function StartView({ onTrip, t }: { onTrip: (trip: Trip) => void; t: Translate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const speaking = useSpeaking();

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
  const voice = useVoiceInput((said) => void submit(said));

  return (
    <>
      <Painting scene="aube" hero wave={busy ? "working" : waveState(voice, speaking, false)} mic={<WaveMic voice={voice} t={t} large />} />
      <section className="min-h-0 flex-1 overflow-y-auto px-6 pt-12 pb-4">
        <Sentence text={busy ? t("Reading your trip…") : t("Tell me where you're going. I'll take care of the papers.")} size="xl" />
        <p className="mt-3 text-[15px] leading-snug text-[var(--np-ink-soft)]">{t("Speak, in any language. You keep the last word.")}</p>
        <ul className="mt-5 flex flex-col">
          {EXAMPLES.map((example) => (
            <li key={example}>
              <button
                type="button"
                onClick={() => void submit(example)}
                className="np-press w-full rounded-xl py-1.5 text-left text-[15px] text-[var(--paper)] hover:bg-[var(--np-fill)]"
              >
                “{example}”
              </button>
            </li>
          ))}
        </ul>
        {error ? (
          <p role="alert" className="mt-4 text-[14px] text-[var(--np-coral)]">
            {t("I couldn't read your trip yet:")} {error}
          </p>
        ) : null}
      </section>
      <div className="px-5 pb-5">
        <VoiceHint voice={voice} t={t} />
        <TypeInstead t={t} placeholder={EXAMPLES[0]} onSubmit={submit} />
      </div>
    </>
  );
}

type Found = { id: string; name: string; score: number };

async function findDocuments(kind: "passport" | "photo" | "return_ticket"): Promise<Found[]> {
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

function TripView({ trip, onNewTrip, t, language }: { trip: Trip; onNewTrip: () => void; t: Translate; language: string }) {
  const [passport, setPassport] = useState<PassportFields | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  // Set by the photo card when the spoken path falls back to the cards, or by a spoken yes to the photo found.
  const [photoDocumentId, setPhotoDocumentId] = useState<string | null>(null);
  const [returnTicketDocumentId, setReturnTicketDocumentId] = useState<string | null>(null);
  const [searchRequest, setSearchRequest] = useState(0);
  const [manual, setManual] = useState(false);
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // What the stage shows of the documents being talked about (the flow below keeps the same in a ref, for the handlers).
  const [seen, setSeen] = useState<{ found?: Found; read?: { holder: string; documentId: string; verified: number }; photo?: Found }>({});
  // The spoken passport and photo steps, in memory only (never in the saved trip).
  const flow = useRef<{
    visaItem: string | null;
    passports: Found[];
    reader: Reader | null;
    offered: Found | null;
    read: { fields: PassportFields; documentId: string; verified: number } | null;
    photos: Found[];
    photoDocumentId?: string;
    tickets: Found[];
  }>({ visaItem: null, passports: [], reader: null, offered: null, read: null, photos: [], tickets: [] });
  const secrets = useMemo(() => [passport?.passport_number, passport?.birth_date], [passport]);
  const run = trip.agent_run;
  const reconfirm = needsPassportReconfirm(run, passport !== null);
  useAgentRun(trip.id, run?.session_id ?? null, run !== null && !run.drained && !reconfirm, secrets);
  usePapersCheck(trip);

  // Nami answers in the language the traveller speaks (detected by Gladia), the agent's steps included.
  const shownItems = useTranslatedConversation(trip.conversation, language);
  useConversationSpeech(shownItems, trip.conversation);
  const translationsVersion = useTranslationsVersion();
  // The agent's steps already there when the panel opens are not read again.
  const spokenStep = useRef({ index: trip.agent_steps.length - 1, at: 0 });
  useEffect(() => {
    const index = trip.agent_steps.length - 1;
    if (!trip.agent_run || index <= spokenStep.current.index) return;
    const line = agentSpeech(trip.agent_steps[index]);
    // At most one line every 20 s: Nami says less than she writes, the steps tick on the screen (Nathan, 2026-11-07).
    if (!line || Date.now() - spokenStep.current.at < AGENT_SPEECH_GAP_MS) {
      spokenStep.current.index = index;
      return;
    }
    const text = translated(language, line);
    if (text === null) {
      void requestTranslations(language, [line, ...trip.agent_steps.slice(-1)]);
      return;
    }
    spokenStep.current = { index, at: Date.now() };
    speakLine(`agent-step-${trip.id}-${index}`, text);
  }, [trip.agent_steps, trip.agent_run, trip.id, language, translationsVersion]);
  const lastStep = trip.agent_steps.at(-1) ?? "Starting…";
  useEffect(() => {
    void requestTranslations(language, [lastStep]);
  }, [language, lastStep]);

  const actions = useTripActions({
    trip,
    passport,
    documentId,
    photoDocumentId,
    returnTicketDocumentId,
    onNeedPassport: () => setSearchRequest((request) => request + 1),
    // No tab is opened here: the agent drives the tab already open next to the panel. Opening the official site
    // before the agent reaches it would create a second official tab, and upload_file refuses to choose between two.
    onStarted: (started) => saveTrip(pushAgentMessage(started, WATCH_MESSAGE)),
  });
  const latest = () => getTrip(trip.id) ?? trip;
  const say = (text: string) => saveTrip(pushAgentMessage(latest(), text));
  const ask = (action: "read_passport" | "confirm_passport" | "use_photo" | "use_return_ticket", text: string, yes: string, no: string) =>
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

  const startAgent = (ticketId?: string) => {
    const read = flow.current.read;
    const visaItem = flow.current.visaItem;
    if (!read || !visaItem) return;
    if (ticketId) setReturnTicketDocumentId(ticketId);
    void actions.createVisa(visaItem, {
      passport: read.fields, documentId: read.documentId, photoDocumentId: flow.current.photoDocumentId, returnTicketDocumentId: ticketId,
    });
  };

  // The Return Ticket field of the e-VOA is required and takes a PDF only: without a confirmed one, the agent asks.
  const lookForReturnTicket = async (photoId?: string) => {
    flow.current.photoDocumentId = photoId;
    if (photoId) setPhotoDocumentId(photoId);
    setBusy("Looking for your return ticket…");
    const tickets = await findDocuments("return_ticket");
    setBusy(null);
    flow.current.tickets = tickets;
    const ticket = tickets[0];
    if (ticket) ask("use_return_ticket", foundReturnTicketText(ticket), "Yes, use it", "No");
    else startAgent();
  };

  const offerPassport = () => {
    const next = flow.current.passports.shift();
    if (!next || !flow.current.reader) {
      fallBackToCard("I could not find your passport on this computer. Send me a photo of it, or type its fields below.");
      return;
    }
    flow.current.offered = next;
    setSeen((previous) => ({ ...previous, found: next }));
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
    const documentToRead = flow.current.offered?.id;
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
      const extraction = body as DocumentExtraction;
      const summary = readSummary(extraction);
      if (!summary.ok) return fallBackToCard(summary.text);
      const verified = extraction.mrz_verified?.length ?? 0;
      flow.current.read = { fields: summary.fields, documentId: documentToRead, verified };
      const holder = `${summary.fields.given_names.split(/[\s,]+/)[0]} ${summary.fields.surname}`;
      setSeen((previous) => ({ ...previous, read: { holder, documentId: documentToRead, verified } }));
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
    setSeen((previous) => ({ ...previous, photo }));
    if (photo) ask("use_photo", foundPhotoText(photo), "Yes, use it", "No");
    else void lookForReturnTicket();
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
    if (item.action === "read_passport" || item.action === "confirm_passport" || item.action === "use_photo" || item.action === "use_return_ticket") {
      actions.decide(itemId, accepted);
      if (item.action === "read_passport") return void (accepted ? readPassport() : offerPassport());
      if (item.action === "confirm_passport") return accepted ? void confirmPassport() : fallBackToCard("Check the fields below, then confirm them.");
      if (item.action === "use_photo") return void lookForReturnTicket(accepted ? flow.current.photos[0]?.id : undefined);
      return startAgent(accepted ? flow.current.tickets[0]?.id : undefined);
    }
    actions.decide(itemId, accepted);
  };

  // One thing at a time: what Nami waits for, found on the English conversation, shown in the traveller's language.
  const focus = focusItem(trip.conversation);
  const shownFocus = focus ? (shownItems.find((item) => item.id === focus.id) ?? null) : null;
  const ready = readyPaper(trip.conversation, focus);
  const visual: StageVisual | null =
    focus?.kind !== "proposal" || focus.decision !== null
      ? null
      : focus.action === "read_passport" && seen.found
        ? { kind: "passport_found", id: seen.found.id, name: seen.found.name }
        : focus.action === "confirm_passport" && seen.read
          ? { kind: "passport_read", id: seen.read.documentId, holder: seen.read.holder, verified: seen.read.verified }
          : focus.action === "use_photo" && seen.photo
            ? { kind: "photo", id: seen.photo.id }
            : null;
  const runPaper: Paper = run?.kind === "flights" ? "flights" : run?.paper_id === "arrival_card" ? "arrival_card" : "visa";
  const agent: AgentView | null = isAgentActive(run) ? { paper: runPaper, checklist: agentChecklist(runPaper, trip.agent_steps, false), step: t(lastStep) } : null;
  const has = (text: string) => trip.conversation.some((item) => item.kind === "agent" && item.text === text);
  const marks: Mark[] = [
    { label: "Passport", done: passport !== null },
    { label: "Photo", done: photoDocumentId !== null },
    { label: "Visa", done: has(VISA_READY_MESSAGE), paper: "visa" },
    { label: "Arrival card", done: has(ARRIVAL_CARD_READY_MESSAGE), paper: "arrival_card" },
    { label: "Flight", done: trip.conversation.some((item) => item.kind === "agent" && isFlightReadyMessage(item.text)), paper: "flights" },
  ];

  const showCard = manual || reconfirm;
  const compact = passport !== null && !editing;
  const paper = agent?.paper ?? ready ?? paperInFocus(trip, focus);
  const scene = sceneFor({ started: true, paper, visaReady: marks[2].done, cardReady: marks[3].done });

  return (
    <div className="nami-panel relative flex h-dvh flex-col" data-paper={paper} data-scene={scene}>
      <header className="flex items-center justify-between gap-2 px-5 pt-4 pb-2">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <Wordmark />
          <span className="truncate text-[13px] text-[var(--np-ink-soft)]">{trip.request.destination ?? ""}</span>
        </div>
        <div className="flex items-center">
          <IconButton label={t("What we said")} onClick={() => setHistory(true)}>
            <MessagesSquare className="size-[18px]" />
          </IconButton>
          <MuteToggle className="size-10 text-[var(--np-ink)]" />
          <IconButton
            label={t("New trip")}
            onClick={async () => {
              // Starting over stops the agent and the voice first: nothing keeps running for the old trip.
              stopSpeaking();
              if (isAgentActive(latest().agent_run)) await actions.stop().catch(() => {});
              onNewTrip();
            }}
          >
            <Plus className="size-5" />
          </IconButton>
        </div>
      </header>
      <Shore
        marks={marks}
        t={t}
        onPassport={() => {
          setEditing(true);
          setManual(true);
        }}
      />
      <FocusStage
        item={shownFocus}
        scene={scene}
        visual={visual}
        ready={ready}
        agent={agent}
        busy={busy ? t(busy) : null}
        t={t}
        onAnswer={actions.answer}
        onAnswerText={actions.answerWithText}
        onAnswerAgent={(itemId, value) => void actions.answerAgent(itemId, value)}
        onDecide={decide}
        onStop={() => void actions.stop()}
      />
      {history ? <History items={shownItems} t={t} onClose={() => setHistory(false)} /> : null}
      {showCard ? (
        // Only when the spoken path fails or the traveller asks to edit: kept mounted, its fields live in its memory.
        <div className={compact ? "hidden" : undefined}>
          <Sheet
            title={t("Your passport")}
            t={t}
            onClose={
              reconfirm
                ? undefined
                : () => {
                    setManual(false);
                    setEditing(false);
                  }
            }
          >
            {reconfirm ? <p className="mb-4 rounded-2xl bg-[var(--np-fill)] p-4 text-[14px]">{t(RECONFIRM_TEXT)}</p> : null}
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
            {documentId ? (
              <div className="mt-4">
                <PhotoCard demo onConfirm={setPhotoDocumentId} />
              </div>
            ) : null}
            {documentId ? (
              <div className="mt-4">
                <ReturnTicketCard demo onConfirm={setReturnTicketDocumentId} />
              </div>
            ) : null}
          </Sheet>
        </div>
      ) : null}
    </div>
  );
}

export function PanelScreen() {
  const trips = useTrips();
  const language = useSpokenLanguage();
  const t = useT(language);
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  if (trips === null) return <div className="nami-panel h-dvh" aria-busy="true" />;

  const currentId = chosen !== undefined ? chosen : readCurrentTrip();
  const trip = trips.find((one) => one.id === currentId && !one.sample) ?? null;
  const choose = (id: string | null) => {
    writeCurrentTrip(id);
    setChosen(id);
  };

  return (
    <div className="relative z-10 flex h-dvh flex-col">
      {trip ? (
        <TripView
          key={trip.id}
          trip={trip}
          t={t}
          language={language}
          onNewTrip={() => {
            // « Nouveau voyage » starts from zero: saved trips, current trip and spoken language are wiped.
            clearTrips();
            resetSpokenLanguage();
            choose(null);
          }}
        />
      ) : (
        <div className="nami-panel relative flex h-dvh flex-col" data-scene="aube">
          <header className="px-5 pt-4 pb-2">
            <Wordmark />
          </header>
          <StartView t={t} onTrip={(created) => choose(created.id)} />
        </div>
      )}
    </div>
  );
}
