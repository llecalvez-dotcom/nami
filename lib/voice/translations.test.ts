import { describe, expect, it } from "vitest";
import { itemTexts, translateItem } from "@/lib/voice/translations";
import type { ConversationItem } from "@/lib/trip-state";

const proposal: ConversationItem = {
  id: "p1",
  kind: "proposal",
  action: "create_visa",
  text: "Shall I fill it in?",
  accept_label: "Create my visa",
  decline_label: "Not now",
  decision: null,
};

describe("conversation in the traveller's language", () => {
  it("lists every text Nami shows or reads for an item, never the traveller's own words", () => {
    expect(itemTexts(proposal)).toEqual(["Shall I fill it in?", "Create my visa", "Not now"]);
    expect(itemTexts({ id: "u", kind: "user", text: "Je pars à Bali" })).toEqual([]);
  });

  it("keeps English as it is, ids and decisions untouched", () => {
    expect(translateItem(proposal, "en")).toEqual(proposal);
  });

  it("holds an item back while its translation is on its way", () => {
    expect(translateItem(proposal, "fr")).toBeNull();
  });
});
