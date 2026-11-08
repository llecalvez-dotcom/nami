import { afterEach, describe, expect, it, vi } from "vitest";
import { CHANNEL_REST_MS, freshBridgeBeforeSession, lastDestroyAt, type BridgeDeps } from "@/lib/local-bridge";

const LINE = "2026-11-08 10:54:37,485 INFO hai_agents_local.bridge: command destroy dispatched in 0.01s";
const END = new Date("2026-11-08T10:54:37").getTime();

function deps(log: string | null, now: number) {
  const sleep = vi.fn(async () => {});
  const value: BridgeDeps = { pgrep: async () => null, kill: async () => {}, readLog: async () => log, chromeUp: async () => true, sleep, now: () => now, log: () => {} };
  return { value, sleep };
}

describe("a session started right after another one", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads when the last session ended", () => {
    expect(lastDestroyAt(`old\n2026-11-08 09:00:00,000 INFO x: command destroy dispatched\n${LINE}\nother`)).toBe(END);
    expect(lastDestroyAt("nothing here")).toBeNull();
  });

  it("waits for the rest of the pause, 11 s after the end of the visa", async () => {
    vi.stubEnv("NAMI_LOCAL_SESSION_ID", "6e5f6051-e697-43ce-8763-4e9233e336bf");
    const { value, sleep } = deps(LINE, END + 11_000);
    await freshBridgeBeforeSession(value);
    expect(sleep).toHaveBeenCalledWith(CHANNEL_REST_MS - 11_000);
  });

  it("does not wait once the pause is over, or with no previous session", async () => {
    vi.stubEnv("NAMI_LOCAL_SESSION_ID", "6e5f6051-e697-43ce-8763-4e9233e336bf");
    const late = deps(LINE, END + CHANNEL_REST_MS + 1);
    await freshBridgeBeforeSession(late.value);
    expect(late.sleep).not.toHaveBeenCalled();
    const none = deps("Local web bridge serving session id x", END);
    await freshBridgeBeforeSession(none.value);
    expect(none.sleep).not.toHaveBeenCalled();
  });
});
