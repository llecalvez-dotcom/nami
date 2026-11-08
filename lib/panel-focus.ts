import { awaitsAnswer } from "@/lib/voice/conversation-speech";
import type { AgentRun } from "@/lib/contracts";
import { flightsResult } from "@/lib/flights/flow";
import { isTerminalStatus } from "@/lib/h-agent";
import { ARRIVAL_CARD_READY_MESSAGE, VISA_READY_MESSAGE, type ConversationItem, type Trip } from "@/lib/trip-state";
import { isFlightQuestion, isFlightReadyMessage } from "@/lib/flights/flow";

// The side panel shows one thing at a time (docs/specs/2026-11-07-refonte-panneau.md): what Nami waits for, or else
// the last thing Nami said. Computed on the English conversation; the panel shows the translated item with the same id.

// "flights" is the third one: the flight search (ticket 18), evening sky.
export type Paper = "visa" | "arrival_card" | "flights";

// The first item still waiting for an answer, or the last item from Nami or the agent.
export function focusItem(items: readonly ConversationItem[]): ConversationItem | null {
  return items.find(awaitsAnswer) ?? items.findLast((item) => item.kind !== "user") ?? null;
}

// The paper just made ready by the agent, when the item in focus is what comes right after it.
export function readyPaper(items: readonly ConversationItem[], focus: ConversationItem | null): Paper | null {
  if (!focus) return null;
  const index = items.findIndex((item) => item.id === focus.id);
  const ready = [items[index], items[index - 1]].find((item) => item?.kind === "agent");
  if (ready?.kind !== "agent") return null;
  if (ready.text === VISA_READY_MESSAGE) return "visa";
  if (ready.text === ARRIVAL_CARD_READY_MESSAGE) return "arrival_card";
  if (isFlightReadyMessage(ready.text)) return "flights";
  return null;
}

// Each paper has its color: the visa is the lagoon, the arrival card the frangipani.
export function paperInFocus(trip: Trip, focus: ConversationItem | null): Paper {
  if (focus?.kind === "proposal" && focus.action === "create_arrival_card") return "arrival_card";
  if (focus?.kind === "proposal" && focus.action === "create_visa") return "visa";
  if ((focus?.kind === "proposal" && focus.action === "flights") || (focus?.kind === "question" && isFlightQuestion(focus.field))) return "flights";
  if (trip.agent_run?.kind === "flights") return "flights";
  return trip.agent_run?.paper_id === "arrival_card" ? "arrival_card" : "visa";
}

type Milestone = { label: string; pattern: RegExp };

// The steps of each form, in the order the agent meets them, found in its own words.
const MILESTONES: Record<Paper, Milestone[]> = {
  visa: [
    { label: "Country", pattern: /\b(france|nationality|country)\b/i },
    { label: "Purpose of the trip", pattern: /\b(tourism|purpose|general, family|social)\b/i },
    { label: "Type of visa", pattern: /\b(b1|visa on arrival|tourist)\b/i },
    { label: "Application", pattern: /\b(apply|detail & apply|application form)\b/i },
    { label: "Passport", pattern: /\bpassport\b.*\b(upload|file|attach)|gave the passport|(upload|attach).*\bpassport\b/i },
    { label: "Photo", pattern: /\b(photo|picture)\b/i },
  ],
  arrival_card: [
    { label: "Open the form", pattern: /\b(all indonesia|allindonesia|arrival card|form)\b/i },
    { label: "Your details", pattern: /\b(passport|name|nationality)\b/i },
    { label: "Your trip", pattern: /\b(flight|arrival date|address|accommodation|hotel)\b/i },
    { label: "Declarations", pattern: /\b(health|customs|declar\w*)\b/i },
  ],
  flights: [
    { label: "Dates", pattern: /\b(google flights|opened google|dates?|round trip|aller-retour)\b/i },
    { label: "Results", pattern: /\bread \d+ flights?\b|\b(results|flights? (list|shown)|report_flights)\b/i },
    { label: "Your choice", pattern: /\byou chose\b|\b(chose|chosen|selected|clicked) .*\bflight\b/i },
    { label: "Booking page", pattern: /\b(booking (options|page)|stopped on the booking)\b/i },
  ],
};

