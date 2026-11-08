import { describe, expect, it } from "vitest";
import { agentChecklist, agentStatusLine, focusItem, paperOfRun, readyPaper, sceneFor, sentenceSize, STATUS_TEXTS } from "@/lib/panel-focus";
import type { AgentRun } from "@/lib/contracts";
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

const run = (over: Partial<AgentRun> = {}): AgentRun => ({ session_id: "s1", kind: "paper", paper_id: "evoa", started_at: "2026-11-08T01:00:00.000Z", state: "running", ...over });

describe("the line that always says what the agent does", () => {
  it("is empty without a session, and names the paper of one", () => {
    expect(agentStatusLine(null, [])).toBeNull();
    expect(paperOfRun(null)).toBeNull();
    expect(paperOfRun(run())).toBe("visa");
    expect(paperOfRun(run({ paper_id: "arrival_card" }))).toBe("arrival_card");
    expect(paperOfRun(run({ kind: "flights" }))).toBe("flights");
  });

  it("says the site opens until the agent is seen on it, then counts the steps of the form", () => {
    expect(agentStatusLine(run({ state: "pending" }), [])).toEqual({ text: "Nami is opening the e-VOA site" });
    expect(agentStatusLine(run(), ["Agent started in your Chrome"])).toEqual({ text: "Nami is opening the e-VOA site" });
    expect(agentStatusLine(run({ paper_id: "arrival_card", state: "queued" }), [])).toEqual({ text: "Nami is opening the arrival card site" });
    const steps = ["Agent started in your Chrome", "On evisa.imigrasi.go.id", "Choosing FRANCE", "Action: pick_option"];
    expect(agentStatusLine(run(), steps)).toEqual({ text: "Filling the form", progress: "4/~20" });
    expect(agentStatusLine(run({ metrics: { steps: 7, total_cost: null } }), steps)).toEqual({ text: "Filling the form", progress: "7/~20" });
    expect(agentStatusLine(run({ paper_id: "arrival_card" }), steps)).toEqual({ text: "Filling the form", progress: "4/~12" });
  });

  it("says which file goes up, and when the agent waits for the traveller", () => {
    const seen = ["On evisa.imigrasi.go.id"];
    expect(agentStatusLine(run(), [...seen, "I upload the passport scan"])).toEqual({ text: "Uploading your passport" });
    expect(agentStatusLine(run(), [...seen, "Attaching the photo"])).toEqual({ text: "Uploading your photo" });
    expect(agentStatusLine(run(), [...seen, "Uploading the return ticket"])).toEqual({ text: "Uploading your return ticket" });
    const question = { id: "q1", question: "Which port?", options: ["Bali"], tool_req: { tool_name: "ask_user", args: {}, id: "t1" } } as unknown as AgentRun["pending_question"];
    expect(agentStatusLine(run({ pending_question: question }), seen)).toEqual({ text: "Waiting for you" });
  });

  it("follows the flight search from Google Flights to the booking page", () => {
    const flights = (result: Record<string, unknown>, steps = ["On www.google.com"]) =>
      agentStatusLine(run({ kind: "flights", result: { flights: result } }), steps);
    expect(agentStatusLine(run({ kind: "flights", state: "pending" }), [])).toEqual({ text: "Nami is opening Google Flights" });
    expect(flights({ url: "https://www.google.com/travel/flights" })).toEqual({ text: "Searching flights on Google Flights" });
    expect(flights({ read: 6 })).toEqual({ text: "Reading the flights" });
    const option = { airline: "KLM", price: 900, currency: "EUR", stops: 1, duration_min: 900, depart_at: "10:00", arrive_at: "08:00", layovers: [], index: 1 };
    expect(flights({ read: 6, options: [option] })).toEqual({ text: "Waiting for you" });
    expect(flights({ options: [option], chosen: option })).toEqual({ text: "Opening the booking page" });
    expect(flights({ options: [option], chosen: option, ready: true })).toEqual({ text: "Waiting for you" });
  });

  it("ends with Done or Stopped, and has no dash in its texts", () => {
    expect(agentStatusLine(run({ state: "completed" }), [])).toEqual({ text: "Done" });
    expect(agentStatusLine(run({ state: "failed" }), [])).toEqual({ text: "Stopped" });
    expect(agentStatusLine(run({ state: "interrupted" }), [])).toEqual({ text: "Stopped" });
    expect(STATUS_TEXTS.join(" ")).not.toMatch(/[–—]/);
    for (const text of ["Done", "Stopped", "Waiting for you", "Filling the form", "Nami is opening Google Flights"]) expect(STATUS_TEXTS).toContain(text);
  });
});
