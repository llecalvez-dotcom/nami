"use client";

import { useState, type ReactNode } from "react";
import { Check, Keyboard, Loader2, Mic, Square } from "lucide-react";
import { useListenAfterSpeech, useSpeaking } from "@/components/voice/speech";
import { useVoiceInput, type VoiceInput } from "@/components/voice/use-voice-input";
import { VoiceAnswer } from "@/components/voice/voice-answer";
import { Wave, type WaveState } from "@/components/panel/wave";
import { pivotParts, sentenceSize, type Checklist, type Paper } from "@/lib/panel-focus";
import type { ConversationItem } from "@/lib/trip-state";
import { matchOption, shortAnswer } from "@/lib/voice/short-answers";
import { cn } from "@/lib/utils";

export type Translate = (text: string) => string;

// What sits under the sentence: the document being talked about, or the agent at work.
export type StageVisual =
  | { kind: "passport_found"; id: string; name: string }
  | { kind: "passport_read"; id: string; holder: string; verified: number }
  | { kind: "photo"; id: string };

export type AgentView = { paper: Paper; checklist: Checklist; step: string };

type Handlers = {
  onAnswer: (itemId: string, value: string, label: string) => void;
  onAnswerAgent: (itemId: string, value: string) => void;
  onAnswerText: (itemId: string, text: string) => Promise<void>;
  onDecide: (itemId: string, accepted: boolean) => void;
  onStop: () => void;
};

type Props = Handlers & {
  item: ConversationItem | null;
  destination: string | null;
  visual: StageVisual | null;
  ready: Paper | null;
  agent: AgentView | null;
  busy: string | null;
  t: Translate;
};

const READY_TITLE: Record<Paper, string> = { visa: "Your visa is ready.", arrival_card: "Your arrival card is ready." };
const AGENT_TITLE: Record<Paper, string> = { visa: "I'm filling in your visa.", arrival_card: "I'm filling in your arrival card." };

export const STAGE_TEXTS = [
  "Nami",
  "The agent asks you",
  "Speak",
  "Listening…",
  "Reading…",
  "Say yes or no, or tap.",
  "I heard:",
  "Stop",
  "fields checked",
  "Watch the tab on the left: you will see every click.",
  "Check it in the tab, then send it yourself.",
  "Your passport",
  "Your ID photo",
  "Type instead",
  ...Object.values(READY_TITLE),
  ...Object.values(AGENT_TITLE),
];

const awaiting = (item: ConversationItem | null) =>
  item !== null &&
  (((item.kind === "question" || item.kind === "agent_question") && item.answer === null) || (item.kind === "proposal" && item.decision === null));

function sentenceOf(item: ConversationItem | null): string {
  if (!item || item.kind === "user") return "";
  if (item.kind === "question" || item.kind === "agent_question") return item.question;
  return item.text;
}

export function Sentence({ text, pivot, size }: { text: string; pivot?: string | null; size?: "xl" | "lg" | "md" }) {
  const [before, word, after] = pivotParts(text, pivot);
  return (
    <p className="np-sentence" data-size={size ?? sentenceSize(text)}>
      {before}
      {word ? <em>{word}</em> : null}
      {after}
    </p>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="mb-4 text-[13px] font-medium tracking-wide text-[var(--np-ink-soft)]">{children}</p>;
}

const preview = (id: string) => `/api/documents/preview?id=${encodeURIComponent(id)}`;

// The passport is shown blurred: the name is enough to recognise it, the number and the birth date never appear.
function VisualCard({ visual, t }: { visual: StageVisual; t: Translate }) {
  if (visual.kind === "photo") {
    return (
      <div className="mt-7 flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview(visual.id)} alt={t("Your ID photo")} className="size-28 rounded-[28px] object-cover ring-4 ring-[var(--paper-soft)]" />
      </div>
    );
  }
  const read = visual.kind === "passport_read";
  return (
    <figure className="relative mt-7 h-44 overflow-hidden rounded-[22px] bg-[var(--paper-soft)] shadow-[0_14px_36px_rgb(19_48_58/0.16)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={preview(visual.id)}
        alt={t("Your passport")}
        className={cn("absolute inset-0 size-full scale-110 object-cover", read ? "blur-[10px]" : "blur-[5px]")}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[rgb(19_48_58/0.72)] via-[rgb(19_48_58/0.12)] to-transparent" />
      {read && visual.verified > 0 ? (
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--np-cream)] px-3 py-1.5 text-[13px] font-semibold text-[var(--paper)]">
          <Check className="size-3.5" strokeWidth={3} /> {visual.verified} {t("fields checked")}
        </span>
      ) : null}
      <figcaption className="absolute right-4 bottom-3 left-4 text-[var(--np-cream)]">
        {read ? <span className="np-serif block truncate text-[26px] leading-tight">{visual.holder}</span> : <span className="block truncate text-sm opacity-90">{visual.name}</span>}
      </figcaption>
    </figure>
  );
}

