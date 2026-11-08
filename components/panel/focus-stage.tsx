"use client";

import { useState, type ReactNode } from "react";
import { Check, Keyboard, Loader2, Mic, Square } from "lucide-react";
import { Painting } from "@/components/panel/backdrop";
import { useSpeaking } from "@/components/voice/speech";
import { useVoiceInput, type VoiceInput } from "@/components/voice/use-voice-input";
import { VoiceAnswer } from "@/components/voice/voice-answer";
import type { WaveState } from "@/components/panel/wave";
import { sentenceSize, type Checklist, type Paper, type Scene } from "@/lib/panel-focus";
import type { ConversationItem } from "@/lib/trip-state";
import { matchOption, shortAnswer } from "@/lib/voice/short-answers";
import { cn } from "@/lib/utils";

export type Translate = (text: string) => string;

// What sits under the sentence: the document being talked about.
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
  scene: Scene;
  visual: StageVisual | null;
  ready: Paper | null;
  agent: AgentView | null;
  busy: string | null;
  t: Translate;
};

const READY_TITLE: Record<Paper, string> = { visa: "Your visa is ready.", arrival_card: "Your arrival card is ready.", flights: "Your flight is found." };
const AGENT_TITLE: Record<Paper, string> = { visa: "I'm filling in your visa.", arrival_card: "I'm filling in your arrival card.", flights: "I'm searching your flights." };
export const PAPER_COLORS: Record<Paper, string> = { visa: "var(--np-lagoon)", arrival_card: "var(--np-coral)", flights: "var(--np-sky)" };

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
  "Book it in the tab when you want, Nami never pays.",
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

// Nami's sentence: a large bold title on the wall, never on the painting. "e-VOA" never breaks at its hyphen.
export function Sentence({ text, size }: { text: string; size?: "xl" | "lg" | "md" }) {
  return (
    <p className="np-title" data-size={size ?? sentenceSize(text)}>
      {text.replace(/\be-VOA\b/g, "e\u2011VOA")}
    </p>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[13px] font-semibold text-[var(--paper)]">{children}</p>;
}

function Secondary({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("mt-2.5 text-[15px] leading-snug text-[var(--np-ink-soft)]", className)}>{children}</p>;
}

const preview = (id: string) => `/api/documents/preview?id=${encodeURIComponent(id)}`;

// The passport is shown blurred: the name is enough to recognise it, the number and the birth date never appear.
function VisualCard({ visual, t }: { visual: StageVisual; t: Translate }) {
  if (visual.kind === "photo") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={preview(visual.id)} alt={t("Your ID photo")} className="mt-5 size-24 rounded-[20px] bg-[var(--np-fill)] object-cover" />;
  }
  const read = visual.kind === "passport_read";
  return (
    <figure className={cn("relative mt-5 overflow-hidden rounded-[18px] bg-[var(--paper-soft)]", read ? "h-36" : "h-20 w-36")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview(visual.id)} alt={t("Your passport")} className={cn("absolute inset-0 size-full scale-110 object-cover", read ? "blur-[10px]" : "blur-[5px]")} />
      {read ? (
        <>
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[rgb(21_35_43/0.78)] to-transparent" />
          {visual.verified > 0 ? (
            <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-[var(--np-wall)] px-2.5 py-1 text-[12px] font-semibold text-[var(--paper)]">
              <Check className="size-3" strokeWidth={3} /> {visual.verified} {t("fields checked")}
            </span>
          ) : null}
          <figcaption className="absolute right-3.5 bottom-3 left-3.5 truncate text-[20px] font-semibold tracking-[-0.015em] text-[var(--np-on-accent)]">
            {visual.holder}
          </figcaption>
        </>
      ) : null}
    </figure>
  );
}

