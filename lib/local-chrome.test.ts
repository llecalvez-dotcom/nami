import { afterEach, describe, expect, it, vi } from "vitest";
import { NOT_ON_OFFICIAL_SITE, cdpUrls, fillExpression, fillField, guardedExpression, pickExpression, pickOption } from "./local-chrome";
import { FILL_FIELD_TOOL, PICK_OPTION_TOOL, UPLOAD_FILE_TOOL } from "./paper-agent";

class FakeSocket {
  static sent: string[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onerror?: () => void;
  constructor(public url: string) {
    setTimeout(() => this.onopen?.(), 0);
  }
  send(data: string) {
    FakeSocket.sent.push(data);
    setTimeout(() => this.onmessage?.({ data: JSON.stringify({ id: 1, result: { result: { value: "Picked FRANCE in selectCountry." } } }) }), 0);
  }
  close() {}
}

afterEach(() => vi.unstubAllGlobals());

const fakeSelect = (name: string, options: { text: string; value: string }[]) => ({
  name, id: "", disabled: false, value: "", options, getAttribute: () => null, closest: () => null, dispatchEvent: vi.fn(),
});


// A field in its Bootstrap block, as on the e-VOA: the label is a sibling of the column holding the field, its
// "for" points elsewhere, and the column's first text is the Select2 placeholder.
type FakeNode = { parentElement: FakeNode | null; classes: string[]; label?: { textContent: string }; innerText?: string;
  querySelector: (selector: string) => { textContent: string } | null; matches: (selector: string) => boolean; closest: (selector: string) => FakeNode | null };
const fakeBlock = (labelText: string, columnText: string) => {
  const node = (classes: string[], parent: FakeNode | null, label?: { textContent: string }, innerText?: string): FakeNode => {
    const self: FakeNode = {
      parentElement: parent, classes, label, innerText,
      querySelector: (selector) => selector === "label" ? label ?? parent?.querySelector(selector) ?? null : null,
      matches: (selector) => selector.split(",").some((s) => classes.includes(s.trim().replace(/^\./, ""))),
      closest: (selector) => {
        let current: FakeNode | null = self;
        while (current && !current.matches(selector)) current = current.parentElement;
        return current;
      },
    };
    return self;
  };
  const group = node(["form-group", "row", "pb-4"], null, { textContent: labelText }, `${labelText}\n${columnText}`);
  group.querySelector = (selector) => selector === "label" ? { textContent: labelText } : null;
  const column = node(["col-sm-6"], group, undefined, columnText);
  column.querySelector = () => null;
  return column;
};
const fieldInBlock = <T extends object>(element: T, labelText: string, columnText: string) => {
  const column = fakeBlock(labelText, columnText);
  return Object.assign(element, { parentElement: column, closest: (selector: string) => column.closest(selector) });
};
const evoaArrivalBlock = () => {
  const portMode = { select: fieldInBlock(fakeSelect("port_mode", [{ text: "--- Choose ---", value: "" }, { text: "Airport", value: "airport" }, { text: "Seaport", value: "seaport" }]), "Port of Entry Mode *", "--- Choose ---") };
  const airport = { select: fieldInBlock(fakeSelect("airport_id", [{ text: "--- Choose ---", value: "" }, { text: "NGURAH RAI AIRPORT", value: "51" }]), "Port of Entry *", "--- Choose ---") };
  Object.assign(portMode.select, { id: "port_mode" });
  Object.assign(airport.select, { id: "airport_id" });
  return { portMode, airport };
};


describe("pickOption", () => {
  it("returns screenshot-only guidance from the actual selection expression without resetting the selection", () => {
    const select = { name: "selectCountry", disabled: false, value: "", options: [{ text: "FRANCE", value: "FR" }],
      getAttribute: () => null, closest: () => null, dispatchEvent: vi.fn() };
    vi.stubGlobal("document", { querySelectorAll: () => [select] });
    vi.stubGlobal("window", {});
    const result = eval(pickExpression("selectCountry", "FRANCE"));
    expect(result).toBe("Picked FRANCE in selectCountry. The page already shows it. Do not reload or refresh the page or navigate away; take a screenshot and continue with the next field.");
    expect(select.value).toBe("FR");
    expect(select.dispatchEvent.mock.calls.map(([event]) => event.type)).toEqual(["input", "change"]);
  });

  it("triggers change and Select2's selection event when jQuery is available", () => {
    const select = { name: "selectCountry", disabled: false, value: "", options: [{ text: "FRANCE", value: "FR" }],
      getAttribute: () => null, closest: () => null, dispatchEvent: vi.fn() };
    const events: unknown[] = [];
    const jquery = (target: typeof select) => ({
      val: (value: string) => {
        target.value = value;
        return { trigger: (event: unknown) => events.push(event) };
      },
      trigger: (event: unknown) => events.push(event),
    });
    vi.stubGlobal("document", { querySelectorAll: () => [select] });
    vi.stubGlobal("window", { jQuery: jquery });
    eval(pickExpression("selectCountry", "FRANCE"));
    expect(select.value).toBe("FR");
    expect(events[0]).toBe("change");
    expect(events[1]).toMatchObject({ type: "select2:select", params: { data: { id: "FR" } } });
  });

  it("gives screenshot-only guidance in the tool descriptions", () => {
    for (const tool of [PICK_OPTION_TOOL, UPLOAD_FILE_TOOL, FILL_FIELD_TOOL]) {
      expect(tool.description).toMatch(/do not reload or refresh the page or navigate away/i);
      expect(tool.description).toContain("take a screenshot");
      expect(tool.description).not.toContain("fresh look");
    }
  });

  it("prefers an exact label over a longer label containing the field name", () => {
    const portMode = { ...fakeSelect("port_mode", [{ text: "Airport", value: "airport" }, { text: "Seaport", value: "seaport" }]), labels: [{ innerText: "Port of Entry Mode" }] };
    const airport = { ...fakeSelect("airport_id", [{ text: "NGURAH RAI AIRPORT", value: "airport-id" }]), labels: [{ innerText: "Port of Entry" }] };
    vi.stubGlobal("document", { querySelectorAll: () => [portMode, airport] });
    vi.stubGlobal("window", {});
    expect(eval(pickExpression("Port of Entry", "Ngurah Rai"))).toContain("Picked NGURAH RAI AIRPORT in airport_id.");
    expect(portMode.value).toBe("");
    expect(airport.value).toBe("airport-id");
    expect(eval(pickExpression("Port of Entry", "Denpasar"))).toBe(
      "No list has an option matching Denpasar. Options of airport_id: NGURAH RAI AIRPORT. Call pick_option again with the closest one.",
    );
  });

  it("finds the label in the field's block when the label's for attribute is wrong, without the asterisk (e-VOA step 2)", () => {
    // <div class="form-group row"><label for="staticEmail">Port of Entry <span>*</span></label><div class="col-sm-6"><select id="airport_id">
    const { airport, portMode } = evoaArrivalBlock();
    vi.stubGlobal("document", { querySelectorAll: () => [portMode.select, airport.select] });
    vi.stubGlobal("window", {});
    expect(eval(pickExpression("Port of Entry", "NGURAH RAI AIRPORT"))).toContain("Picked NGURAH RAI AIRPORT in airport_id.");
    expect(portMode.select.value).toBe("");
    expect(airport.select.value).toBe("51");
    expect(eval(pickExpression("Port of Entry Mode", "Airport"))).toContain("Picked Airport in port_mode.");
    expect(portMode.select.value).toBe("airport");
  });

  it("lists the options of the targeted list when none matches, at most 30", () => {
    const activities = fakeSelect("selectParentActivity", [
      { text: "Select", value: "" },
      { text: "General,  Family, or Social", value: "1" },
      ...Array.from({ length: 40 }, (_, i) => ({ text: `Activity ${i + 1}`, value: `a${i + 1}` })),
    ]);
    vi.stubGlobal("document", { querySelectorAll: () => [fakeSelect("selectCountry", [{ text: "FRANCE", value: "FR" }]), activities] });
    vi.stubGlobal("window", {});
    const result: string = eval(pickExpression("selectParentActivity", "Tourism"));
    const listed = ["General, Family, or Social", ...Array.from({ length: 29 }, (_, i) => `Activity ${i + 1}`)].join(", ");
    expect(result).toBe(`No list has an option matching Tourism. Options of selectParentActivity: ${listed}. Call pick_option again with the closest one.`);
    expect(result).not.toContain("Activity 30");
    expect(result).not.toContain("Select,");
    expect(activities.value).toBe("");
    expect(activities.dispatchEvent).not.toHaveBeenCalled();
  });

  it("lists the lists of the page when no list has the label nor the option", () => {
    vi.stubGlobal("document", { querySelectorAll: () => [fakeSelect("selectCountry", [{ text: "FRANCE", value: "FR" }])] });
    vi.stubGlobal("window", {});
    expect(eval(pickExpression("Purpose", "Tourism"))).toBe(
      "No list has an option matching Tourism. No list is labelled Purpose; lists on this page: selectCountry. Call pick_option again with one of them.",
    );
  });

  it("evaluates the pick in the official tab only", async () => {
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [
      { type: "page", url: "https://evil.example/evisa.imigrasi.go.id", webSocketDebuggerUrl: "ws://evil" },
      { type: "page", url: "https://evisa.imigrasi.go.id/web/visa-selection", webSocketDebuggerUrl: "ws://official" },
    ] }));
    await expect(pickOption("Passport/Country/Region", "France", ["evisa.imigrasi.go.id"])).resolves.toBe("Picked FRANCE in selectCountry.");
    expect(JSON.parse(FakeSocket.sent[0]).params.expression).toContain('"France"');
  });

  it("says so when the official site is not open", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [{ type: "page", url: "chrome://newtab/", webSocketDebuggerUrl: "ws://x" }] }));
    await expect(pickOption("a", "b", ["evisa.imigrasi.go.id"])).resolves.toBe("The official site is not open in Chrome.");
  });

  it("tries the next DevTools port when one does not answer", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error("refused")).mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetch);
    await expect(pickOption("a", "b", ["evisa.imigrasi.go.id"], ["http://127.0.0.1:9333", "http://127.0.0.1:9222"])).resolves.toBe(
      "The official site is not open in Chrome.",
    );
    expect(fetch).toHaveBeenLastCalledWith("http://127.0.0.1:9222/json");
  });

  it("uses only the shared configured port, defaulting to 9222", () => {
    expect(cdpUrls({ NAMI_AGENT_CHROME_PORT: "9444" })).toEqual(["http://127.0.0.1:9444"]);
    expect(cdpUrls({})).toEqual(["http://127.0.0.1:9222"]);
    expect(cdpUrls({ NAMI_AGENT_CHROME_PORT: "99999" })).toEqual([]);
  });

  it("escapes the values injected in the page", () => {
    expect(pickExpression('x")', "y")).toContain('"x\\")"');
  });
});