function AgentChecklist({ agent, t }: { agent: AgentView; t: Translate }) {
  return (
    <div className="np-glass mt-6 rounded-[22px] px-5 py-4">
      <ol className="flex flex-col gap-2.5">
        {agent.checklist.map((step) => (
          <li key={step.label} className="flex items-center gap-3 text-[15px]">
            <span
              aria-hidden
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full transition-colors duration-300",
                step.state === "done" && "bg-[var(--paper)] text-[var(--np-cream)]",
                step.state === "current" && "ring-2 ring-[var(--paper)] ring-inset",
                step.state === "todo" && "ring-1 ring-[var(--np-line)] ring-inset",
              )}
            >
              {step.state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : step.state === "current" ? <span className="size-2 animate-pulse rounded-full bg-[var(--paper)]" /> : null}
            </span>
            <span className={cn(step.state === "todo" ? "text-[var(--np-ink-soft)]" : "font-medium")}>{t(step.label)}</span>
            <span className="sr-only">{step.state}</span>
          </li>
        ))}
      </ol>
      <p role="status" aria-live="polite" className="mt-3.5 line-clamp-2 border-t border-[var(--np-line)] pt-3 text-[13px] leading-snug text-[var(--np-ink-soft)]">
        {agent.step}
      </p>
    </div>
  );
}

// In the color of the paper made ready, not of the next one proposed.
function ReadyMark({ paper }: { paper: Paper }) {
  return (
    <span
      className="mb-6 grid size-16 place-items-center rounded-full text-[var(--np-cream)] shadow-[0_10px_30px_rgb(19_48_58/0.18)]"
      style={{ background: paper === "arrival_card" ? "var(--np-coral)" : "var(--np-lagoon)" }}
    >
      <Check className="size-8" strokeWidth={2.6} />
    </span>
  );
}

// The sky: one sentence from Nami, and the one object it is about.
function Sky(props: Props) {
  const { item, destination, visual, ready, agent, busy, t } = props;
  const showAgent = agent !== null && !awaiting(item);
  const key = showAgent ? `agent-${agent.paper}` : busy && !awaiting(item) ? `busy-${busy}` : item?.id ?? "empty";
  let body: ReactNode;
  if (showAgent) {
    body = (
      <>
        <Eyebrow>{t("Nami")}</Eyebrow>
        <Sentence text={t(AGENT_TITLE[agent.paper])} pivot={destination} />
        <p className="mt-3 text-[15px] leading-snug text-[var(--np-ink-soft)]">{t("Watch the tab on the left: you will see every click.")}</p>
        <AgentChecklist agent={agent} t={t} />
      </>
    );
  } else if (busy && !awaiting(item)) {
    body = (
      <>
        <Eyebrow>{t("Nami")}</Eyebrow>
        <Sentence text={busy} pivot={destination} />
      </>
    );
  } else if (ready && item) {
    body = (
      <>
        <ReadyMark paper={ready} />
        <Sentence text={t(READY_TITLE[ready])} size="xl" />
        <p className="mt-2 text-[15px] text-[var(--np-ink-soft)]">{t("Check it in the tab, then send it yourself.")}</p>
        <div className="mt-8 border-t border-[var(--np-line)] pt-6">
          <Sentence text={sentenceOf(item)} pivot={destination} size="md" />
        </div>
      </>
    );
  } else {
    body = (
      <>
        <Eyebrow>{item?.kind === "agent_question" || (item?.kind === "question" && item.from === "agent_h") ? t("The agent asks you") : t("Nami")}</Eyebrow>
        <Sentence text={sentenceOf(item)} pivot={destination} />
        {item?.kind === "agent" && item.list && item.list.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {item.list.map((entry) => (
              <li key={entry} className="rounded-full bg-[var(--paper-soft)] px-3 py-1 text-[13px]">
                {entry}
              </li>
            ))}
          </ul>
        ) : null}
        {visual ? <VisualCard visual={visual} t={t} /> : null}
      </>
    );
  }
  return (
    <section aria-live="polite" className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-7 pt-2 pb-6">
      <div key={key} className="np-enter">
        {body}
      </div>
    </section>
  );
}