function AgentChecklist({ agent }: { agent: AgentView }) {
  return (
    <>
      <ol className="mt-5 flex flex-col gap-2">
        {agent.checklist.map((step) => (
          <li key={step.label} className="flex items-center gap-3 text-[15px]">
            <span
              aria-hidden
              className={cn(
                "grid size-[22px] shrink-0 place-items-center rounded-full transition-colors duration-300",
                step.state === "done" && "bg-[var(--paper)] text-[var(--np-on-accent)]",
                step.state === "current" && "ring-2 ring-[var(--paper)] ring-inset",
                step.state === "todo" && "ring-[1.5px] ring-[var(--np-line)] ring-inset",
              )}
            >
              {step.state === "done" ? <Check className="size-3" strokeWidth={3.2} /> : step.state === "current" ? <span className="size-2 animate-pulse rounded-full bg-[var(--paper)]" /> : null}
            </span>
            <span className={cn(step.state === "todo" ? "text-[var(--np-ink-soft)]" : "font-medium")}>{step.label}</span>
            <span className="sr-only">{step.state}</span>
          </li>
        ))}
      </ol>
      <p role="status" aria-live="polite" className="mt-4 line-clamp-2 text-[14px] leading-snug text-[var(--np-ink-soft)]">
        {agent.step}
      </p>
    </>
  );
}

// The wall under the painting: one sentence from Nami, and the one thing it is about.
function Wall(props: Props) {
  const { item, visual, ready, agent, busy, t } = props;
  const showAgent = agent !== null && !awaiting(item);
  const key = showAgent ? `agent-${agent.paper}` : busy && !awaiting(item) ? `busy-${busy}` : (item?.id ?? "empty");
  let body: ReactNode;
  if (showAgent) {
    body = (
      <>
        <Eyebrow>{t("Nami")}</Eyebrow>
        <Sentence text={t(AGENT_TITLE[agent.paper])} size="lg" />
        <Secondary>{t("Watch the tab on the left: you will see every click.")}</Secondary>
        <AgentChecklist agent={{ ...agent, checklist: agent.checklist.map((s) => ({ ...s, label: t(s.label) })) }} />
      </>
    );
  } else if (busy && !awaiting(item)) {
    body = (
      <>
        <Eyebrow>{t("Nami")}</Eyebrow>
        <Sentence text={busy} />
      </>
    );
  } else if (ready && item) {
    const color = PAPER_COLORS[ready];
    body = (
      <>
        <p className="mb-3 flex items-center gap-2 text-[13px] font-semibold" style={{ color }}>
          <span className="grid size-[22px] place-items-center rounded-full" style={{ background: color }}>
            <Check className="size-3 text-[var(--np-on-accent)]" strokeWidth={3.2} />
          </span>
          {t("Nami")}
        </p>
        <Sentence text={t(READY_TITLE[ready])} size="xl" />
        <Secondary>{t(ready === "flights" ? "Book it in the tab when you want, Nami never pays." : "Check it in the tab, then send it yourself.")}</Secondary>
        <p className="mt-6 border-t border-[var(--np-line)] pt-5 text-[17px] leading-snug font-medium">{sentenceOf(item)}</p>
      </>
    );
  } else {
    body = (
      <>
        <Eyebrow>{item?.kind === "agent_question" || (item?.kind === "question" && item.from === "agent_h") ? t("The agent asks you") : t("Nami")}</Eyebrow>
        <Sentence text={sentenceOf(item)} />
        {item?.kind === "agent" && item.list && item.list.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {item.list.map((entry) => (
              <li key={entry} className="rounded-full bg-[var(--np-fill)] px-3 py-1 text-[13px]">
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
    <section aria-live="polite" className="min-h-0 flex-1 overflow-y-auto px-6 pt-11 pb-4">
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
        "np-press grid place-items-center rounded-full text-[var(--np-on-accent)] shadow-[0_6px_20px_rgb(21_35_43/0.18)] ring-4 ring-[var(--np-wall)] outline-none focus-visible:ring-[var(--paper-soft)]",
        large ? "size-[68px]" : "size-[52px]",
        listening ? "bg-[var(--np-ink)]" : large ? "bg-[var(--paper)]" : "bg-[var(--np-wall)] text-[var(--paper)]",
      )}
    >
      {voice.status === "transcribing" ? <Loader2 className="size-5 animate-spin" /> : listening ? <Square className="size-5 fill-current" /> : <Mic className={large ? "size-7" : "size-6"} />}
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
    <p role="status" className="mb-2 min-h-5 text-center text-[14px] text-[var(--np-ink-soft)]">
      {text}
    </p>
  );
}

export const primaryButton =
  "np-press h-[52px] w-full rounded-2xl bg-[var(--paper)] px-5 text-[17px] font-semibold text-[var(--np-on-accent)] outline-none focus-visible:ring-4 focus-visible:ring-[var(--paper-soft)]";
export const secondaryButton =
  "np-press h-11 w-full rounded-2xl px-5 text-[16px] font-medium text-[var(--paper)] outline-none hover:bg-[var(--np-fill)] focus-visible:ring-4 focus-visible:ring-[var(--paper-soft)]";

export function TypeInstead({ onSubmit, t, placeholder }: { onSubmit: (text: string) => void | Promise<void>; t: Translate; placeholder?: string }) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={cn(secondaryButton, "flex items-center justify-center gap-2 text-[15px] text-[var(--np-ink-soft)]")}>
        <Keyboard className="size-4" /> {t("Type instead")}
      </button>
    );
  }
  return (
    <form
      className="mt-1 flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) void onSubmit(value.trim());
      }}
    >
      <input
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={t("Type instead")}
        className="h-12 min-w-0 flex-1 rounded-2xl bg-[var(--np-fill)] px-4 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--paper)]"
      />
      <button type="submit" disabled={!value.trim()} className="np-press h-12 rounded-2xl bg-[var(--np-ink)] px-5 text-[16px] font-semibold text-[var(--np-on-accent)] disabled:opacity-30">
        OK
      </button>
    </form>
  );
}

