import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const relaySource = readFileSync(new URL("./agent-state.js", import.meta.url), "utf8").replace(/^export /gm, "");
const source = relaySource + readFileSync(new URL("./background.js", import.meta.url), "utf8").replace(/^import .*\n/gm, "");

function background() {
  const query = vi.fn().mockResolvedValue([
    { id: 1, url: "https://evisa.imigrasi.go.id/" },
    { id: 2, url: "https://allindonesia.imigrasi.go.id/" },
    { id: 3, url: "https://lovebali.baliprov.go.id/" },
    { id: 4, url: "https://example.com/" },
    { id: 5, url: "http://evisa.imigrasi.go.id/" },
    { id: 6, url: "https://evisa.imigrasi.go.id.evil.example/" },
  ]);
  const sendMessage = vi.fn().mockResolvedValue(undefined);
  let onConnect!: (port: unknown) => void;
  runInNewContext(source, {
    chrome: {
      runtime: {
        id: "nami", onInstalled: { addListener: vi.fn() }, onStartup: { addListener: vi.fn() },
        onConnect: { addListener: (listener: typeof onConnect) => { onConnect = listener; } },
      },
      tabs: { query, sendMessage },
    }, URL,
  });
  const connect = (name = "nami-panel", id = "nami") => {
    let disconnect: (() => void) | undefined;
    onConnect({ name, sender: { id }, onDisconnect: { addListener: (listener: () => void) => { disconnect = listener; } } });
    return disconnect;
  };
  return { query, sendMessage, connect };
}

describe("panel lifetime", () => {
  it("clears official-tab overlays after panel destruction, without React cleanup", async () => {
    const b = background();
    const disconnect = b.connect();
    expect(b.query).not.toHaveBeenCalled();
    expect(disconnect).toBeTypeOf("function");
    disconnect!();
    await vi.waitFor(() => expect(b.sendMessage).toHaveBeenCalledTimes(3));
    expect(b.sendMessage.mock.calls).toEqual([1, 2, 3].map(id => [id, { type: "nami:agent-state", active: false, step: "" }]));
  });
  it("ignores unrelated or foreign extension ports", () => {
    const b = background();
    expect(b.connect("other")).toBeUndefined();
    expect(b.connect("nami-panel", "foreign")).toBeUndefined();
    expect(b.query).not.toHaveBeenCalled();
  });
  it("handles a panel closing with no official tabs", async () => {
    const b = background();
    b.query.mockResolvedValue([]);
    b.connect()!();
    await Promise.resolve();
    expect(b.sendMessage).not.toHaveBeenCalled();
  });
  it("tolerates tabs without content scripts and a failed tabs query", async () => {
    const b = background();
    b.sendMessage.mockRejectedValue(new Error("No receiver"));
    const disconnect = b.connect()!;
    disconnect();
    await vi.waitFor(() => expect(b.sendMessage).toHaveBeenCalledTimes(3));
    b.query.mockRejectedValue(new Error("Tabs unavailable"));
    disconnect();
    await vi.waitFor(() => expect(b.query).toHaveBeenCalledTimes(2));
  });
});