export function WaveMic({ voice, t, large }: { voice: VoiceInput; t: Translate; large?: boolean }) {
  const listening = voice.status === "recording";
  return (
    <button
      type="button"
      onClick={voice.toggle}
      disabled={voice.status === "transcribing"}
      aria-pressed={listening}
      aria-label={listening ? t("Listening…") : t("Speak")}
      className={cn(
        "np-press grid place-items-center rounded-full text-[var(--np-cream)] shadow-[0_10px_28px_rgb(19_48_58/0.25)] outline-none focus-visible:ring-4 focus-visible:ring-[var(--paper-soft)]",
        large ? "size-[76px]" : "size-14",
        listening ? "bg-[var(--np-ink)]" : "bg-[var(--paper)]",
      )}
    >
      {voice.status === "transcribing" ? (
        <Loader2 className="size-5 animate-spin" />
      ) : listening ? (
        <Square className="size-5 fill-current" />
      ) : (
        <Mic className={large ? "size-7" : "size-6"} />
      )}
    </button>
  );
}

export function waveState(voice: VoiceInput | null, speaking: boolean, working: boolean): WaveState {
  if (voice?.status === "recording") return "listening";
  if (speaking) return "speaking";
  if (working || voice?.status === "transcribing") return "working";
  return "idle";
}

export function VoiceHint({ voice, t, unclear }: { voice: VoiceInput; t: Translate; unclear?: string | null }) {
  const text =
    voice.status === "recording"
      ? t("Listening…")
      : voice.status === "transcribing"
        ? t("Reading…")
        : voice.error
          ? voice.error
          : unclear
            ? `${t("I heard:")} “${unclear}”. ${t("Say yes or no, or tap.")}`
            : null;
  return (
    <p role="status" className="min-h-5 text-center text-[13px] text-[var(--np-ink-soft)]">
      {text}
    </p>
  );
}

const primaryButton =
  "np-press h-14 min-w-0 flex-1 rounded-full bg-[var(--paper)] px-5 text-[16px] font-semibold text-[var(--np-cream)] shadow-[0_8px_22px_rgb(19_48_58/0.18)] outline-none focus-visible:ring-4 focus-visible:ring-[var(--paper-soft)]";
const secondaryButton =
  "np-press h-14 shrink-0 rounded-full px-5 text-[16px] font-medium text-[var(--np-ink-soft)] outline-none hover:bg-[var(--np-line)] focus-visible:ring-4 focus-visible:ring-[var(--paper-soft)]";

