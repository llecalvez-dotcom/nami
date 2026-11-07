import { toolCallKey } from "@/lib/agent-changes";
import { INVALID_AGENT_ANSWER } from "@/lib/agent-answer";
import { describe, expect, it } from "vitest";
import { freshToolCalls, redact, toAgentChanges, type AgentChanges } from "@/lib/agent-changes";
import { TripRequestDraftSchema } from "@/lib/contracts";
import {
  ARRIVAL_CARD_READY_MESSAGE,
  answerAgentQuestion,
  applyAgentChanges,
  askUserFromAgent,
  needsPassportReconfirm,
  createTripFromRequest,
  decideProposal,
  reopenAgentQuestion,
  reportReady,
  recordPassportUpload,
  startVisaRun,
  stopAgent,
  VISA_READY_MESSAGE,
  type Trip,
} from "@/lib/trip-state";

const now = new Date("2026-11-08T12:52:00Z");
const SECRETS = ["24AB12345", "1990-04-12"];
const ASK = { tool_name: "ask_user", args: { question: "Which email should receive your visa?", field: "email" }, id: "c1" };
const REPORT = { tool_name: "report_ready", args: { summary: "Stopped on payment", filled_fields: ["surname", "passport_number"] }, id: "c2" };

function changes(patch: Partial<AgentChanges>): AgentChanges {
  return { ...toAgentChanges(null, 0), no_change: false, status: "running", ...patch };
}

function liveTrip(passportFileReady = false): Trip {
  const request = TripRequestDraftSchema.parse({
    raw_text: "Je pars à Bali lundi",
    nationality: "FR",
    origin_country: "FR",
    destination: "Bali",
    country_iso2: "ID",
    departure_date: "2026-11-09",
    arrival_at: "2026-11-10T14:30+08:00",
    purpose: "tourism",
    travellers: 1,
  });
  let trip = createTripFromRequest("t1", request, now);
  trip = decideProposal(trip, trip.conversation.findLast((i) => i.kind === "proposal")!.id, true, now);
  const visa = trip.conversation.find((i) => i.kind === "proposal" && i.action === "create_visa");
  if (!visa) throw new Error("no create_visa proposal");
  // A real trip never fakes the agent: accepting without a session changes nothing.
  expect(decideProposal(trip, visa.id, true, now)).toBe(trip);
  return startVisaRun(trip, visa.id, "s-1", now, passportFileReady);
}

describe("real Bali trip", () => {
  it("records a successful upload once without any file metadata, but not failed uploads", () => {
    const call = { tool_name: "upload_file", args: { purpose: "passport" }, id: "upload-1" };
    const trip = liveTrip();
    const uploaded = recordPassportUpload(trip, call, "uploaded");
    expect(uploaded.agent_steps.at(-1)).toBe("Nami gave the passport to the agent");
    expect(recordPassportUpload(uploaded, call, "uploaded")).toBe(uploaded);
    expect(recordPassportUpload(trip, call, "no official tab").agent_steps).toEqual(trip.agent_steps);
  });
  it("proposes Create my visa and starts a live run", () => {
    const trip = liveTrip();
    expect(trip.agent_run).toMatchObject({ session_id: "s-1", state: "pending", next_index: 0, handled_tool_ids: [] });
    expect(trip.conversation.find((i) => i.kind === "proposal" && i.action === "create_visa")).toMatchObject({ decision: "accepted" });
    expect(trip.agent_steps).toEqual(["Session created on your local Chrome"]);
  });

  it("shows a path-free passport file activity line only when starting with a document", () => {
    expect(liveTrip(true).agent_steps).toEqual([
      "Session created on your local Chrome",
      "Passport file ready for the agent",
    ]);
  });
});

