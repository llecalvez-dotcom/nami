import { describe, expect, it, vi } from "vitest";
import type { CompleteJson } from "@/lib/llm";
import type { ConversationItem } from "@/lib/trip-state";
import { intentFromModel, interpretAnswer, questionFromItem, quickIntent, type IntentQuestion } from "@/lib/voice/intent";

const proposal: IntentQuestion = {
  kind: "proposal",
  text: "Do you also want me to help you find your flights?",
  options: [
    { id: "accept", label: "Yes, find my flights" },
    { id: "decline", label: "Not now" },
  ],
};

const criterion: IntentQuestion = {
  kind: "question",
  text: "What matters most for your flights: the cheapest, the fastest, no stop if possible, or the best balance?",
  options: [
    { id: "cheapest", label: "The cheapest" },
    { id: "fastest", label: "The fastest" },
    { id: "fewest_stops", label: "No stop if possible" },
    { id: "best", label: "The best balance" },
  ],
};

const flights: IntentQuestion = {
  kind: "question",
  text: "Three flights: which one shall I open?",
  options: [
    { id: "0", label: "The first: Scoot, 646 €, 1 stop, 19 h" },
    { id: "2", label: "The second: Qatar Airways, 812 €, 1 stop, 17 h" },
    { id: "5", label: "The third: Emirates, 905 €, 1 stop, 18 h" },
  ],
};

const model = (output: unknown) => vi.fn<CompleteJson>(async () => JSON.stringify(output));

describe("quickIntent", () => {
  it("answers the closed lists without the model", () => {
    expect(quickIntent({ transcript: "ouais carrément", question: proposal })).toEqual({ kind: "accept", confidence: 1 });
    expect(quickIntent({ transcript: "non merci", question: proposal })).toEqual({ kind: "decline", confidence: 1 });
    expect(quickIntent({ transcript: "the fastest", question: criterion })).toEqual({ kind: "option", option_ids: ["fastest"], confidence: 1 });
  });

  it("picks the only option of a proposed answer on a yes", () => {
    const question: IntentQuestion = { kind: "question", text: "Back on the 20th?", options: [{ id: "2026-11-20", label: "Yes, those dates" }] };
    expect(quickIntent({ transcript: "oui", question })).toEqual({ kind: "option", option_ids: ["2026-11-20"], confidence: 1 });
  });

  it("says nothing for a sentence", () => {
    expect(quickIntent({ transcript: "ouais je suis chaud", question: proposal })).toBeNull();
    expect(quickIntent({ transcript: "bah du coup le moins cher et le plus rapide", question: criterion })).toBeNull();
  });
});

