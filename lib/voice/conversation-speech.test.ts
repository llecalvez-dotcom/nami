import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSampleTrip, createTripFromRequest, decideProposal, type ConversationItem } from "@/lib/trip-state";
import { alreadyHeard, speechPlan, speechText, spokenShort } from "@/lib/voice/conversation-speech";

const now = new Date("2026-11-08T12:52:00Z");

describe("in the side panel, Nami says only the sentence on the screen", () => {
  const message = (id: string, text: string): ConversationItem => ({ id, kind: "agent", text }) as ConversationItem;
  const proposal = (id: string, text: string): ConversationItem =>
    ({ id, kind: "proposal", action: "papers", text, accept_label: "Yes", decline_label: "No", decision: null }) as ConversationItem;

  it("skips the messages that came before the question on the screen", () => {
    const items = [message("a", "Bali, for a wedding."), message("b", "I looked at your papers."), proposal("c", "Do you travel with a French passport?")];
    const plan = speechPlan(items, new Set(), new Set(), true);
    expect(plan.toRead).toEqual([{ id: "c", text: "Do you travel with a French passport?" }]);
  });

  it("cuts the sentence that has just left the screen", () => {
    const items = [message("a", "One moment."), proposal("c", "Shall I go on?")];
    expect(speechPlan(items, new Set(["a"]), new Set(), true).interrupted).toBe(true);
  });

  it("says nothing new while the question on the screen is still the same", () => {
    const items = [proposal("c", "Shall I go on?"), message("d", "A late message.")];
    const plan = speechPlan(items, new Set(["c"]), new Set(["c"]), true);
    expect(plan.toRead).toEqual([]);
    expect(plan.interrupted).toBe(false);
  });

  it("still reads everything in the full conversation screen", () => {
    const items = [message("a", "One."), proposal("c", "Two?")];
    expect(speechPlan(items, new Set(), new Set()).toRead.map((entry) => entry.id)).toEqual(["a", "c"]);
  });
});

describe("conversation speech", () => {
  it("reads Nami's items, not the user's", () => {
    const items = createSampleTrip(now).conversation;
    expect(items.map(speechText)).toEqual([null, "Bali, Monday 9 to Friday 20 November, for a friend's wedding.", "When do you land in Bali?"]);
  });

  it("on a new trip, reads what came after the request, in order", () => {
    const items = createSampleTrip(now).conversation;
    const plan = speechPlan(items, alreadyHeard(items), new Set());
    expect(plan.interrupted).toBe(false);
    expect(plan.toRead.map((e) => e.id)).toEqual([items[1].id, items[2].id]);
  });

  it("reads only the new items after an answer, and cuts the card being read", () => {
    const trip = createTripFromRequest("t", { ...createSampleTrip(now).request, arrival_at: "2026-11-10T14:30+08:00" }, now);
    const proposal = trip.conversation.findLast((i): i is Extract<ConversationItem, { kind: "proposal" }> => i.kind === "proposal")!;
    const heard = new Set(trip.conversation.map((i) => i.id));
    const after = decideProposal(trip, proposal.id, true, now).conversation;
    const plan = speechPlan(after, heard, new Set([proposal.id]));
    expect(plan.interrupted).toBe(true);
    expect(plan.toRead.length).toBeGreaterThan(0);
    expect(plan.toRead.every((e) => !heard.has(e.id))).toBe(true);
  });

  it("reads a question from the H agent and cuts it once answered", () => {
    const question: ConversationItem = {
      id: "q1",
      kind: "agent_question",
      tool_req: { id: "t1", tool_name: "ask_user", args: { question: "Which hotel?", field: "hotel" } },
      question: "Which hotel?",
      field: "hotel",
      answer: null,
    };
    expect(speechText(question)).toBe("Which hotel?");
    expect(speechPlan([question], new Set(), new Set()).toRead).toEqual([{ id: "q1", text: "Which hotel?" }]);
    expect(speechPlan([{ ...question, answer: "Ubud" }], new Set(["q1"]), new Set(["q1"])).interrupted).toBe(true);
  });

  it("never puts a microphone on the passport card", () => {
    const source = readFileSync(new URL("../../components/trip/passport-card.tsx", import.meta.url), "utf8");
    expect(source).not.toMatch(/components\/voice|useVoiceInput|MicButton/);
  });

  it("says the first sentence and the question, never the whole paragraph", () => {
    expect(spokenShort("For Bali you need an e-VOA. Shall I fill it in for you on the official site? I stop before anything is sent: you check, you send."))
      .toBe("For Bali you need an e-VOA. Shall I fill it in for you on the official site?");
    expect(spokenShort("I found your passport on this computer (passport.jpg). Shall I read it? It is sent to H Company to be read, never stored."))
      .toBe("I found your passport on this computer (passport.jpg). Shall I read it?");
    expect(spokenShort("Watch the tab on the left: you will see every click. I never click Pay.")).toBe("Watch the tab on the left: you will see every click.");
    expect(spokenShort("Do you also want me to help you find your flights?")).toBe("Do you also want me to help you find your flights?");
    expect(spokenShort("Pour Bali, il vous faut un e-VOA. Je le remplis pour vous ? Je m'arrête avant tout envoi.")).toBe("Pour Bali, il vous faut un e-VOA. Je le remplis pour vous ?");
  });
});
