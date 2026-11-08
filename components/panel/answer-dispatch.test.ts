import { describe, expect, it, vi } from "vitest";
import { dispatchAnswer } from "@/components/panel/answer-dispatch";
import { requestIntent } from "@/components/voice/use-intent";
import type { ConversationItem } from "@/lib/trip-state";

const visa: ConversationItem = {
  id: "p",
  kind: "proposal",
  action: "create_visa",
  text: "For Bali you need an e-VOA. Shall I fill it in for you?",
  accept_label: "Create my visa",
  decline_label: "Not now",
  decision: null,
};

const purpose: ConversationItem = {
  id: "q",
  kind: "question",
  from: "nami",
  field: "purpose",
  question: "Why are you going?",
  options: [
    { value: "tourism", label: "Tourism" },
    { value: "business", label: "Business" },
  ],
  input: null,
  answer: null,
};

// No network: the word lists answer, and anything else is "free" as when the H model is unreachable.
const offline = (item: ConversationItem, text: string) => requestIntent(item, text, async () => new Response("", { status: 503 }));
const handlers = () => ({ onAnswer: vi.fn(), onAnswerText: vi.fn(async () => {}), onDecide: vi.fn() });

describe("typed answers take the same path as spoken ones", () => {
  it("accepts a proposal typed as 'yes sure'", async () => {
    const h = handlers();
    expect(await dispatchAnswer(visa, "yes sure", offline, h)).toBe("accepted");
    expect(h.onDecide).toHaveBeenCalledWith("p", true);
  });

  it("accepts 'ouais carrément' and declines 'non pas maintenant'", async () => {
    const h = handlers();
    expect(await dispatchAnswer(visa, "ouais carrément", offline, h)).toBe("accepted");
    expect(await dispatchAnswer(visa, "non pas maintenant", offline, h)).toBe("declined");
    expect(h.onDecide).toHaveBeenNthCalledWith(1, "p", true);
    expect(h.onDecide).toHaveBeenNthCalledWith(2, "p", false);
  });

  it("never decides a proposal on a guess", async () => {
    const h = handlers();
    expect(await dispatchAnswer(visa, "what is an e-VOA?", offline, h)).toBe("unclear");
    expect(h.onDecide).not.toHaveBeenCalled();
    expect(h.onAnswerText).not.toHaveBeenCalled();
  });

  it("taps the option a typed word names, and sends anything else as text", async () => {
    const h = handlers();
    expect(await dispatchAnswer(purpose, "business", offline, h)).toBe("option");
    expect(h.onAnswer).toHaveBeenCalledWith("q", "business", "Business");
    expect(await dispatchAnswer(purpose, "visiting my cousin", offline, h)).toBe("text");
    expect(h.onAnswerText).toHaveBeenCalledWith("q", "visiting my cousin");
  });
});
