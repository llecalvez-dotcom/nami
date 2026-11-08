import { describe, expect, it, vi } from "vitest";
import { openSearchTab } from "@/lib/agent-tab";

const URL_FLIGHTS = "https://www.google.com/travel/flights?q=Flights%20from%20Paris%20to%20Bali";

function chrome(targetInfos: { targetId: string; type: string; url: string }[]) {
  const send = vi.fn(async (method: string) => {
    if (method === "Target.getTargets") return { targetInfos };
    return method === "Target.attachToTarget" ? { sessionId: "tab-session" } : {};
  });
  const close = vi.fn();
  return { connect: vi.fn(async () => ({ send, close })), send, close };
}

describe("a search opens in its own tab", () => {
  it("opens the page in a new tab and leaves the visa tab alone", async () => {
    const { connect, send, close } = chrome([{ targetId: "visa", type: "page", url: "https://evisa.imigrasi.go.id/step_1" }]);
    await openSearchTab(URL_FLIGHTS, connect, 9333);
    expect(send).toHaveBeenCalledWith("Target.createTarget", { url: URL_FLIGHTS });
    expect(send.mock.calls.some(([method]) => method === "Page.navigate")).toBe(false);
    expect(close).toHaveBeenCalled();
  });

  it("uses a blank tab instead of piling them up", async () => {
    const { connect, send } = chrome([
      { targetId: "visa", type: "page", url: "https://evisa.imigrasi.go.id/step_1" },
      { targetId: "blank", type: "page", url: "about:blank" },
    ]);
    await openSearchTab(URL_FLIGHTS, connect, 9333);
    expect(send).toHaveBeenCalledWith("Target.activateTarget", { targetId: "blank" });
    expect(send).toHaveBeenCalledWith("Page.navigate", { url: URL_FLIGHTS }, "tab-session");
    expect(send).not.toHaveBeenCalledWith("Target.createTarget", expect.anything());
  });

  it("reuses the tab of an earlier try of the same search, not the tab of another search", async () => {
    const hotels = chrome([{ targetId: "hotels", type: "page", url: "https://www.google.com/travel/search?q=hotels" }]);
    await openSearchTab(URL_FLIGHTS, hotels.connect, 9333);
    expect(hotels.send).toHaveBeenCalledWith("Target.createTarget", { url: URL_FLIGHTS });

    const again = chrome([{ targetId: "flights", type: "page", url: "https://www.google.com/travel/flights/booking?tfs=abc" }]);
    await openSearchTab(URL_FLIGHTS, again.connect, 9333);
    expect(again.send).toHaveBeenCalledWith("Target.activateTarget", { targetId: "flights" });
    expect(again.send).toHaveBeenCalledWith("Page.navigate", { url: URL_FLIGHTS }, "tab-session");
  });

  it("does not take the extension's panel for a blank tab", async () => {
    const { connect, send } = chrome([{ targetId: "panel", type: "page", url: "chrome-extension://abc/panel.html" }]);
    await openSearchTab(URL_FLIGHTS, connect, 9333);
    expect(send).toHaveBeenCalledWith("Target.createTarget", { url: URL_FLIGHTS });
  });

  it("never stops the search when Chrome does not answer", async () => {
    await expect(openSearchTab(URL_FLIGHTS, vi.fn(async () => { throw new Error("no chrome"); }), 9333)).resolves.toBeUndefined();
    const connect = vi.fn();
    await openSearchTab(URL_FLIGHTS, connect, null);
    expect(connect).not.toHaveBeenCalled();
  });
});