// The wave and the sand for the item Nami waits for: its microphone opens by itself once Nami has read it aloud.
function Answering({ item, t, working, ...handlers }: { item: ConversationItem; t: Translate; working: boolean } & Handlers) {
  const speaking = useSpeaking();
  const [unclear, setUnclear] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const voice = useVoiceInput(async (text) => {
    setUnclear(null);
    if (item.kind === "proposal") {
      const answer = shortAnswer("proposal", text);
      return answer ? handlers.onDecide(item.id, answer === "accept") : setUnclear(text);
    }
    if (item.kind !== "question") return;
    // A spoken "yes" in any language picks the only option of a proposed answer ("Yes, that's right").
    const option =
      matchOption(text, item.options) ?? (item.options.length === 1 && shortAnswer("proposal", text) === "accept" ? item.options[0] : null);
    if (option) return handlers.onAnswer(item.id, option.value, option.label);
    setBusy(true);
    try {
      await handlers.onAnswerText(item.id, text);
    } catch {
      setUnclear(text);
      setBusy(false);
    }
  });
  const typed = item.kind === "agent_question" || (item.kind === "question" && item.input === "email");
  useListenAfterSpeech(typed ? "" : item.id, voice.start);

  return (
    <>
      <Wave state={busy ? "working" : waveState(typed ? null : voice, speaking, working)}>{typed ? null : <WaveMic voice={voice} t={t} />}</Wave>
      <div className="np-sand px-5 pt-3 pb-5">
        {typed ? (
          <VoiceAnswer
            itemId={item.id}
            type={item.kind === "question" || /e-?mail/i.test(item.question) ? "email" : "text"}
            label={t("Speak")}
            onValidate={(value) => (item.kind === "agent_question" ? handlers.onAnswerAgent(item.id, value) : handlers.onAnswer(item.id, value, value))}
          />
        ) : (
          <>
            <VoiceHint voice={voice} t={t} unclear={unclear} />
            {item.kind === "proposal" ? (
              <div className="mt-2 flex gap-2">
                <button type="button" className={primaryButton} onClick={() => handlers.onDecide(item.id, true)}>
                  {item.accept_label}
                </button>
                <button type="button" className={secondaryButton} onClick={() => handlers.onDecide(item.id, false)}>
                  {item.decline_label}
                </button>
              </div>
            ) : item.kind === "question" ? (
              <div className="mt-2 flex flex-col gap-2">
                {item.options.map((option, i) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(i === 0 ? primaryButton : cn(secondaryButton, "bg-[var(--np-cream)]"), "flex-none")}
                    onClick={() => handlers.onAnswer(item.id, option.value, option.label)}
                  >
                    {option.label}
                  </button>
                ))}
                {item.input === "text" ? <TypedAnswer t={t} onSubmit={(text) => handlers.onAnswerText(item.id, text)} /> : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

// The keyboard only as a fallback: hidden behind "Type instead".
function TypedAnswer({ onSubmit, t }: { onSubmit: (text: string) => Promise<void>; t: Translate }) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="np-press mx-auto flex h-10 items-center gap-2 rounded-full px-4 text-[14px] text-[var(--np-ink-soft)] hover:bg-[rgb(19_48_58/0.06)]"
      >
        <Keyboard className="size-4" /> {t("Type instead")}
      </button>
    );
  }
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) void onSubmit(value.trim());
      }}
    >
      <input
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label={t("Type instead")}
        className="h-12 min-w-0 flex-1 rounded-full bg-[var(--np-cream)] px-5 text-[15px] outline-none ring-1 ring-[var(--np-line)] focus-visible:ring-2 focus-visible:ring-[var(--paper)]"
      />
      <button type="submit" disabled={!value.trim()} className="np-press h-12 rounded-full bg-[var(--np-ink)] px-5 text-[15px] font-medium text-[var(--np-cream)] disabled:opacity-40">
        OK
      </button>
    </form>
  );
}

// Nothing to answer: the wave follows Nami's voice and the agent; Stop while the agent works.
function Resting({ working, t, onStop }: { working: boolean; t: Translate; onStop: () => void }) {
  const speaking = useSpeaking();
  return (
    <>
      <Wave state={waveState(null, speaking, working)} />
      <div className="np-sand flex min-h-[92px] items-center justify-center px-5 pt-3 pb-5">
        {working ? (
          <button
            type="button"
            onClick={onStop}
            className="np-press inline-flex h-12 items-center gap-2 rounded-full bg-[var(--np-ink)] px-6 text-[15px] font-semibold text-[var(--np-cream)]"
          >
            <Square className="size-3.5 fill-current" /> {t("Stop")}
          </button>
        ) : null}
      </div>
    </>
  );
}

export function FocusStage(props: Props) {
  const { item, agent, busy, t, ...rest } = props;
  const working = agent !== null || busy !== null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Sky {...props} />
      {item && awaiting(item) ? (
        <Answering key={item.id} item={item} t={t} working={working} {...rest} />
      ) : (
        <Resting working={agent !== null} t={t} onStop={rest.onStop} />
      )}
    </div>
  );
}
