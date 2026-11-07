import { afterEach, describe, expect, it, vi } from "vitest";
import { connectChrome } from "@/lib/chrome-cdp";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("native loopback CDP connection", () => {
  function mockTransport(error = false) {
    const messages: Record<string, unknown>[] = [];
    class Socket extends EventTarget {
      static OPEN = 1;
      readyState = Socket.OPEN;
      constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event("open"))); }
      send(data: string) {
        const request = JSON.parse(data);
        messages.push(request);
        queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", {
          data: JSON.stringify({ id: request.id, ...(error ? { error: { message: "/private/file.jpg" } } : { result: { ok: true } }) }),
        })));
      }
      close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
    }
    vi.stubGlobal("WebSocket", Socket);
    const fetch = vi.fn(async () => Response.json({ webSocketDebuggerUrl: "ws://127.0.0.1:9333/devtools/browser/test" }));
    vi.stubGlobal("fetch", fetch);
    return { fetch, messages };
  }

  it("discovers only the loopback browser and multiplexes commands to the attached session", async () => {
    const { fetch, messages } = mockTransport();
    const client = await connectChrome(9333);
    expect(await client.send("Target.getTargets")).toEqual({ ok: true });
    expect(await client.send("Runtime.evaluate", { expression: "1" }, "target")).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:9333/json/version", expect.objectContaining({ redirect: "error" }));
    expect(messages[1]).toMatchObject({ id: 2, method: "Runtime.evaluate", sessionId: "target" });
    client.close();
    await expect(client.send("Target.getTargets")).rejects.toThrow("CDP unavailable");
  });

  it("never connects to a debugger URL on another host", async () => {
    mockTransport();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ webSocketDebuggerUrl: "ws://example.com/devtools" })));
    await expect(connectChrome(9333)).rejects.toThrow("CDP unavailable");
  });

  it("does not expose CDP errors", async () => {
    mockTransport(true);
    const client = await connectChrome(9333);
    await expect(client.send("DOM.setFileInputFiles")).rejects.toThrow(/^CDP unavailable$/);
    client.close();
  });

  it("fails closed on a Node runtime without native WebSocket", async () => {
    vi.stubGlobal("WebSocket", undefined);
    await expect(connectChrome(9222)).rejects.toThrow("CDP unavailable");
  });
});
