import { describe, expect, it } from "vitest";
import { agentChecklist, focusItem, readyPaper, sceneFor, sentenceSize } from "@/lib/panel-focus";
import { ARRIVAL_CARD_READY_MESSAGE, VISA_READY_MESSAGE, type ConversationItem } from "@/lib/trip-state";

const said = (id: string, text: string): ConversationItem => ({ id, kind: "agent", text });
const proposal = (id: string, decision: "accepted" | null = null): ConversationItem => ({
  id,
  kind: "proposal",
  action: "create_arrival_card",
  text: "Shall I fill in your arrival card?",
  accept_label: "Yes",
  decline_label: "No",
  decision,
});

describe("what the side panel shows", () => {
  it("shows what Nami waits for, even when Nami said something after it", () => {
    const items = [said("a", "Bali, Monday."), proposal("p"), said("b", "Still here.")];
    expect(focusItem(items)?.id).toBe("p");
  });

  it("shows the last thing Nami said when nothing waits for an answer", () => {
    const items: ConversationItem[] = [{ id: "u", kind: "user", text: "Bali" }, said("a", "Looking."), proposal("p", "accepted"), { id: "u2", kind: "user", text: "ok" }];
    expect(focusItem(items)?.id).toBe("p");
    expect(focusItem([])).toBeNull();
  });

  it("celebrates the paper the agent just made ready, right before the next proposal", () => {
    const visa = [said("r", VISA_READY_MESSAGE), proposal("p")];
    expect(readyPaper(visa, focusItem(visa))).toBe("visa");
    const card = [said("r", ARRIVAL_CARD_READY_MESSAGE), proposal("p")];
    expect(readyPaper(card, focusItem(card))).toBe("arrival_card");
    const other = [said("r", "Okay."), proposal("p")];
    expect(readyPaper(other, focusItem(other))).toBeNull();
  });
});

describe("the agent's steps", () => {
  it("checks every step up to the furthest one the agent reached", () => {
    const steps = ["Clicking the nationality dropdown", "Selected FRANCE", "Choosing Tourism, Family Visit, and Transit"];
    expect(agentChecklist("visa", steps, false).map((s) => s.state)).toEqual(["done", "done", "current", "todo", "todo", "todo"]);
  });

  it("does not count the passport before it is uploaded", () => {
    const steps = ["Reading the passport section of the form"];
    expect(agentChecklist("visa", steps, false)[4].state).toBe("todo");
    expect(agentChecklist("visa", ["Nami gave the passport to the agent"], false)[4].state).toBe("done");
  });

  it("checks everything once the paper is ready", () => {
    expect(agentChecklist("arrival_card", [], true).every((s) => s.state === "done")).toBe(true);
  });
});

describe("the sentence", () => {
  it("is written smaller when it is long", () => {
    expect(sentenceSize("Where are you going?")).toBe("xl");
    expect(sentenceSize("x".repeat(100))).toBe("lg");
    expect(sentenceSize("x".repeat(200))).toBe("md");
  });
});

describe("the time of day behind the panel", () => {
  it("goes from dawn to night as the papers get done", () => {
    const base = { started: true, paper: "visa" as const, visaReady: false, cardReady: false };
    expect(sceneFor({ ...base, started: false })).toBe("aube");
    expect(sceneFor(base)).toBe("matin");
    expect(sceneFor({ ...base, visaReady: true })).toBe("dore");
    expect(sceneFor({ ...base, paper: "arrival_card" })).toBe("dore");
    expect(sceneFor({ ...base, visaReady: true, cardReady: true })).toBe("nuit");
  });
});
