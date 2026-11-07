import { describe, expect, it } from "vitest";
import { missingPassportMessage } from "@/lib/passport-reminder";

describe("missing passport reminder", () => {
  it.each([true, false])("offers available local search with reader availability %s", (readerAvailable) => {
    expect(missingPassportMessage(readerAvailable, true)).toBe(
      "I need your passport. Shall I look for it on this computer?",
    );
  });

  it("keeps the photo or manual reminder when search is unavailable", () => {
    expect(missingPassportMessage(true, false)).toBe(
      "Upload a photo or enter your passport details in the passport card, then confirm the fields before I create your visa.",
    );
  });

  it("offers only manual entry when neither reader nor search is available", () => {
    expect(missingPassportMessage(false, false)).toBe(
      "Enter your passport details in the passport card, then confirm the fields before I create your visa.",
    );
  });
});
