import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSampleTrip, createTripFromRequest, decideProposal, type ConversationItem } from "@/lib/trip-state";
import { alreadyHeard, speechPlan, speechText } from "@/lib/voice/conversation-speech";

const now = new Date("2026-11-08T12:52:00Z");

describe("conversation speech", () => {
  it("reads Nami's items, not the user's", () => {
    const items = createSampleTrip(now).conversation;
    expect(items.map(speechText)).toEqual([null, "Bali, Monday 9 to Friday 20 November, for a friend's wedding. One thing I need:", "When do you land in Bali?"]);
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
});
