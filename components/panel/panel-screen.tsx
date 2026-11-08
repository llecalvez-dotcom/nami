"use client";

import { assumedArrival } from "@/lib/planner";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AlertCircle, Check, MessagesSquare, Plus, X } from "lucide-react";
import { FocusStage, PAPER_COLORS, Sentence, STAGE_TEXTS, TypeInstead, VoiceHint, WaveMic, waveState, type AgentView, type StageVisual, type Translate } from "@/components/panel/focus-stage";
import { Painting } from "@/components/panel/backdrop";
import { DocumentDrop, DROP_TEXTS } from "@/components/trip/document-drop";
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
import { agentChecklist, agentStatusLine, type AgentStatus, CHECKLIST_LABELS, focusItem, paperInFocus, paperOfRun, readyPaper, REOPENED_TEXTS, sceneFor, STATUS_TEXTS, type Paper } from "@/lib/panel-focus";
import { focusOfficialTab, paperUrl, showOfficialSite } from "@/lib/official-tab";
import { isFlightReadyMessage } from "@/lib/flights/flow";
import { isHotelReadyMessage } from "@/lib/hotels/flow";
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
import { EXPERT_CHECK_LABELS, expertChecks, type ExpertCheck } from "@/lib/expert-checks";

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
  // "The agent stopped answering" is not read: the message that follows it (starting again, or try again) is.
  if (text.length < 12 || /^(Action:|On [\w.-]+$|Session created|Passport file ready|Agent started|Agent finished|The agent stopped answering)|step failed/i.test(text)) return null;
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
  "Hotel",
  "Starting…",
  "Looking for your passport…",
  "Reading your passport…",
  "Looking for your ID photo…",
  "Opening the official site…",
  RECONFIRM_TEXT,
  ...DROP_TEXTS,
  ...STATUS_TEXTS,
  ...EXPERT_CHECK_LABELS,
  "Checked by Nami",
  "done",
  "running",
  "to do",
  "Open the tab",
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

type Mark = { label: string; state: "done" | "running" | "todo"; paper?: Paper; onOpen?: () => void };

const MARK_STATES: Record<Mark["state"], string> = { done: "done", running: "running", todo: "to do" };

// One short line under the marks: what the agent is doing, or, right after a mark had to open a site again, that
// its tab was gone (the traveller lands on the site's first page, not where the agent stopped).
export function StatusLine({ status, reopened, paper, pulsing, t }: { status: AgentStatus | null; reopened: Paper | null; paper: Paper; pulsing: boolean; t: Translate }) {
  const line = reopened ? { text: REOPENED_TEXTS[reopened] } : status;
  if (!line) return null;
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2 px-5 pb-1 text-[12px] text-[var(--np-ink-soft)]">
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", pulsing && !reopened ? "animate-pulse" : "")} style={{ background: PAPER_COLORS[reopened ?? paper] }} />
      <span className="truncate">{t(line.text)}{line.progress ? ` (${line.progress})` : ""}</span>
    </p>
  );
}

// "Checked by Nami": the checks really run for this trip (lib/expert-checks.ts), one quiet line under the status.
export function ExpertChecks({ checks, t }: { checks: ExpertCheck[]; t: Translate }) {
  if (checks.length === 0) return null;
  return (
    <ul aria-label={t("Checked by Nami")} className="flex flex-wrap gap-x-3 gap-y-1 px-5 pb-1 text-[11px] text-[var(--np-ink-soft)]">
      {checks.map((check) => (
        <li key={check.id} className={cn("inline-flex items-center gap-1", check.state === "warn" ? "font-medium text-[var(--np-ink)]" : "")}>
          {check.state === "warn" ? <AlertCircle aria-hidden className="size-3" strokeWidth={2.5} /> : <Check aria-hidden className="size-3" strokeWidth={3} />}
          {t(check.label)}
        </li>
      ))}
    </ul>
  );
}

