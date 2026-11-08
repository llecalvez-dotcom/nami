import type { ConversationItem } from "@/lib/trip-state";
import { isCriterionQuestion, namesSeveralCriteria } from "@/lib/flights/flow";
import type { Intent } from "@/lib/voice/intent";

export type AnswerHandlers = {
  onAnswer: (itemId: string, value: string, label: string) => void;
  onAnswerText: (itemId: string, text: string) => Promise<void>;
  onDecide: (itemId: string, accepted: boolean) => void;
};

export type Dispatched = "accepted" | "declined" | "option" | "text" | "unclear" | "ignored";

// One path for what the traveller says and what the traveller types: the closed word lists, then the H model
// (components/voice/use-intent.ts), then the same tap as a button. Nothing is ever clicked on a guess: a proposal
// that is not a clear yes or no is "unclear" and the question stays on the screen.
export async function dispatchAnswer(
  item: ConversationItem,
  text: string,
  interpret: (item: ConversationItem, text: string) => Promise<Intent>,
  handlers: AnswerHandlers,
  log: (kind: Intent["kind"]) => void = () => {},
): Promise<Dispatched> {
  if (item.kind !== "proposal" && item.kind !== "question") return "ignored";
  const meaning = await interpret(item, text);
  log(meaning.kind);
  if (item.kind === "proposal") {
    if (meaning.kind === "accept" || meaning.kind === "decline") {
      handlers.onDecide(item.id, meaning.kind === "accept");
      return meaning.kind === "accept" ? "accepted" : "declined";
    }
    return "unclear";
  }
  // Several criteria at once ("le moins cher et le plus rapide"): never one of them, whatever the H model kept. The
  // text path gives the compromise and Nami says so (answerFlightQuestionWithText).
  const combined = isCriterionQuestion(item) && namesSeveralCriteria(text);
  const option = !combined && meaning.kind === "option" ? item.options.find((o) => o.value === meaning.option_ids[0]) : undefined;
  if (option) {
    handlers.onAnswer(item.id, option.value, option.label);
    return "option";
  }
  await handlers.onAnswerText(item.id, text);
  return "text";
}