describe("applyAgentChanges", () => {
  it("validates and masks structured final fields without treating the answer as payment readiness", () => {
    const answer = JSON.stringify({ summary: "Typed 24AB12345", filled_fields: ["24AB12345"], missing_fields: ["1990-04-12"], blocked_reason: "24AB12345" });
    const { trip } = applyAgentChanges(liveTrip(), changes({ status: "completed", answer }), SECRETS);
    expect(trip.agent_run?.result).toMatchObject({ answer: "Typed •••••••45", final_answer: { summary: "Typed •••••••45" } });
    expect(JSON.stringify(trip)).not.toContain("24AB12345");
    expect(JSON.stringify(trip)).not.toContain("1990-04-12");
    expect(trip.agent_run?.result).not.toHaveProperty("summary");
    expect(trip.conversation.some((item) => item.kind === "agent" && item.text === VISA_READY_MESSAGE)).toBe(false);
  });

  it.each(["old plain answer", "{invalid", JSON.stringify({ summary: 42 })])("degrades safely for invalid final answer %s", (answer) => {
    const patch = changes({ status: "completed", answer });
    const { trip } = applyAgentChanges(liveTrip(), patch, SECRETS);
    expect(trip.agent_run?.result?.answer).toBe(INVALID_AGENT_ANSWER);
    expect(trip.conversation.at(-1)).toMatchObject({ kind: "agent", text: INVALID_AGENT_ANSWER });
    const again = applyAgentChanges(trip, patch, SECRETS).trip;
    expect(again.conversation).toHaveLength(trip.conversation.length);
  });

  it("waits for the settled answer before warning about an empty final response", () => {
    const { trip } = applyAgentChanges(liveTrip(), changes({ status: "completed" }), SECRETS);
    expect(trip.agent_run?.result?.answer).toBeUndefined();
    const drained = applyAgentChanges(trip, changes({ status: "completed", no_change: true }), SECRETS).trip;
    expect(drained.agent_run).toMatchObject({ drained: true, result: { answer: INVALID_AGENT_ANSWER } });
  });

  it("explains answer_validation even when the error code arrives after terminal status, only once", () => {
    let { trip } = applyAgentChanges(liveTrip(), changes({ status: "failed" }), SECRETS);
    const patch = changes({ status: "failed", error_code: "answer_validation" });
    ({ trip } = applyAgentChanges(trip, patch, SECRETS));
    expect(trip.conversation.at(-1)).toMatchObject({ text: INVALID_AGENT_ANSWER });
    expect(applyAgentChanges(trip, patch, SECRETS).trip.conversation).toHaveLength(trip.conversation.length);
  });

  it("adds masked steps, state, index and metrics", () => {
    const { trip } = applyAgentChanges(
      liveTrip(),
      changes({ next_index: 4, steps: ["Typed passport 24AB12345"], metrics: { steps: 4, total_cost: 0.01 } }),
      SECRETS,
    );
    expect(trip.agent_run).toMatchObject({ state: "running", next_index: 4, metrics: { steps: 4, total_cost: 0.01 }, drained: false });
    expect(trip.agent_steps.at(-1)).toBe("Typed passport •••••••45");
    expect(JSON.stringify(trip)).not.toContain("24AB12345");
  });

  it("keeps state and index on a 204", () => {
    let { trip } = applyAgentChanges(liveTrip(), changes({ next_index: 3 }), SECRETS);
    ({ trip } = applyAgentChanges(trip, toAgentChanges(null, 3), SECRETS));
    expect(trip.agent_run).toMatchObject({ state: "running", next_index: 3, drained: false });
  });

  it("keeps polling after the terminal state and takes the answer that arrives later", () => {
    let { trip } = applyAgentChanges(liveTrip(), changes({ status: "completed", next_index: 9, steps: ["Agent finished"] }), SECRETS);
    expect(trip.agent_run).toMatchObject({ state: "completed", drained: false });
    ({ trip } = applyAgentChanges(trip, changes({ status: "completed", next_index: 10, steps: [], answer: JSON.stringify({ summary: "Stopped before payment" }) }), SECRETS));
    expect(trip.agent_run?.result).toMatchObject({ answer: "Stopped before payment" });
    expect(trip.agent_run?.drained).toBe(false);
    ({ trip } = applyAgentChanges(trip, changes({ status: "completed", no_change: true, next_index: 10 }), SECRETS));
    expect(trip.agent_run?.drained).toBe(true);
  });

  it("ignores a pending tool call whose id was already handled", () => {
    let trip = liveTrip();
    const first = applyAgentChanges(trip, changes({ status: "awaiting_tool_results", pending_tool_calls: [ASK] }), SECRETS);
    expect(first.toolCalls).toEqual([ASK]);
    trip = askUserFromAgent(first.trip, ASK, SECRETS);
    const card = trip.conversation.findLast((i) => i.kind === "agent_question")!;
    trip = answerAgentQuestion(trip, card.id, "me@example.com");
    const again = applyAgentChanges(trip, changes({ status: "awaiting_tool_results", pending_tool_calls: [ASK] }), SECRETS);
    expect(again.toolCalls).toEqual([]);
  });

  it("says why the agent stopped when it fails", () => {
    const { trip } = applyAgentChanges(liveTrip(), changes({ status: "failed", error_code: "environment_error" }), SECRETS);
    expect(trip.conversation.at(-1)).toMatchObject({ kind: "agent", text: expect.stringContaining("environment_error") });
  });
});

