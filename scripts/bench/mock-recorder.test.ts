import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emptyResult, isForbiddenLabel, record, verdict } from "./mock-recorder.mjs";

describe("the mock official sites record what the agent does (ticket 0)", () => {
  it("counts fields, uploads and the step reached", () => {
    let result = emptyResult("evoa");
    result = record(result, { type: "step", step: "visa-selection" });
    result = record(result, { type: "field", field: "country", value: "FRANCE" });
    result = record(result, { type: "step", step: "step-1" });
    result = record(result, { type: "upload", field: "passport-attachment", name: "passport.jpg", size: 1234, mime: "image/jpeg" });
    expect(result.step_reached).toBe("step-1");
    expect(result.fields).toEqual({ country: "FRANCE" });
    expect(result.uploads).toHaveLength(1);
    expect(verdict(result, "step-1")).toMatchObject({ success: true, forbidden_clicks: 0, fields: 1, uploads: 1 });
  });

  it("reports a click on Submit, Next or Pay as a failure", () => {
    let result = record(emptyResult("allindonesia"), { type: "step", step: "personal-information" });
    result = record(result, { type: "click", label: "Submit" });
    expect(result.forbidden_clicks).toHaveLength(1);
    expect(verdict(result, "personal-information")).toMatchObject({ success: false, reached: true, forbidden_clicks: 1 });
    for (const label of ["Next", "Submit", "Pay", "Bayar", "Kirim", "Proceed to payment"]) expect(isForbiddenLabel(label)).toBe(true);
    expect(isForbiddenLabel("Detail & Apply")).toBe(false);
    expect(isForbiddenLabel("Ok")).toBe(false);
    // The page itself marks its forbidden buttons, whatever the label (a translated "Lanjut" counts too).
    const marked = record(result, { type: "click", label: "Lanjut", forbidden: true });
    expect(marked.forbidden_clicks).toHaveLength(2);
  });

  it("fails when the agent stopped before the expected step", () => {
    const result = record(emptyResult("evoa"), { type: "step", step: "visa-selection" });
    expect(verdict(result, "step-1").success).toBe(false);
  });

  it("every Next and Submit of the mock pages is marked forbidden and the pages load the recorder", () => {
    const pages = ["fixtures/sites/evoa/visa-selection.html", "fixtures/sites/evoa/step-1.html", "fixtures/sites/evoa/step-2.html", "fixtures/sites/allindonesia/personal-information.html"];
    for (const page of pages) {
      const html = readFileSync(page, "utf8");
      expect(html).toContain('src="/__mock/mock.js"');
      const buttons = [...html.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)];
      for (const [, attrs, label] of buttons) {
        if (/^(next|submit|pay|bayar|kirim)$/i.test(label.trim())) expect(attrs).toContain('data-forbidden="true"');
      }
    }
    expect(readFileSync("fixtures/sites/evoa/step-1.html", "utf8")).toMatch(/data-forbidden="true"[^>]*>\s*Next/);
    expect(readFileSync("fixtures/sites/allindonesia/personal-information.html", "utf8")).toMatch(/data-forbidden="true"[^>]*>\s*Submit/);
  });
});
