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

  it("gives screenshot-only guidance in both tool descriptions", () => {
    for (const tool of [PICK_OPTION_TOOL, UPLOAD_FILE_TOOL]) {
      expect(tool.description).toMatch(/do not reload or refresh the page or navigate away/i);
      expect(tool.description).toContain("take a screenshot");
      expect(tool.description).not.toContain("fresh look");
    }
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
