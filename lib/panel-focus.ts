import { awaitsAnswer } from "@/lib/voice/conversation-speech";
import { ARRIVAL_CARD_READY_MESSAGE, VISA_READY_MESSAGE, type ConversationItem, type Trip } from "@/lib/trip-state";

// The side panel shows one thing at a time (docs/specs/2026-11-07-refonte-panneau.md): what Nami waits for, or else
// the last thing Nami said. Computed on the English conversation; the panel shows the translated item with the same id.

export type Paper = "visa" | "arrival_card";

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
  return null;
}

// Each paper has its color: the visa is the lagoon, the arrival card the frangipani.
export function paperInFocus(trip: Trip, focus: ConversationItem | null): Paper {
  if (focus?.kind === "proposal" && focus.action === "create_arrival_card") return "arrival_card";
  if (focus?.kind === "proposal" && focus.action === "create_visa") return "visa";
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

// The longer the sentence, the smaller it is written: it must fit the side panel without scrolling.
export function sentenceSize(text: string): "xl" | "lg" | "md" {
  if (text.length <= 70) return "xl";
  if (text.length <= 140) return "lg";
  return "md";
}

// Splits the sentence around the destination, written in italics; the whole sentence when it is not there.
export function pivotParts(text: string, word: string | null | undefined): [string, string, string] {
  if (!word) return [text, "", ""];
  const at = text.toLowerCase().indexOf(word.toLowerCase());
  if (at < 0) return [text, "", ""];
  return [text.slice(0, at), text.slice(at, at + word.length), text.slice(at + word.length)];
}