// The item Nami waits for: its microphone sits on the wave and opens on a tap only, never by itself.
function Answering(props: Props & { item: ConversationItem }) {
  const { item, t, scene, ...handlers } = props;
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
  const working = props.agent !== null || props.busy !== null || busy;

  return (
    <>
      <Painting scene={scene} wave={waveState(typed ? null : voice, speaking, working)} mic={typed ? undefined : <WaveMic voice={voice} t={t} />} />
      <Wall {...props} />
      <div className="px-5 pb-5">
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
              <div className="flex flex-col gap-1">
                <button type="button" className={primaryButton} onClick={() => handlers.onDecide(item.id, true)}>
                  {item.accept_label}
                </button>
                <button type="button" className={secondaryButton} onClick={() => handlers.onDecide(item.id, false)}>
                  {item.decline_label}
                </button>
              </div>
            ) : item.kind === "question" ? (
              <div className="flex flex-col gap-1">
                {item.options.map((option, i) => (
                  <button key={option.value} type="button" className={i === 0 ? primaryButton : secondaryButton} onClick={() => handlers.onAnswer(item.id, option.value, option.label)}>
                    {option.label}
                  </button>
                ))}
                {item.input === "text" ? <TypeInstead t={t} onSubmit={(text) => handlers.onAnswerText(item.id, text)} /> : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

// Nothing to answer: the wave follows Nami's voice and the agent; Stop while the agent works.
function Resting(props: Props) {
  const { agent, busy, t, onStop, scene } = props;
  const speaking = useSpeaking();
  return (
    <>
      <Painting scene={scene} wave={waveState(null, speaking, agent !== null || busy !== null)} />
      <Wall {...props} />
      <div className="flex min-h-[76px] items-end px-5 pb-5">
        {agent ? (
          <button type="button" onClick={onStop} className={cn(secondaryButton, "flex items-center justify-center gap-2 bg-[var(--np-fill)] text-[var(--np-ink)]")}>
            <Square className="size-3.5 fill-current" /> {t("Stop")}
          </button>
        ) : null}
      </div>
    </>
  );
}

export function FocusStage(props: Props) {
  const { item } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {item && awaiting(item) ? <Answering key={item.id} {...props} item={item} /> : <Resting {...props} />}
    </div>
  );
}