// The shore: what is already done, in the color of its paper. A paper's mark brings its tab back to the front
// (Clément, 2026-11-08: finish the visa by hand after the agent stopped, from the panel).
export function Shore({ marks, t }: { marks: Mark[]; t: Translate }) {
  return (
    <ul className="flex flex-wrap gap-1.5 px-5 pb-1">
      {marks.map((mark) => {
        const done = mark.state === "done";
        const color = PAPER_COLORS[mark.paper ?? "visa"];
        const content = (
          <>
            <span
              aria-hidden
              className={cn("grid size-4 place-items-center rounded-full", done ? "text-[var(--np-on-accent)]" : "ring-1 ring-inset", mark.state === "running" ? "ring-[var(--mark)]" : "ring-[var(--np-line)]")}
              style={{ "--mark": color, ...(done ? { background: color } : {}) } as CSSProperties}
            >
              {done ? <Check className="size-2.5" strokeWidth={3.5} /> : mark.state === "running" ? <span className="size-1.5 animate-pulse rounded-full bg-[var(--mark)]" /> : null}
            </span>
            {t(mark.label)}
          </>
        );
        const className = cn(
          "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium",
          done ? "bg-[var(--np-fill)]" : mark.state === "running" ? "text-[var(--np-ink)]" : "text-[var(--np-ink-soft)]",
        );
        const state = `${t(mark.label)}: ${t(MARK_STATES[mark.state])}`;
        return (
          <li key={mark.label}>
            {mark.onOpen ? (
              <button type="button" onClick={mark.onOpen} aria-label={`${state}. ${t("Open the tab")}`} title={t("Open the tab")} className={cn(className, "np-press cursor-pointer")}>
                {content}
              </button>
            ) : (
              <span className={className} aria-label={state}>{content}</span>
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
  const [reopened, setReopened] = useState<Paper | null>(null);
  useEffect(() => {
    if (!reopened) return;
    const timer = window.setTimeout(() => setReopened(null), 8000);
    return () => window.clearTimeout(timer);
  }, [reopened]);
  const [busy, setBusy] = useState<string | null>(null);
  // The upload zone, when no passport or no ID photo is found on this computer.
  const [drop, setDrop] = useState<"passport" | "photo" | null>(null);
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
    // The photo picked in the card when none was found by voice.
    pickedPhotoId?: string;
    tickets: Found[];
    // The reader (H) failed on the passport found: "Try again" reads the same file, without a new search.
    readerDown: boolean;
  }>({ visaItem: null, passports: [], reader: null, offered: null, read: null, photos: [], tickets: [], readerDown: false });
  const secrets = useMemo(() => [passport?.passport_number, passport?.birth_date], [passport]);
  const run = trip.agent_run;
  const reconfirm = needsPassportReconfirm(run, passport !== null);
  useAgentRun(trip.id, run?.session_id ?? null, run !== null && !run.drained && !reconfirm, secrets);
  const livePapers = usePapersCheck(trip);

  // Nami answers in the language the traveller speaks (detected by Gladia), the agent's steps included.
  const shownItems = useTranslatedConversation(trip.conversation, language);
  useConversationSpeech(shownItems, trip.conversation, true);
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
    // Not on the automatic restart after a slow H: "H is slow, starting again" was just said, nothing else is repeated.
    onStarted: (started) => saveTrip(started.agent_run?.auto_restart === "done" ? started : pushAgentMessage(started, WATCH_MESSAGE)),
  });
  // The traveller sees the agent arrive: its tab comes to the front once the agent is seen on the site ("On <host>"),
  // never at the start (the only tab is still blank then, and opening one would double the agent's own tab). Each new
  // host is tried until the tab is found (consent.google.com comes before Google Flights). Sessions already running
  // when the panel opens are left alone.
  const lastHostStep = trip.agent_steps.findLast((step) => step.startsWith("On ")) ?? null;
  const focusedSession = useRef<string | null>(run?.session_id ?? null);
  const focusTried = useRef<string | null>(null);
  useEffect(() => {
    const runPaperSeen = paperOfRun(run);
    if (!run || !runPaperSeen || !lastHostStep || focusedSession.current === run.session_id) return;
    const attempt = `${run.session_id} ${lastHostStep}`;
    if (focusTried.current === attempt) return;
    focusTried.current = attempt;
    const url = paperUrl(trip, runPaperSeen);
    if (!url) return;
    void focusOfficialTab(url, window, 1000, runPaperSeen)?.then((result) => {
      if (result === "focused") focusedSession.current = run.session_id;
    });
  }, [run, lastHostStep, trip]);
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
    // The start route may restart the H bridge first (5 to 10 s): the wave works meanwhile instead of a frozen card.
    setBusy("Opening the official site…");
    void actions.createVisa(visaItem, {
      passport: read.fields, documentId: read.documentId, photoDocumentId: flow.current.photoDocumentId, returnTicketDocumentId: ticketId,
    }).finally(() => setBusy(null));
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
      fallBackToCard("I could not find your passport on this computer. Drop a photo or scan of it here, or type its fields below.");
      setDrop("passport");
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
      if (!response.ok && (response.status === 503 || response.status === 429) && typeof body.error === "string") {
        // H slow or down, or Nami's quota reached: the passport found is kept, the same file is read again on "Try again".
        flow.current.readerDown = true;
        return ask("read_passport", body.error, "Try again", "Type the fields");
      }
      if (!response.ok) throw new Error(body.error ?? "The passport could not be read.");
      flow.current.readerDown = false;
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
    if (photo) return ask("use_photo", foundPhotoText(photo), "Yes, use it", "No");
    // Same fallback as the passport: the card is shown with its photo search and the upload zone; the proposal resumes the path either way.
    say("I could not find your ID photo on this computer. Drop it below, pick it from your documents, or go on without it: the official site will ask for it.");
    // The sheet is hidden once the passport is confirmed (compact): editing shows it again, with the photo card.
    setEditing(true);
    setManual(true);
    setDrop("photo");
    ask("use_photo", "Do you have your ID photo ready?", "Yes, use it", "Go on without it");
  };

  // A file dropped in the upload zone resumes the spoken path as if it had been found on this computer.
  const resumeWithUpload = (document: Found) => {
    const kind = drop;
    setDrop(null);
    if (kind === "passport") {
      if (!flow.current.reader) return setDocumentId(document.id);
      setManual(false);
      flow.current.passports = [document];
      return offerPassport();
    }
    // The pending "Yes, use it" now has a photo to use; "Go on without it" leaves it unused, like a found photo.
    flow.current.photos = [document];
    setSeen((previous) => ({ ...previous, photo: document }));
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
      if (item.action === "read_passport") {
        if (accepted) return void readPassport();
        if (!flow.current.readerDown) return void offerPassport();
        flow.current.readerDown = false;
        setDrop("passport");
        return fallBackToCard("Type the fields of your passport below, or drop a photo of it.");
      }
      if (item.action === "confirm_passport") return accepted ? void confirmPassport() : fallBackToCard("Check the fields below, then confirm them.");
      if (item.action === "use_photo") {
        const found = flow.current.photos[0]?.id;
        if (found) return void lookForReturnTicket(accepted ? found : undefined);
        // Fallback card: "yes" needs a picked photo; "no" drops any photo picked meanwhile, the agent gets none.
        if (accepted && !flow.current.pickedPhotoId) {
          say("I have no photo yet. Pick it below, or go on without it.");
          return ask("use_photo", "Do you have your ID photo ready?", "Yes, use it", "Go on without it");
        }
        if (!accepted) {
          flow.current.pickedPhotoId = undefined;
          setPhotoDocumentId(null);
        }
        setManual(false);
        setEditing(false);
        return void lookForReturnTicket(accepted ? flow.current.pickedPhotoId : undefined);
      }
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
  const runPaper: Paper = paperOfRun(run) ?? "visa";
  const agent: AgentView | null = isAgentActive(run) ? { paper: runPaper, checklist: agentChecklist(runPaper, trip.agent_steps, false), step: t(lastStep) } : null;
  const status = agentStatusLine(run, trip.agent_steps);
  const has = (text: string) => trip.conversation.some((item) => item.kind === "agent" && item.text === text);
  const markState = (done: boolean, markPaper: Paper): Mark["state"] => (done ? "done" : agent?.paper === markPaper ? "running" : "todo");
  // A mark brings the paper's tab back as it is; when no tab of the site was left, the site opened again and the
  // status line says so for a moment.
  const openPaper = (url: string, markPaper: Paper) => {
    void showOfficialSite(url, window, 1000, markPaper).then((result) => {
      if (result === "opened") setReopened(markPaper);
    });
  };
  const paperMark = (label: string, done: boolean, markPaper: Paper): Mark => {
    const url = paperUrl(trip, markPaper);
    return { label, paper: markPaper, state: markState(done, markPaper), onOpen: url ? () => openPaper(url, markPaper) : undefined };
  };
  const marks: Mark[] = [
    { label: "Passport", state: passport !== null ? "done" : "todo", onOpen: passport !== null ? () => { setEditing(true); setManual(true); } : undefined },
    { label: "Photo", state: photoDocumentId !== null ? "done" : "todo" },
    paperMark("Visa", has(VISA_READY_MESSAGE), "visa"),
    paperMark("Flight", trip.conversation.some((item) => item.kind === "agent" && isFlightReadyMessage(item.text)), "flights"),
    paperMark("Hotel", trip.conversation.some((item) => item.kind === "agent" && isHotelReadyMessage(item.text)), "hotels"),
  ];

  const checks = expertChecks({
    live: livePapers?.state === "done" ? livePapers.result : null,
    mrzVerified: seen.read?.verified ?? 0,
    passportExpiry: passport?.expiry_date ?? null,
    dates: { return_date: trip.request.return_date, arrival_at: assumedArrival(trip.request) },
    countryIso2: trip.request.country_iso2 ?? null,
    formalities: trip.formalities,
    agentOnOfficialSite:
      ((runPaper === "visa" || runPaper === "arrival_card") && run !== null && lastHostStep !== null) ||
      has(VISA_READY_MESSAGE) ||
      has(ARRIVAL_CARD_READY_MESSAGE),
  });

  const showCard = manual || reconfirm;
  const compact = passport !== null && !editing;
  const paper = agent?.paper ?? ready ?? paperInFocus(trip, focus);
  const scene = sceneFor({ started: true, paper, visaReady: marks[2].state === "done", cardReady: has(ARRIVAL_CARD_READY_MESSAGE) });

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
      <Shore marks={marks} t={t} />
      {/* Always there while a session exists: what the agent is doing, even when the panel asks something else. */}
      <StatusLine status={status} reopened={reopened} paper={runPaper} pulsing={agent !== null} t={t} />
      <ExpertChecks checks={checks} t={t} />
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
                    setDrop(null);
                  }
            }
          >
            {reconfirm ? <p className="mb-4 rounded-2xl bg-[var(--np-fill)] p-4 text-[14px]">{t(RECONFIRM_TEXT)}</p> : null}
            {drop === "passport" && !documentId ? <DocumentDrop kind="passport" t={t} onUploaded={resumeWithUpload} className="mb-4" /> : null}
            <PassportCard
              demo
              returnDate={trip.request.return_date}
              arrivalAt={assumedArrival(trip.request)}
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
                {drop === "photo" && !photoDocumentId ? <DocumentDrop kind="photo" t={t} onUploaded={resumeWithUpload} className="mb-4" /> : null}
                <PhotoCard
                  demo
                  onConfirm={(id) => {
                    flow.current.pickedPhotoId = id ?? undefined;
                    setPhotoDocumentId(id);
                  }}
                />
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
