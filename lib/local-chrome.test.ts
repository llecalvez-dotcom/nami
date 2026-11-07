import { afterEach, describe, expect, it, vi } from "vitest";
import { cdpUrls, pickExpression, pickOption } from "./local-chrome";

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