describe("interpretAnswer", () => {
  it("reads a familiar yes with the model", async () => {
    const complete = model({ intent: "accept", option_ids: "", confidence: "high" });
    const intent = await interpretAnswer({ transcript: "ouais je suis chaud", language: "fr", question: proposal }, complete);
    expect(intent).toEqual({ kind: "accept", confidence: 0.9 });
    const prompt = JSON.parse(complete.mock.calls[0]![0].user);
    expect(prompt).toMatchObject({ language: "fr", transcript: "ouais je suis chaud", options: proposal.options });
    expect(complete.mock.calls[0]![0].system).toContain("chaud");
  });

  it("reads a negation as a decline", async () => {
    const complete = model({ intent: "decline", option_ids: "", confidence: "high" });
    expect(await interpretAnswer({ transcript: "non pas maintenant franchement", language: "fr", question: proposal }, complete)).toEqual({ kind: "decline", confidence: 0.9 });
  });

  it("turns a proposal button named by the model into accept or decline", async () => {
    expect(intentFromModel(JSON.stringify({ intent: "option", option_ids: "accept", confidence: "medium" }), { transcript: "x", question: proposal })).toEqual({ kind: "accept", confidence: 0.6 });
    expect(intentFromModel(JSON.stringify({ intent: "option", option_ids: "decline", confidence: "medium" }), { transcript: "x", question: proposal })).toEqual({ kind: "decline", confidence: 0.6 });
  });

  it("never acts on a hesitant guess of the model", () => {
    expect(intentFromModel(JSON.stringify({ intent: "accept", option_ids: "", confidence: "low" }), { transcript: "mouais", question: proposal })).toEqual({ kind: "free", text: "mouais", confidence: 0.3 });
    expect(intentFromModel(JSON.stringify({ intent: "option", option_ids: "2", confidence: "low" }), { transcript: "x", question: flights })).toEqual({ kind: "free", text: "x", confidence: 0.3 });
  });

  it("takes the compromise option when two exclusive criteria are named", async () => {
    const complete = model({ intent: "option", option_ids: "cheapest, fastest", confidence: "medium" });
    const intent = await interpretAnswer({ transcript: "bah du coup le moins cher et le plus rapide", language: "fr", question: criterion }, complete);
    expect(intent).toEqual({ kind: "option", option_ids: ["best"], confidence: 0.6 });
  });

  it("takes the first option named when there is no compromise", () => {
    const raw = JSON.stringify({ intent: "option", option_ids: "2,5", confidence: "medium" });
    expect(intentFromModel(raw, { transcript: "x", question: flights })).toEqual({ kind: "option", option_ids: ["2"], confidence: 0.6 });
  });

  it("keeps every option named when the question allows several", () => {
    const raw = JSON.stringify({ intent: "option", option_ids: "2,5", confidence: "high" });
    expect(intentFromModel(raw, { transcript: "x", question: { ...flights, allow_multiple: true } })).toEqual({ kind: "option", option_ids: ["2", "5"], confidence: 0.9 });
  });

  it("picks the flight by its position or airline", async () => {
    const complete = model({ intent: "option", option_ids: "2", confidence: "high" });
    expect(await interpretAnswer({ transcript: "je veux le deuxième, celui de Qatar", language: "fr", question: flights }, complete)).toEqual({ kind: "option", option_ids: ["2"], confidence: 0.9 });
  });

  it("falls back to free when the model names an option that does not exist", async () => {
    const complete = model({ intent: "option", option_ids: "7", confidence: "high" });
    expect(await interpretAnswer({ transcript: "le septième", language: "fr", question: flights }, complete)).toEqual({ kind: "free", text: "le septième", confidence: 0.9 });
  });

  it("falls back to free on a bare yes to a question with several options", () => {
    expect(intentFromModel(JSON.stringify({ intent: "accept", option_ids: "", confidence: "high" }), { transcript: "ouais", question: criterion })).toEqual({ kind: "free", text: "ouais", confidence: 0.9 });
  });

  it("falls back to free on an unreadable model answer", () => {
    expect(intentFromModel("not json", { transcript: "x", question: proposal })).toEqual({ kind: "free", text: "x", confidence: 0 });
    expect(intentFromModel(JSON.stringify({ intent: "maybe" }), { transcript: "x", question: proposal })).toEqual({ kind: "free", text: "x", confidence: 0 });
  });

  it("falls back to free when the model fails or is too slow", async () => {
    const failing = vi.fn<CompleteJson>(async () => {
      throw new Error("H Models API returned 500");
    });
    expect(await interpretAnswer({ transcript: "hmm je sais pas", language: "fr", question: proposal }, failing)).toEqual({ kind: "free", text: "hmm je sais pas", confidence: 0 });

    const slow = vi.fn<CompleteJson>(() => new Promise<string>((resolve) => setTimeout(() => resolve(JSON.stringify({ intent: "accept", option_ids: "", confidence: "high" })), 50)));
    expect(await interpretAnswer({ transcript: "ouais je suis chaud", language: "fr", question: proposal }, slow, { timeoutMs: 5 })).toEqual({ kind: "free", text: "ouais je suis chaud", confidence: 0 });
  });

  it("never calls the model for a question without options", async () => {
    const complete = model({ intent: "accept", option_ids: "", confidence: "high" });
    const question: IntentQuestion = { kind: "question", text: "Your email?", options: [] };
    expect(await interpretAnswer({ transcript: "jean@example.com", language: "fr", question }, complete)).toEqual({ kind: "free", text: "jean@example.com", confidence: 0 });
    expect(complete).not.toHaveBeenCalled();
  });
});

describe("questionFromItem", () => {
  it("turns a proposal into its two buttons and a question into its options", () => {
    const proposalItem: ConversationItem = { id: "p1", kind: "proposal", action: "flights", text: "Flights?", accept_label: "Yes", decline_label: "Not now", decision: null };
    expect(questionFromItem(proposalItem)).toEqual({ kind: "proposal", text: "Flights?", options: [{ id: "accept", label: "Yes" }, { id: "decline", label: "Not now" }] });
    const questionItem: ConversationItem = { id: "q1", kind: "question", from: "nami", field: "flight_criterion", question: "Which?", options: [{ label: "The cheapest", value: "cheapest" }], input: null, answer: null };
    expect(questionFromItem(questionItem)).toEqual({ kind: "question", text: "Which?", options: [{ id: "cheapest", label: "The cheapest" }] });
    expect(questionFromItem({ id: "u", kind: "user", text: "hi" })).toBeNull();
  });
});