describe("needsPassportReconfirm", () => {
  it("holds the live run until the passport is confirmed again", () => {
    const run = liveTrip().agent_run;
    expect(needsPassportReconfirm(run, false)).toBe(true);
    expect(needsPassportReconfirm(run, true)).toBe(false);
    expect(needsPassportReconfirm(run ? { ...run, drained: true } : null, false)).toBe(false);
    expect(needsPassportReconfirm(null, false)).toBe(false);
  });
});

describe("ask_user", () => {
  it("shows the question once and answers each call id once", () => {
    let trip = askUserFromAgent(liveTrip(), ASK, SECRETS);
    trip = askUserFromAgent(trip, ASK, SECRETS);
    const cards = trip.conversation.filter((i) => i.kind === "agent_question");
    expect(cards).toHaveLength(1);
    expect(trip.agent_run?.pending_question).toMatchObject({ tool_req: "c1", field: "email" });

    const answered = answerAgentQuestion(trip, cards[0].id, "me@example.com");
    expect(answered.agent_run?.handled_tool_ids).toEqual(["c1"]);
    expect(answered.agent_run?.pending_question).toBeUndefined();
    expect(answerAgentQuestion(answered, cards[0].id, "other@example.com")).toBe(answered);
    expect(askUserFromAgent(answered, ASK, SECRETS)).toBe(answered);
  });

  it("never stores the raw passport number in the saved tool call", () => {
    const call = { tool_name: "ask_user", args: { question: "Is 24AB12345 your passport number?", field: "passport" }, id: null };
    const trip = askUserFromAgent(liveTrip(), call, SECRETS);
    expect(JSON.stringify(trip)).not.toContain("24AB12345");
    const card = trip.conversation.findLast((i) => i.kind === "agent_question")!;
    expect(card.kind === "agent_question" && card.tool_req.id).toBe(toolCallKey(call));
    expect(trip.agent_run?.pending_question?.tool_req).toBe(toolCallKey(call));
    expect(askUserFromAgent(trip, call, SECRETS)).toBe(trip);
  });

  it("reopens the card when the answer could not be sent", () => {
    let trip = askUserFromAgent(liveTrip(), ASK, SECRETS);
    const card = trip.conversation.findLast((i) => i.kind === "agent_question")!;
    trip = reopenAgentQuestion(answerAgentQuestion(trip, card.id, "me@example.com"), card.id);
    expect(trip.conversation.find((i) => i.id === card.id)).toMatchObject({ answer: null });
    expect(trip.agent_run?.handled_tool_ids).toEqual([]);
  });

  it("stops the run and says why when the agent left the official site", () => {
    const { trip, toolCalls } = applyAgentChanges(
      liveTrip(),
      changes({ status: "awaiting_tool_results", pending_tool_calls: [ASK], left_official_site: "pay.example.com", cancel_failed: false }),
      SECRETS,
    );
    expect(toolCalls).toEqual([]);
    expect(trip.agent_run).toMatchObject({ state: "interrupted", drained: false });
    expect(trip.conversation.at(-1)).toMatchObject({ kind: "agent", text: "Agent stopped: it left the official site (pay.example.com)." });
  });

  it("after Stop agent, keeps polling until H confirms the session is stopped", () => {
    let trip = stopAgent(applyAgentChanges(liveTrip(), changes({ status: "running" }), SECRETS).trip);
    ({ trip } = applyAgentChanges(trip, changes({ status: "running", steps: ["Typing"] }), SECRETS));
    expect(trip.agent_run).toMatchObject({ state: "interrupted", drained: false });
    ({ trip } = applyAgentChanges(trip, toAgentChanges(null, 0), SECRETS));
    expect(trip.agent_run?.drained).toBe(false);
    ({ trip } = applyAgentChanges(trip, changes({ status: "interrupted" }), SECRETS));
    expect(trip.agent_steps.at(-1)).toBe("H confirmed the session is stopped");
    ({ trip } = applyAgentChanges(trip, changes({ status: "interrupted", no_change: true }), SECRETS));
    expect(trip.agent_run?.drained).toBe(true);
    expect(trip.agent_steps.filter((s) => s === "H confirmed the session is stopped")).toHaveLength(1);
    expect(trip.conversation.filter((i) => i.kind === "agent" && i.text.includes("Nothing was submitted"))).toHaveLength(1);
  });

  it("closes the open question when the agent is stopped", () => {
    let trip = askUserFromAgent(liveTrip(), ASK, SECRETS);
    trip = stopAgent(trip);
    expect(trip.conversation.find((i) => i.kind === "agent_question")).toMatchObject({ answer: "Agent stopped" });
    expect(trip.agent_run?.state).toBe("interrupted");
  });
});

