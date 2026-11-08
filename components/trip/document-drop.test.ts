import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentDrop, DROP_TEXTS } from "@/components/trip/document-drop";

const drop = (kind: "passport" | "photo" | "return_ticket", t?: (text: string) => string) =>
  renderToStaticMarkup(createElement(DocumentDrop, { kind, onUploaded: () => {}, t }));

describe("the upload zone", () => {
  it("offers to drop a file or choose one, with the formats of its kind", () => {
    const passport = drop("passport");
    expect(passport).toContain("Drop the file here");
    expect(passport).toContain("Choose a file");
    expect(passport).toContain("JPEG, PNG or HEIC, 5 MB max.");
    expect(passport).toContain('accept=".jpg,.jpeg,.png,.heic,image/jpeg,image/png,image/heic"');
    expect(drop("photo")).toContain('accept=".jpg,.jpeg,.png,.heic,image/jpeg,image/png,image/heic"');
    expect(drop("return_ticket")).toContain('accept=".pdf,application/pdf"');
    expect(drop("return_ticket")).toContain("Your return ticket as a PDF, 10 MB max.");
  });

  it("speaks the traveller's language through the panel's translations", () => {
    expect(drop("photo", (text) => text.toUpperCase())).toContain("CHOOSE A FILE");
  });

  it("has no dash in its texts", () => {
    expect(DROP_TEXTS.join(" ")).not.toMatch(/[–—]/);
  });
});
