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
  const stored: { agentState?: unknown } = {};
  let onConnect!: (port: unknown) => void;
  let onMessage!: (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | undefined;
  runInNewContext(source, {
    chrome: {
      runtime: {
        id: "nami", onInstalled: { addListener: vi.fn() }, onStartup: { addListener: vi.fn() },
        onConnect: { addListener: (listener: typeof onConnect) => { onConnect = listener; } },
        onMessage: { addListener: (listener: typeof onMessage) => { onMessage = listener; } },
      },
      tabs: { query, sendMessage },
      storage: { session: { get: vi.fn(async () => stored), set: vi.fn(async (value: typeof stored) => Object.assign(stored, value)) } },
    }, URL,
  });
  const connect = (name = "nami-panel", id = "nami") => {
    let disconnect: (() => void) | undefined;
    onConnect({ name, sender: { id }, onDisconnect: { addListener: (listener: () => void) => { disconnect = listener; } } });
    return disconnect;
  };
  const ask = (message: unknown, id = "nami") => new Promise<unknown>((resolve) => { if (onMessage(message, { id }, resolve) !== true) resolve("ignored"); });
  return { query, sendMessage, connect, stored, ask };
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

describe("a page that loads while the agent works", () => {
  it("gets the last relayed state, or an inactive one when nothing was relayed", async () => {
    const b = background();
    await expect(b.ask({ type: "nami:agent-state:get" })).resolves.toEqual({ type: "nami:agent-state", active: false, step: "" });
    b.stored.agentState = { type: "nami:agent-state", active: true, step: "Choosing FRANCE" };
    await expect(b.ask({ type: "nami:agent-state:get" })).resolves.toEqual({ type: "nami:agent-state", active: true, step: "Choosing FRANCE" });
  });
  it("answers nothing to other messages or foreign extensions", async () => {
    const b = background();
    await expect(b.ask({ type: "other" })).resolves.toBe("ignored");
    await expect(b.ask({ type: "nami:agent-state:get" }, "foreign")).resolves.toBe("ignored");
  });
  it("forgets the state when the panel closes", async () => {
    const b = background();
    b.stored.agentState = { type: "nami:agent-state", active: true, step: "Choosing FRANCE" };
    b.connect()!();
    await vi.waitFor(() => expect(b.stored.agentState).toEqual({ type: "nami:agent-state", active: false, step: "" }));
  });
});
