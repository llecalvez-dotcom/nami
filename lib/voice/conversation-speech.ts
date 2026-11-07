import type { ConversationItem } from "@/lib/trip-state";

// Nami says less than she writes (Nathan, 2026-11-07: « à l'oral, il faut que le bot dise moins de choses »): the first
// sentence, and the question when it comes later. The whole text stays on the screen.
export function spokenShort(text: string): string {
  const sentences = text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  const first = sentences[0] ?? "";
  if (first.endsWith("?")) return first;
  const question = sentences.find((sentence) => sentence.endsWith("?"));
  return question ? `${first} ${question}` : first;
}

// What Nami says aloud for each item; null for what the user said.
export function speechText(item: ConversationItem): string | null {
  switch (item.kind) {
    case "user":
      return null;
    case "agent":
      return spokenShort(item.text);
    case "question":
    case "agent_question":
      return spokenShort(item.question);
    case "proposal":
      return spokenShort(item.text);
  }
}

export function awaitsAnswer(item: ConversationItem): boolean {
  if (item.kind === "question" || item.kind === "agent_question") return item.answer === null;
  if (item.kind === "proposal") return item.decision === null;
  return false;
}

const answeredByUser = (item: ConversationItem) =>
  item.kind === "user" ||
  ((item.kind === "question" || item.kind === "agent_question") && item.answer !== null) ||
  (item.kind === "proposal" && item.decision !== null);

// When the page opens, everything up to the user's last answer counts as already heard: only what came after it is read.
export function alreadyHeard(items: ConversationItem[]): Set<string> {
  const last = items.findLastIndex(answeredByUser);
  return new Set(items.slice(0, last + 1).map((item) => item.id));
}

// Items to read now, in order, and whether the queue must be cleared first (an item being read was just answered).
export function speechPlan(items: ConversationItem[], heard: Set<string>, awaiting: Set<string>) {
  const interrupted = items.some((item) => awaiting.has(item.id) && !awaitsAnswer(item));
  const toRead = items
    .filter((item) => !heard.has(item.id))
    .map((item) => ({ id: item.id, text: speechText(item) }))
    .filter((entry): entry is { id: string; text: string } => entry.text !== null);
  return { interrupted, toRead };
}
