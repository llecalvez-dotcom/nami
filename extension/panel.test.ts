import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const relaySource = readFileSync(new URL("./agent-state.js", import.meta.url), "utf8").replace(/^export /gm, "");
const source = relaySource + readFileSync(new URL("./panel.js", import.meta.url), "utf8").replace(/^import .*\n/gm, "");
const origin = "http://localhost:3001";
const state = { type: "nami:agent-state", active: true, step: "Choosing FRANCE" };

async function panel() {
  const frame = { contentWindow: { postMessage: vi.fn() }, src: "" };
  const sendMessage = vi.fn().mockResolvedValue(undefined);
  const connect = vi.fn();
  const query = vi.fn().mockResolvedValue([
    { id: 1, url: "https://evisa.imigrasi.go.id/front/login" },
    { id: 2, url: "https://allindonesia.imigrasi.go.id/" },
    { id: 3, url: "https://lovebali.baliprov.go.id/" },
    { id: 4, url: "https://example.com/" },
    { id: 5, url: "https://evisa.imigrasi.go.id.evil.example/" },
    { id: 6, url: "http://evisa.imigrasi.go.id/" },
    { id: 7, url: "not a URL" },
    { id: 8 },
  ]);
  let listener!: (event: unknown) => Promise<void>;
  await runInNewContext(`(async () => {${source}\n})()`, {
    namiUrl: async () => origin,
    document: { getElementById: () => frame },
    window: { addEventListener: (_: string, handler: typeof listener) => { listener = handler; } },
    chrome: { tabs: { query, sendMessage }, runtime: { connect } }, URL,
  });
  return { frame, sendMessage, query, connect, send: (data: unknown = state, eventOrigin = origin, eventSource: unknown = frame.contentWindow) => listener({ data, origin: eventOrigin, source: eventSource }) };
}

describe("panel agent state relay", () => {
  it("connects a named lifetime port when the panel loads", async () => {
    const p = await panel();
    expect(p.connect).toHaveBeenCalledExactlyOnceWith({ name: "nami-panel" });
  });
  it("relays only to the three exact official HTTPS hosts", async () => {
    const p = await panel();
    await p.send();
    expect(p.sendMessage.mock.calls).toEqual([[1, state], [2, state], [3, state]]);
  });
  it("rejects messages from a foreign origin or another window", async () => {
    const p = await panel();
    await p.send(state, "https://example.com");
    await p.send(state, origin, {});
    expect(p.query).not.toHaveBeenCalled();
  });
  it("ignores empty, unknown and malformed state messages", async () => {
    const p = await panel();
    for (const message of [null, {}, { type: "unknown" }, { ...state, active: "true" }, { ...state, step: null }]) await p.send(message);
    expect(p.query).not.toHaveBeenCalled();
  });
  it("allows an inactive empty step and bounds relayed text", async () => {
    const p = await panel();
    await p.send({ ...state, active: false, step: "" });
    expect(p.sendMessage).toHaveBeenCalledWith(1, { ...state, active: false, step: "" });
    await p.send({ ...state, step: "a".repeat(400) });
    expect(p.sendMessage).toHaveBeenCalledWith(1, { ...state, step: "a".repeat(320) });
  });
  it("continues relaying if one official tab has no receiving content script", async () => {
    const p = await panel();
    p.sendMessage.mockRejectedValueOnce(new Error("Receiving end does not exist"));
    await expect(p.send()).resolves.toBeUndefined();
    expect(p.sendMessage).toHaveBeenCalledTimes(3);
  });
});