describe("fillField", () => {
  const fakeInput = (id: string, label: string, extra: Record<string, unknown> = {}) => fieldInBlock({
    tagName: "INPUT", type: "text", id, name: id, value: "", disabled: false, readOnly: false, isConnected: true,
    getAttribute: () => null, focus: vi.fn(), dispatchEvent: vi.fn(), ...extra,
  }, label, "");

  it("writes the value, fires input, change and keyup, and reports the fields the page filled", async () => {
    const postal = fakeInput("postal_code", "Postal Code *");
    const province = fakeInput("province", "Province *");
    const city = fakeInput("city", "City *");
    // The page's keyup handler (the e-VOA postal lookup) fills the dependent fields.
    postal.dispatchEvent = vi.fn((event: { type: string }) => {
      if (event.type === "keyup") {
        province.value = "BALI";
        city.value = "KABUPATEN BADUNG";
      }
      return true;
    });
    vi.stubGlobal("document", { querySelectorAll: () => [postal, province, city] });
    vi.stubGlobal("window", {});
    vi.stubGlobal("KeyboardEvent", Event);
    const result = await eval(fillExpression("Postal Code", "80361", 0));
    expect(postal.value).toBe("80361");
    expect(postal.dispatchEvent.mock.calls.map(([event]) => (event as { type: string }).type)).toEqual(["input", "change", "keyup"]);
    expect(result).toBe("Filled postal code with 80361. The page then filled: province: BALI; city: KABUPATEN BADUNG. Do not reload or refresh the page or navigate away; take a screenshot and continue with the next field.");
  });

  it("goes through jQuery when the page has it, keyup included", async () => {
    const postal = fakeInput("postal_code", "Postal Code *");
    const events: unknown[] = [];
    const chain = { trigger: (event: unknown) => { events.push(event); return chain; } };
    const jquery = (target: typeof postal) => ({ val: (value: string) => { target.value = value; return chain; } });
    vi.stubGlobal("document", { querySelectorAll: () => [postal] });
    vi.stubGlobal("window", { jQuery: jquery });
    await eval(fillExpression("Postal Code", "80361", 0));
    expect(postal.value).toBe("80361");
    expect(events).toEqual(["input", "change", "keyup"]);
    expect(postal.dispatchEvent).not.toHaveBeenCalled();
  });

  it("waits for the dependent fields before reporting", async () => {
    vi.useFakeTimers();
    try {
      const postal = fakeInput("postal_code", "Postal Code *");
      const province = fakeInput("province", "Province *");
      vi.stubGlobal("document", { querySelectorAll: () => [postal, province] });
      vi.stubGlobal("window", {});
      vi.stubGlobal("KeyboardEvent", Event);
      const pending: Promise<string> = eval(fillExpression("Postal Code", "80361", 2500));
      province.value = "BALI";
      await vi.advanceTimersByTimeAsync(2500);
      expect(await pending).toContain("The page then filled: province: BALI.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never touches hidden, file, checkbox or button inputs, and lists the text fields when the label is unknown", async () => {
    const hidden = fakeInput("token", "Token", { type: "hidden" });
    const file = fakeInput("return_ticket", "Return Ticket *", { type: "file" });
    const postal = fakeInput("postal_code", "Postal Code *");
    vi.stubGlobal("document", { querySelectorAll: () => [hidden, file, postal] });
    vi.stubGlobal("window", {});
    vi.stubGlobal("KeyboardEvent", Event);
    expect(await eval(fillExpression("Token", "x", 0))).toBe("No field is labelled Token; fields on this page: postal code. Call fill_field again with one of them, or type the value yourself.");
    expect(await eval(fillExpression("Return Ticket", "x", 0))).toContain("No field is labelled Return Ticket");
    expect(hidden.value).toBe("");
    expect(file.value).toBe("");
  });

  it("fills in the official tab only and awaits the page's answer", async () => {
    class FillSocket extends FakeSocket {
      send(data: string) {
        FakeSocket.sent.push(data);
        setTimeout(() => this.onmessage?.({ data: JSON.stringify({ id: 1, result: { result: { value: "Filled postal code with 80361." } } }) }), 0);
      }
    }
    FakeSocket.sent = [];
    vi.stubGlobal("WebSocket", FillSocket);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [
      { type: "page", url: "https://evisa.imigrasi.go.id.evil.example/", webSocketDebuggerUrl: "ws://evil" },
      { type: "page", url: "https://evisa.imigrasi.go.id/web/apply", webSocketDebuggerUrl: "ws://official" },
    ] }));
    await expect(fillField("Postal Code", "80361", ["evisa.imigrasi.go.id"])).resolves.toBe("Filled postal code with 80361.");
    const sent = JSON.parse(FakeSocket.sent[0]);
    expect(sent.params.awaitPromise).toBe(true);
    expect(sent.params.expression).toContain('"80361"');
  });

  it("refuses when no official tab is open, without evaluating anything", async () => {
    FakeSocket.sent = [];
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [
      { type: "page", url: "https://evisa-imigrasi.example/", webSocketDebuggerUrl: "ws://lookalike" },
    ] }));
    await expect(fillField("Postal Code", "80361", ["evisa.imigrasi.go.id"])).resolves.toBe("The official site is not open in Chrome.");
    expect(FakeSocket.sent).toEqual([]);
  });

  it("escapes the values injected in the page", () => {
    expect(fillExpression('x")', 'y"', 0)).toContain('"x\\")", "y\\""');
  });

  // The tab was official when chosen; it may have navigated since. The page checks its own hostname before acting.
  it("checks the page's hostname again inside the page, pick and fill alike", async () => {
    const run = (expression: string, hostname: string, protocol = "https:") =>
      new Function("location", `return ${expression}`)({ hostname, protocol });
    const guarded = guardedExpression('"acted"', ["evisa.imigrasi.go.id"]);
    expect(run(guarded, "evisa.imigrasi.go.id")).toBe("acted");
    expect(run(guarded, "www.evisa.imigrasi.go.id")).toBe("acted");
    expect(run(guarded, "evisa.imigrasi.go.id.evil.example")).toBe(NOT_ON_OFFICIAL_SITE);
    expect(run(guarded, "evil.example")).toBe(NOT_ON_OFFICIAL_SITE);
    expect(run(guarded, "evisa.imigrasi.go.id", "file:")).toBe(NOT_ON_OFFICIAL_SITE);
    FakeSocket.sent = [];
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [
      { type: "page", url: "https://evisa.imigrasi.go.id/web/apply", webSocketDebuggerUrl: "ws://official" },
    ] }));
    await fillField("Postal Code", "80361", ["evisa.imigrasi.go.id"]);
    await pickOption("Port of Entry", "NGURAH RAI AIRPORT", ["evisa.imigrasi.go.id"]);
    for (const sent of FakeSocket.sent) {
      expect(JSON.parse(sent).params.expression).toContain('["evisa.imigrasi.go.id"]');
      expect(JSON.parse(sent).params.expression).toContain("location.hostname");
    }
  });
});
