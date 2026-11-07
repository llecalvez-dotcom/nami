import { describe, expect, it } from "vitest";
import { buildFlightsTask, buildPaperTask } from "@/lib/agent-task";
import { getBaliPaper } from "@/lib/bali-papers";
import { answerQuestion, createSampleTrip, decideProposal, stopAgent, type Trip } from "@/lib/trip-state";

const now = new Date("2026-11-08T12:52:00Z");

function open(trip: Trip, kind: "question" | "proposal") {
  const item = trip.conversation.findLast((i) => i.kind === kind);
  if (!item) throw new Error(`no ${kind}`);
  return item;
}

describe("sample flow", () => {
  it("goes from the request to the pre-filled visa", () => {
    let trip = createSampleTrip(now);
    const landing = open(trip, "question");
    trip = answerQuestion(trip, landing.id, "2026-11-10T14:30+08:00", "Tue 10 Nov, 14:30");
    expect(trip.request.arrival_at).toBe("2026-11-10T14:30+08:00");

    trip = decideProposal(trip, open(trip, "proposal").id, true, now);
    expect(trip.formalities).toHaveLength(3);

    trip = decideProposal(trip, open(trip, "proposal").id, true, now);
    expect(trip.agent_run?.state).toBe("awaiting_tool_results");

    trip = answerQuestion(trip, open(trip, "question").id, "me@example.com", "me@example.com");
    expect(trip.agent_run?.state).toBe("completed");
    expect(trip.formalities.find((f) => f.id === "evoa")?.status).toBe("pending_approval");
    expect(trip.modules.find((m) => m.module === "flights")?.state).toBe("suggested");
  });

  it("stops the agent", () => {
    let trip = createSampleTrip(now);
    trip = answerQuestion(trip, open(trip, "question").id, "2026-11-10T00:00+08:00", "I don't know yet");
    trip = decideProposal(trip, open(trip, "proposal").id, true, now);
    trip = decideProposal(trip, open(trip, "proposal").id, true, now);
    trip = stopAgent(trip);
    expect(trip.agent_run?.state).toBe("interrupted");
    expect(trip.formalities.every((f) => f.status === "suggested")).toBe(true);
  });

  it("ignores a second answer to the same card", () => {
    const trip = createSampleTrip(now);
    const id = open(trip, "question").id;
    const once = answerQuestion(trip, id, "2026-11-10T14:30+08:00", "Tue 10 Nov, 14:30");
    expect(answerQuestion(once, id, "2026-11-10T00:00+08:00", "I don't know yet")).toBe(once);
  });
});

describe("agent tasks", () => {
  it("always forbids final submit and payment", () => {
    const paper = getBaliPaper("evoa");
    const task = buildPaperTask({
      officialUrl: paper.official_url,
      formName: paper.name,
      domain: paper.domain,
      filePaths: [],
      forbiddenButtons: ["Proceed to payment"],
      stopCondition: paper.stop_condition,
      traveller: "…",
      trip: "…",
    });
    for (const word of ["Proceed to payment", "Submit", "Pay", "Kirim", "Bayar", "Sign in", "Register"]) {
      expect(task).toContain(word);
    }
    expect(task).toContain("Never leave the domain evisa.imigrasi.go.id");
    expect(task).toContain(paper.stop_condition);
  });

  it("builds the flights task", () => {
    const task = buildFlightsTask({ origin: "Paris", destinationAirport: "DPS", departDate: "2026-11-09", arriveBefore: "18:00" });
    expect(task).toContain("from Paris to DPS departing 2026-11-09");
    expect(task).toContain("arriving before 18:00");
  });
});