export type Checklist = { label: string; state: "done" | "current" | "todo" }[];

// The furthest milestone reached counts the ones before it as done; the next one is the current one.
export function agentChecklist(paper: Paper, steps: readonly string[], finished: boolean): Checklist {
  const milestones = MILESTONES[paper];
  const reached = milestones.findLastIndex((m) => steps.some((step) => m.pattern.test(step)));
  return milestones.map((m, i) => ({
    label: m.label,
    state: finished || i <= reached ? "done" : i === reached + 1 ? "current" : "todo",
  }));
}

export const CHECKLIST_LABELS = Object.values(MILESTONES).flatMap((list) => list.map((m) => m.label));

// The paper a session works on.
export function paperOfRun(run: AgentRun | null): Paper | null {
  if (!run) return null;
  if (run.kind === "flights") return "flights";
  return run.paper_id === "arrival_card" ? "arrival_card" : "visa";
}

const OPENING: Record<Paper, string> = {
  visa: "Nami is opening the e-VOA site",
  arrival_card: "Nami is opening the arrival card site",
  flights: "Nami is opening Google Flights",
};
// About how many steps each form takes the agent (visa measured at 19 on 2026-11-07).
const FORM_STEPS: Record<Paper, number> = { visa: 20, arrival_card: 12, flights: 10 };

export type AgentStatus = { text: string; progress?: string };

// What the agent is doing, in one short line always shown in the panel (Clément, 2026-11-08: « aucune visualisation »).
// The text is one of STATUS_TEXTS, so the panel can translate it; the progress is appended as is.
export function agentStatusLine(run: AgentRun | null, steps: readonly string[]): AgentStatus | null {
  const paper = paperOfRun(run);
  if (!run || !paper) return null;
  if (run.state === "completed") return { text: "Done" };
  if (isTerminalStatus(run.state)) return { text: "Stopped" };
  if (run.pending_question) return { text: "Waiting for you" };
  if (run.state === "pending" || run.state === "queued" || !steps.some((step) => step.startsWith("On "))) return { text: OPENING[paper] };
  if (paper === "flights") {
    const result = flightsResult(run);
    if (result?.ready) return { text: "Waiting for you" };
    if (result?.chosen) return { text: "Opening the booking page" };
    if (result?.options.length) return { text: "Waiting for you" };
    if (result?.read) return { text: "Reading the flights" };
    return { text: "Searching flights on Google Flights" };
  }
  const last = steps.at(-1) ?? "";
  if (/\b(upload\w*|attach\w*|gave)\b/i.test(last)) {
    if (/\bpassport\b/i.test(last)) return { text: "Uploading your passport" };
    if (/\b(photo|picture)\b/i.test(last)) return { text: "Uploading your photo" };
    if (/\bticket\b/i.test(last)) return { text: "Uploading your return ticket" };
  }
  const count = run.metrics?.steps ?? steps.length;
  return { text: "Filling the form", progress: `${count}/~${FORM_STEPS[paper]}` };
}

export const STATUS_TEXTS = [
  ...Object.values(OPENING),
  "Filling the form",
  "Uploading your passport",
  "Uploading your photo",
  "Uploading your return ticket",
  "Searching flights on Google Flights",
  "Reading the flights",
  "Opening the booking page",
  "Waiting for you",
  "Done",
  "Stopped",
];

// The longer the sentence, the smaller it is written: it must fit the side panel without scrolling.
export function sentenceSize(text: string): "xl" | "lg" | "md" {
  if (text.length <= 70) return "xl";
  if (text.length <= 140) return "lg";
  return "md";
}

// The same gate above Bali at four times of day: the day goes by as the papers get done.
export type Scene = "aube" | "matin" | "dore" | "nuit";

export function sceneFor({ started, paper, visaReady, cardReady }: { started: boolean; paper: Paper; visaReady: boolean; cardReady: boolean }): Scene {
  if (!started) return "aube";
  if (cardReady || paper === "flights") return "nuit";
  if (visaReady || paper === "arrival_card") return "dore";
  return "matin";
}
