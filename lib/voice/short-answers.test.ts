import { describe, expect, it } from "vitest";
import { matchOption, normalize, shortAnswer, spokenEmail } from "@/lib/voice/short-answers";

const PURPOSE = [
  { label: "Holiday", value: "tourism" },
  { label: "Business", value: "business" },
  { label: "Family", value: "family" },
];

describe("matchOption", () => {
  it("picks the one button whose label was said", () => {
    expect(matchOption("Holiday", PURPOSE)?.value).toBe("tourism");
    expect(matchOption("It's for business.", PURPOSE)?.value).toBe("business");
    expect(matchOption("I don't know", [{ label: "Tue 10 Nov, 14:30" }, { label: "I don't know yet" }])?.label).toBe("I don't know yet");
    expect(matchOption("yes", [{ label: "Yes, French passport", value: "FR" }])?.value).toBe("FR");
  });

  it("ignores case and accents", () => {
    const options = [{ label: "Été" }, { label: "Hiver" }];
    expect(matchOption("ete", options)?.label).toBe("Été");
    expect(matchOption("HIVER", options)?.label).toBe("Hiver");
    expect(normalize("Vas-y, ÇA VA ?")).toBe("vas y ca va");
  });

  it("returns null when no label or several labels were said", () => {
    expect(matchOption("a wedding in Bali", PURPOSE)).toBeNull();
    expect(matchOption("business and family", PURPOSE)).toBeNull();
    expect(matchOption("", PURPOSE)).toBeNull();
    expect(matchOption("me", [{ label: "Just me" }])).toBeNull();
  });
});

describe("shortAnswer for a proposal", () => {
  it("accepts on oui, yes, ok, go, vas-y", () => {
    for (const said of ["oui", "Yes.", "OK", "Okay!", "go", "Vas-y", "oui oui", "ok, go"]) {
      expect(shortAnswer("proposal", said)).toBe("accept");
    }
  });

  it("declines on non, no, later, plus tard", () => {
    for (const said of ["non", "No.", "later", "Plus tard", "not now"]) {
      expect(shortAnswer("proposal", said)).toBe("decline");
    }
  });

  it("does not take a long sentence or a mix for a yes", () => {
    expect(shortAnswer("proposal", "yes but change the landing date first")).toBeNull();
    expect(shortAnswer("proposal", "ok ok ok ok ok")).toBeNull();
    expect(shortAnswer("proposal", "oui non")).toBeNull();
    expect(shortAnswer("proposal", "yesterday")).toBeNull();
    expect(shortAnswer("proposal", "")).toBeNull();
  });
});

describe("spokenEmail", () => {
  it("turns a dictated address into an e-mail", () => {
    expect(spokenEmail("Nathan dot Skwarek at gmail dot com.")).toBe("nathan.skwarek@gmail.com");
    expect(spokenEmail("nathan arobase exemple point fr")).toBe("nathan@exemple.fr");
    expect(spokenEmail("nathan@example.com")).toBe("nathan@example.com");
  });
});
