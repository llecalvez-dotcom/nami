import { describe, expect, it } from "vitest";
import { buildFlightsTask, buildPaperInstructions, buildPaperTask, UNTRUSTED_CONTENT_RULE } from "@/lib/agent-task";
import { getBaliPaper } from "@/lib/bali-papers";
import { TripRequestDraftSchema, TripRequestSchema } from "@/lib/contracts";
import type { FormalitiesResult } from "@/lib/formalities";
import { buildPilotTask, describeTraveller } from "@/lib/paper-agent";
import {
  answerQuestion,
  answerQuestionWithText,
  applyLivePapers,
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

  it("settles passport and departure country with one answer when both are unknown", () => {
    let trip = createTripFromRequest("t0", { ...bali, origin_country: null }, now);
    const question = open(trip, "question");
    expect(question).toMatchObject({ field: "nationality", question: "Do you travel with a French passport, leaving from France?" });
    expect(question.kind === "question" && question.options).toEqual([{ label: "Yes, French passport, from France", value: "FR" }]);
    trip = answerQuestion(trip, question.id, "FR", "Yes, French passport, from France");
    expect(trip.request).toMatchObject({ nationality: "FR", origin_country: "FR" });
    expect(open(trip, "question")).toMatchObject({ field: "arrival_at" });
  });

  it("asks nothing after the phrase for London once passport and departure are known, and checks the papers live", () => {
    const london = createTripFromRequest("t-london", { ...bali, destination: "London", country_iso2: "GB", nationality: "FR", purpose: "tourism", arrival_at: null }, now);
    expect(london.conversation.filter((i) => i.kind === "question")).toEqual([]);
    expect(london.request.arrival_at).toBeNull();
    expect(london.conversation.some((i) => i.kind === "agent" && i.text.includes("London"))).toBe(true);
  });

  it("asks one question at a time, then proposes the papers with their windows", () => {
    let trip = createTripFromRequest("t1", bali, now);
    expect(trip.conversation.map((i) => i.kind)).toEqual(["user", "question"]);
    expect(open(trip, "question")).toMatchObject({ field: "nationality", answer: null });

    trip = answerQuestion(trip, open(trip, "question").id, "FR", "Yes, French passport");
    const landing = open(trip, "question");
    // Nami proposes the landing rather than asking for it (Nathan, 2026-11-07).
    expect(landing).toMatchObject({ field: "arrival_at", question: expect.stringContaining("you land in Bali the next day, Tuesday 10 November, around 6 pm. Is that right?") });
    expect(landing.kind === "question" && landing.options).toEqual([
      { label: "Yes, that's right", value: "2026-11-10T18:00+08:00" },
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
    // The visa first: no flight proposal until the visa is ready.
    expect(open(trip, "proposal")).toMatchObject({ action: "create_visa" });
    expect(trip.conversation.some((i) => i.kind === "proposal" && i.action === "flights")).toBe(false);
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

  const london = (): Trip =>
    createTripFromRequest(
      "t4",
      {
        ...bali,
        raw_text: "London next Monday",
        destination: "London",
        country_iso2: "GB",
        departure_date: "2026-11-09",
        nationality: "FR",
        arrival_at: "2026-11-09T10:00+00:00",
        purpose: "tourism",
      },
      now,
    );

  const liveResult = (formalities: FormalitiesResult["formalities"], mode: FormalitiesResult["mode"] = "live"): FormalitiesResult => ({
    mode,
    destination: "London",
    country_iso2: "GB",
    country_name: "United Kingdom",
    checked_at: "2026-11-08T12:00:00.000Z",
    duration_ms: 1200,
    searched_domains: ["gov.uk"],
    formalities,
    sources: [],
    fillable: false,
    differs_from_last_check: false,
    missing_from_live: [],
    verified_by_hand_on: null,
    error: mode === "unavailable" ? "LINKUP_API_KEY is not set" : null,
    notice: "",
  });

  const eta: FormalitiesResult["formalities"][number] = {
    id: "live-1",
    name: "UK Electronic Travel Authorisation (ETA)",
    required: true,
    official_url: "https://www.gov.uk/guidance/apply-for-an-electronic-travel-authorisation-eta",
    official_cost: "GBP 16",
    opens_at: null,
    closes_at: null,
    sources: [{ url: "https://www.gov.uk/guidance/apply-for-an-electronic-travel-authorisation-eta", official: true }],
    status: "checked",
    checked_at: "2026-11-08T12:00:00.000Z",
    kind: "travel_authorization",
    window_note: "Apply before travel",
    link_official: true,
    link_replaced: false,
    found_on: "gov.uk",
    differs: [],
  };

  it("waits for the live papers for London before offering the flight", () => {
    const trip = london();
    expect(trip.papers_check).toBe("pending");
    expect(trip.conversation.at(-1)).toMatchObject({ kind: "agent", text: expect.stringContaining("London") });
    expect(trip.conversation.some((i) => i.kind === "proposal")).toBe(false);
    expect(trip.modules.some((m) => m.module === "flights")).toBe(false);
  });

  it("puts the live papers in the folder, says them once, then offers the flight", () => {
    const trip = applyLivePapers(london(), liveResult([eta]));
    expect(trip.papers_check).toBe("done");
    expect(trip.formalities).toHaveLength(1);
    expect(trip.formalities[0]).toMatchObject({ id: "live-1", official_url: eta.official_url, status: "checked" });
    expect(trip.conversation.at(-2)).toMatchObject({
      kind: "agent",
      text: expect.stringContaining("you need 1 entry paper"),
      list: [expect.stringContaining("gov.uk")],
    });
    expect(open(trip, "proposal")).toMatchObject({ action: "flights" });
    expect(applyLivePapers(trip, liveResult([eta]))).toBe(trip);
  });

  it("says nothing is needed when the live search finds no mandatory paper", () => {
    const trip = applyLivePapers(london(), liveResult([{ ...eta, required: false }]));
    expect(trip.modules.find((m) => m.module === "papers")?.state).toBe("none_needed");
    expect(trip.conversation.at(-2)).toMatchObject({ kind: "agent", text: expect.stringContaining("No mandatory entry paper") });
    expect(open(trip, "proposal")).toMatchObject({ action: "flights" });
  });

  it("says the check failed when the live search is unavailable", () => {
    const trip = applyLivePapers(london(), liveResult([], "unavailable"));
    expect(trip.papers_check).toBe("done");
    expect(trip.formalities).toHaveLength(0);
    expect(trip.conversation.at(-2)).toMatchObject({ kind: "agent", text: expect.stringContaining("could not check") });
    expect(applyLivePapers(london(), null).conversation.at(-2)).toMatchObject({ kind: "agent", text: expect.stringContaining("could not check") });
  });
});

describe("agent tasks", () => {
  it("always forbids final submit and payment", () => {
    const paper = getBaliPaper("evoa");
    const instructions = buildPaperInstructions({
      domain: paper.domain,
      forbiddenButtons: ["Proceed to payment"],
      stopCondition: paper.stop_condition,
    });
    for (const word of ["Proceed to payment", "Submit", "Pay", "Kirim", "Bayar", "Sign in", "Register"]) {
      expect(instructions).toContain(word);
    }
    expect(instructions).toContain("Never leave the domain evisa.imigrasi.go.id");
    expect(instructions).toContain(paper.stop_condition);
    expect(instructions).toContain(UNTRUSTED_CONTENT_RULE);
    expect(instructions).toContain("Never tick a final declaration on honour");
    expect(instructions).toContain("Never click or open the OS file picker");
    expect(instructions).toContain('call upload_file with purpose "passport", "photo" or "return_ticket"');
    expect(instructions).toContain("no return ticket means ask_user, not the passport");
    expect(instructions).toContain("never drop a word of a surname such as LE CALVEZ");
    expect(instructions).toContain("call fill_field with the label of the field and the value instead of typing it");
    expect(instructions).toContain("Nami has already checked that the page received the file, and the result says what to do next");
    expect(instructions).not.toContain("take a screenshot to verify that the page shows the file");
    expect(instructions).toContain("Never reload or refresh the e-VOA page, including with refresh_web: it erases filled fields.");
    expect(instructions).toContain("Only reload or refresh if the page is visibly broken.");
    expect(instructions).toContain("To look at the page again, call wait_web with 1 second: never refresh_web");
    expect(instructions).not.toContain("take a screenshot");
    expect(instructions).not.toContain("fresh look");
    expect(instructions).toContain("If a captcha, an account creation or an e-mail code appears, stop and call ask_user");
    expect(instructions).toContain("Do not invent any information");
    expect(instructions).toContain("call report_ready as your last action. After calling it the session ends. Do not take any further action.");
  });

  it("handles delayed custom dropdowns and hands blocked fields to the human", () => {
    const task = buildPaperInstructions({
      domain: "example.gov",
      forbiddenButtons: [],
      stopCondition: "Stop before payment.",
    });
    expect(task).toContain("call pick_option with the label of the list and the value to pick, instead of clicking it");
    expect(task).toContain("use select_option only on native select elements");
    expect(task).toContain("Never attempt the same failed action more than 2 times");
    expect(task).toContain("After 2 failed attempts on the same field, stop trying and call ask_user with field set to that field");
    expect(task).toContain("asking the human to pick the required value themselves in Chrome");
    expect(task).toContain("Say which value to pick");
    expect(task).toContain("Wait for the human's answer before continuing, then look at the page with wait_web (1 second) and continue from the updated form without reloading, refreshing or navigating");
    expect(task).toContain("If the result does not confirm a successful upload, call ask_user");
    expect(task).toContain("pick_option also works on a list that is not on screen: call it for the next list right away, without scrolling to it first");
  });

  it("keeps the per-session task focused on the traveller and trip with only a safety reminder", () => {
    const task = buildPaperTask({
      officialUrl: "https://example.gov/form", formName: "Visa", traveller: "Nationality: France.", trip: "Purpose: tourism.",
    });
    expect(task).toContain("Open https://example.gov/form in the current tab with go_to; do not look for or switch to another tab.");
    expect(task).toContain("Traveller: Nationality: France.");
    expect(task).toContain("Trip: Purpose: tourism.");
    expect(task).toContain("stop before final submission or payment");
    expect(task).not.toContain(UNTRUSTED_CONTENT_RULE);
    expect(task).not.toContain("Never click or open the OS file picker");
  });

  it("adds the route hint right after the first line of the task, and nothing without one", () => {
    const input = { officialUrl: "https://example.gov/form", formName: "Visa", traveller: "Nationality: France.", trip: "Purpose: tourism." };
    const lines = buildPaperTask({ ...input, routeHint: "Pick FRANCE, then Tourism." }).split("\n");
    expect(lines[0]).toContain("Open https://example.gov/form in the current tab");
    expect(lines[1]).toBe("Pick FRANCE, then Tourism.");
    expect(lines).toHaveLength(5);
    expect(buildPaperTask(input).split("\n")).toHaveLength(4);
  });

  it("passes the surname and given names read by Nami as they are, with the order to write every word (ticket 17)", () => {
    const passport = {
      surname: "LE CALVEZ", given_names: "JEAN MARIE", nationality: "FRA", birth_date: "1990-01-02",
      passport_number: "24AB12345", issue_date: "2020-01-01", expiry_date: "2030-01-01",
    };
    const traveller = describeTraveller(passport);
    expect(traveller).toContain("Surname (Last Name), to write exactly as given, every word, nothing removed: LE CALVEZ.");
    expect(traveller).toContain("Given names (First Name), to write exactly as given: JEAN MARIE.");
    const task = buildPilotTask({
      passport,
      request: TripRequestSchema.parse({
        raw_text: "Bali", destination: "Bali", country_iso2: "ID", nationality: "FR", purpose: "tourism", origin_country: "FR", departure_date: "2026-11-10",
        arrival_at: "2026-11-10T14:30+08:00", travellers: 1,
      }),
    });
    expect(task).toContain("LE CALVEZ");
    expect(task).toContain("Traveller: Surname (Last Name), to write exactly as given");
    expect(task).toContain("Last Name to every word of the passport surname (for example LE CALVEZ, not CALVEZ)");
    expect(task).toContain("write the Postal Code with fill_field");
    expect(task).toContain("Return Ticket is a required PDF: call upload_file with purpose return_ticket");
  });

  it("builds the flights task", () => {
    const task = buildFlightsTask({ origin: "Paris", destinationAirport: "DPS", departDate: "2026-11-09", arriveBefore: "18:00" });
    expect(task).toContain("from Paris to DPS departing 2026-11-09");
    expect(task).toContain("arriving before 18:00");
  });
});
