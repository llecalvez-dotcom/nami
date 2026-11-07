import { afterEach, describe, expect, it, vi } from "vitest";
import { cdpUrls, pickExpression, pickOption } from "./local-chrome";
import { PICK_OPTION_TOOL, UPLOAD_FILE_TOOL } from "./paper-agent";

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

  it("gives screenshot-only guidance in both tool descriptions", () => {
    for (const tool of [PICK_OPTION_TOOL, UPLOAD_FILE_TOOL]) {
      expect(tool.description).toMatch(/do not reload or refresh the page or navigate away/i);
      expect(tool.description).toContain("take a screenshot");
      expect(tool.description).not.toContain("fresh look");
    }
  });

  const fakeSelect = (name: string, options: { text: string; value: string }[]) => ({
    name, id: "", disabled: false, value: "", options, getAttribute: () => null, closest: () => null, dispatchEvent: vi.fn(),
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
