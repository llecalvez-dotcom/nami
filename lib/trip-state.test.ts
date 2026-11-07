import { describe, expect, it } from "vitest";
import { buildFlightsTask, buildPaperTask } from "@/lib/agent-task";
import { getBaliPaper } from "@/lib/bali-papers";
import { TripRequestDraftSchema } from "@/lib/contracts";
import {
  answerQuestion,
  answerQuestionWithText,
  createSampleTrip,
  createTripFromRequest,
  decideProposal,
  stopAgent,
  type Trip,
} from "@/lib/trip-state";

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

describe("parsed request flow", () => {
  const bali = TripRequestDraftSchema.parse({
    raw_text: "Je pars à Bali lundi",
    origin_country: "FR",
    destination: "Bali",
    country_iso2: "ID",
    departure_date: "2026-11-09",
    travellers: 1,
  });

  it("asks one question at a time, then proposes the papers with their windows", () => {
    let trip = createTripFromRequest("t1", bali, now);
    expect(trip.conversation.map((i) => i.kind)).toEqual(["user", "question"]);
    expect(open(trip, "question")).toMatchObject({ field: "nationality", answer: null });

    trip = answerQuestion(trip, open(trip, "question").id, "FR", "Yes, French passport");
    const landing = open(trip, "question");
    expect(landing).toMatchObject({ field: "arrival_at", question: "When do you land in Bali?" });
    expect(landing.kind === "question" && landing.options).toEqual([
      { label: "I don't know yet", value: "2026-11-10T00:00+08:00" },
    ]);

    trip = answerQuestionWithText(trip, landing.id, "Tuesday 14:30", { ...trip.request, arrival_at: "2026-11-10T14:30+08:00" });
    trip = answerQuestion(trip, open(trip, "question").id, "tourism", "Holiday");
    expect(trip.request.purpose).toBe("tourism");

    const proposal = open(trip, "proposal");
    expect(proposal).toMatchObject({ action: "papers", accept_label: "Prepare my entry papers" });
    expect(trip.modules.find((m) => m.module === "papers")?.state).toBe("suggested");

    trip = decideProposal(trip, proposal.id, true, now);
    expect(trip.formalities.find((f) => f.id === "arrival_card")).toMatchObject({
      opens_at: "2026-11-07T14:30+08:00",
      closes_at: "2026-11-10T14:30+08:00",
    });
    expect(trip.agent_run).toBeNull();
    expect(open(trip, "proposal")).toMatchObject({ action: "flights" });
  });

  it("asks again when the answer did not fill the field", () => {
    let trip = createTripFromRequest("t2", bali, now);
    trip = answerQuestionWithText(trip, open(trip, "question").id, "hmm", trip.request);
    expect(trip.conversation.at(-2)).toMatchObject({ kind: "agent", text: "Sorry, I didn't catch that." });
    expect(open(trip, "question")).toMatchObject({ field: "nationality", answer: null });
  });

  it("says nothing is needed for Barcelona and offers the flight", () => {
    const trip = createTripFromRequest(
      "t3",
      {
        ...bali,
        raw_text: "Barcelona on 3 March",
        destination: "Barcelona",
        country_iso2: "ES",
        departure_date: "2027-03-03",
        nationality: "FR",
        arrival_at: "2027-03-03T10:00+01:00",
        purpose: "tourism",
      },
      now,
    );
    expect(trip.modules.find((m) => m.module === "papers")?.state).toBe("none_needed");
    expect(trip.conversation.at(-2)).toMatchObject({ kind: "agent" });
    expect(open(trip, "proposal")).toMatchObject({ action: "flights" });
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

  it("handles delayed custom dropdowns and hands blocked fields to the human", () => {
    const task = buildPaperTask({
      officialUrl: "https://example.gov/form",
      formName: "Visa",
      domain: "example.gov",
      filePaths: [],
      forbiddenButtons: [],
      stopCondition: "Stop before payment.",
      traveller: "Nationality: France.",
      trip: "Purpose: tourism.",
    });
    expect(task).toContain("call pick_option with the label of the list and the value to pick, instead of clicking it");
    expect(task).toContain("use select_option only on native select elements");
    expect(task).toContain("Never attempt the same failed action more than 2 times");
    expect(task).toContain("After 2 failed attempts on the same field, stop trying and call ask_user with field set to that field");
    expect(task).toContain("asking the human to pick the required value themselves in Chrome");
    expect(task).toContain("Say which value to pick");
    expect(task).toContain("Wait for the human's answer before continuing, then take a fresh look and continue from the updated form");
    expect(task).toContain("upload the provided files (none)");
  });

  it("builds the flights task", () => {
    const task = buildFlightsTask({ origin: "Paris", destinationAirport: "DPS", departDate: "2026-11-09", arriveBefore: "18:00" });
    expect(task).toContain("from Paris to DPS departing 2026-11-09");
    expect(task).toContain("arriving before 18:00");
  });
});
