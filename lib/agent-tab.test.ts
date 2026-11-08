import { describe, expect, it, vi } from "vitest";
import { ensureBlankAgentTab } from "@/lib/agent-tab";

function chrome(targetInfos: { targetId: string; type: string; url: string }[]) {
  const send = vi.fn(async (method: string) => (method === "Target.getTargets" ? { targetInfos } : {}));
  const close = vi.fn();
  return { connect: vi.fn(async () => ({ send, close })), send, close };
}

describe("a search gets its own tab", () => {
  it("opens a blank tab and leaves the visa tab alone", async () => {
    const { connect, send, close } = chrome([{ targetId: "visa", type: "page", url: "https://evisa.imigrasi.go.id/step_1" }]);
    await ensureBlankAgentTab(connect, 9333);
    expect(send).toHaveBeenCalledWith("Target.createTarget", { url: "about:blank" });
    expect(send.mock.calls.some(([method]) => method === "Page.navigate")).toBe(false);
    expect(close).toHaveBeenCalled();
  });

  it("reuses a blank tab instead of piling them up after a retry", async () => {
    const { connect, send } = chrome([
      { targetId: "visa", type: "page", url: "https://evisa.imigrasi.go.id/step_1" },
      { targetId: "blank", type: "page", url: "about:blank" },
    ]);
    await ensureBlankAgentTab(connect, 9333);
    expect(send).toHaveBeenCalledWith("Target.activateTarget", { targetId: "blank" });
    expect(send).not.toHaveBeenCalledWith("Target.createTarget", expect.anything());
  });

  it("does not take the extension's panel for a blank tab", async () => {
    const { connect, send } = chrome([{ targetId: "panel", type: "page", url: "chrome-extension://abc/panel.html" }]);
    await ensureBlankAgentTab(connect, 9333);
    expect(send).toHaveBeenCalledWith("Target.createTarget", { url: "about:blank" });
  });

  it("never stops the search when Chrome does not answer", async () => {
    await expect(ensureBlankAgentTab(vi.fn(async () => { throw new Error("no chrome"); }), 9333)).resolves.toBeUndefined();
    const connect = vi.fn();
    await ensureBlankAgentTab(connect, null);
    expect(connect).not.toHaveBeenCalled();
  });
});
