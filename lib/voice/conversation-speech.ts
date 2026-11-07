import type { ConversationItem } from "@/lib/trip-state";

// What Nami says aloud for each item; null for what the user said.
export function speechText(item: ConversationItem): string | null {
  switch (item.kind) {
    case "user":
      return null;
    case "agent":
      return item.text;
    case "question":
      return item.question;
    case "proposal":
      return item.text;
  }
}

export function awaitsAnswer(item: ConversationItem): boolean {
  if (item.kind === "question") return item.answer === null;
  if (item.kind === "proposal") return item.decision === null;
  return false;
}

const answeredByUser = (item: ConversationItem) =>
  item.kind === "user" || (item.kind === "question" && item.answer !== null) || (item.kind === "proposal" && item.decision !== null);

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