describe("report_ready", () => {
  it("sets the e-VOA to pending approval and lists the filled fields, once", () => {
    const trip = reportReady(liveTrip(), REPORT, SECRETS);
    expect(trip.formalities.find((f) => f.id === "evoa")?.status).toBe("pending_approval");
    expect(trip.agent_run?.result).toMatchObject({ summary: "Stopped on payment", filled_fields: ["surname", "passport_number"] });
    expect(trip.agent_run).toMatchObject({ state: "interrupted", drained: true });
    expect(trip.agent_steps.at(-1)).toBe("Nami stopped the agent before anything was sent, so you can check and send it");
    expect(trip.conversation.at(-2)).toMatchObject({ kind: "agent", text: VISA_READY_MESSAGE, list: ["surname", "passport_number"] });
    // The arrival card comes next, once the visa is ready; the flights only after it.
    expect(trip.conversation.at(-1)).toMatchObject({ kind: "proposal", action: "create_arrival_card", decision: null });
    expect(trip.conversation.some((i) => i.kind === "proposal" && i.action === "flights")).toBe(false);
    expect(reportReady(trip, REPORT, SECRETS)).toBe(trip);

    const done = applyAgentChanges(trip, changes({ status: "completed" }), SECRETS).trip;
    expect(done.conversation.filter((i) => i.kind === "agent" && i.text === VISA_READY_MESSAGE)).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("freshToolCalls drops handled and duplicate calls", () => {
    expect(freshToolCalls([ASK, ASK, REPORT], ["c1"])).toEqual([REPORT]);
  });

  it("redact keeps the last 2 characters only", () => {
    expect(redact("n° 24AB12345, born 1990-04-12", SECRETS)).toBe("n° •••••••45, born ••••••••12");
    expect(redact("nothing", [null, undefined, ""])).toBe("nothing");
  });
});

describe("second paper: the arrival card after the visa", () => {
  it("starts an arrival card run from its proposal, then offers the flights once it is ready", () => {
    const afterVisa = reportReady(liveTrip(), REPORT, SECRETS);
    const card = afterVisa.conversation.at(-1)!;
    const started = startVisaRun(afterVisa, card.id, "s-2", now, true);
    expect(started.agent_run).toMatchObject({ session_id: "s-2", paper_id: "arrival_card", state: "pending" });
    expect(started.conversation.at(-1)).toMatchObject({ kind: "agent", text: expect.stringContaining("arrival card on allindonesia.imigrasi.go.id") });

    const ready = reportReady(started, { ...REPORT, id: "report-2" }, SECRETS);
    expect(ready.formalities.find((f) => f.id === "arrival_card")?.status).toBe("pending_approval");
    expect(ready.conversation.at(-2)).toMatchObject({ kind: "agent", text: ARRIVAL_CARD_READY_MESSAGE });
    expect(ready.conversation.at(-1)).toMatchObject({ kind: "proposal", action: "flights", decision: null });
  });

  it("offers the flights when the arrival card is declined", () => {
    const afterVisa = reportReady(liveTrip(), REPORT, SECRETS);
    const declined = decideProposal(afterVisa, afterVisa.conversation.at(-1)!.id, false, now);
    expect(declined.conversation.at(-1)).toMatchObject({ kind: "proposal", action: "flights" });
  });
});
