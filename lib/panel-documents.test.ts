import { describe, expect, it } from "vitest";
import type { DocumentExtraction } from "@/lib/contracts";
import { bestFirst, foundPassportText, foundPhotoText, readSummary } from "@/lib/panel-documents";
import { acceptProposal, createTripFromRequest, decideProposal, pushProposal, startVisaRun, type Trip } from "@/lib/trip-state";

const FIELDS = {
  surname: "MARTIN",
  given_names: "Camille",
  nationality: "FR",
  birth_date: "1990-04-12",
  passport_number: "24AB12345",
  issue_date: "2020-02-03",
  expiry_date: "2030-02-02",
};
const read = (patch: Partial<DocumentExtraction> = {}): DocumentExtraction => ({
  fields: FIELDS,
  confidence_per_field: {},
  mrz_verified: ["surname", "passport_number"],
  warnings: [],
  ...patch,
});

describe("spoken passport steps of the side panel", () => {
  it("offers the best-scored file first, and says who reads it", () => {
    const [first] = bestFirst([{ id: "a", name: "scan.jpg", score: 1 }, { id: "b", name: "passeport.jpg", score: 5 }]);
    expect(first.id).toBe("b");
    expect(foundPassportText(first, "h")).toBe(
      "I found your passport on this computer (passeport.jpg). Shall I read it? It is sent to H Company to be read, never stored.",
    );
    expect(foundPhotoText({ id: "p", name: "photo-identite.jpg", score: 3 })).toContain("ID photo (photo-identite.jpg)");
  });

  it("reads the name aloud but never the passport number nor the birth date", () => {
    const summary = readSummary(read());
    expect(summary.ok).toBe(true);
    expect(summary.text).toBe(
      "I read: MARTIN Camille, passport from France, valid until February 2030, and the machine-readable line matches. Is that right?",
    );
    expect(summary.text).not.toContain("24AB12345");
    expect(summary.text).not.toContain("1990");
  });

  it("asks for the card when a field is missing or the MRZ disagrees", () => {
    expect(readSummary(read({ fields: { ...FIELDS, passport_number: null } })).ok).toBe(false);
    const mrz = readSummary(read({ warnings: ["Surname: the printed value and the MRZ disagree or its check digit is invalid: check it."] }));
    expect(mrz.ok).toBe(false);
    expect(mrz.text).toContain("disagree");
  });

  it("keeps the expiry warning in the spoken check", () => {
    const summary = readSummary(read({ warnings: ["Your passport expires on 2030-02-02: less than 6 months after your return."] }));
    expect(summary.ok).toBe(true);
    expect(summary.text).toContain("Your passport expires on 2030-02-02");
  });
});

describe("visa first, flights after", () => {
  const now = new Date("2026-11-07T19:00:00Z");
  const bali = {
    raw_text: "Bali on Monday",
    nationality: "FR",
    origin_country: "FR",
    destination: "Bali",
    country_iso2: "ID",
    departure_date: "2026-11-09",
    arrival_at: "2026-11-10T14:30+08:00",
    return_date: "2026-11-20",
    purpose: "tourism",
    travellers: 1,
    status: "planning",
  } as Trip["request"];

  function visaProposal(): { trip: Trip; id: string } {
    let trip = createTripFromRequest("t-panel", bali, now);
    const papers = trip.conversation.find((i) => i.kind === "proposal" && i.action === "papers");
    trip = decideProposal(trip, papers!.id, true, now);
    const visa = trip.conversation.find((i) => i.kind === "proposal" && i.action === "create_visa");
    return { trip, id: visa!.id };
  }

  it("starts the agent on a visa proposal already accepted while the passport was looked for, once", () => {
    const { trip, id } = visaProposal();
    const accepted = acceptProposal(trip, id);
    const started = startVisaRun(accepted, id, "s-1", now, true);
    expect(started.agent_run?.session_id).toBe("s-1");
    expect(startVisaRun(started, id, "s-2", now, true)).toBe(started);
  });

  it("marks the spoken steps decided without any side effect", () => {
    const { trip } = visaProposal();
    const asked = pushProposal(trip, "read_passport", "Shall I read it?", "Yes, read it", "Not this one");
    const step = asked.conversation.at(-1)!;
    const decided = decideProposal(asked, step.id, true, now);
    expect(decided.conversation.at(-1)).toMatchObject({ kind: "proposal", action: "read_passport", decision: "accepted" });
    expect(decided.conversation).toHaveLength(asked.conversation.length);
  });
});
