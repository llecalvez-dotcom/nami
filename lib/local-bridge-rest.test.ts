import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHANNEL_REST_MS, channelForSession, currentChannel, freshBridgeBeforeSession, lastDestroyAt, type BridgeDeps } from "@/lib/local-bridge";

const LINE = "2026-11-08 10:54:37,485 INFO hai_agents_local.bridge: command destroy dispatched in 0.01s";
const END = new Date("2026-11-08T10:54:37").getTime();

function deps(log: string | null, now: number) {
  const sleep = vi.fn(async () => {});
  const value: BridgeDeps = { pgrep: async () => null, kill: async () => {}, readLog: async () => log, chromeUp: async () => true, sleep, now: () => now, log: () => {} };
  return { value, sleep };
}

describe("one channel per session", () => {
  const ENV = { NODE_ENV: "development", NAMI_LOCAL_SESSION_ID: "fixed-id" };
  const NEW = "11111111-2222-4333-8444-555555555555";

  it("writes a new channel, restarts the bridge on it, and returns it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nami-channel-"));
    const file = join(dir, "channel");
    const pids = [111, 222];
    let log = "Local web bridge serving session id fixed-id";
    const kill = vi.fn(async () => { log += `\nLocal web bridge serving session id ${NEW}`; });
    const { value, sleep } = deps(LINE, END + 1_000);
    const env = { ...ENV, NAMI_BRIDGE_CHANNEL_FILE: file };
    await expect(channelForSession("fixed-id", env, { ...value, kill, readLog: async () => log, pgrep: async () => pids.shift() ?? 222 }, () => NEW)).resolves.toBe(NEW);
    expect(kill).toHaveBeenCalledWith(111);
    expect((await readFile(file, "utf8")).trim()).toBe(NEW);
    expect(sleep).not.toHaveBeenCalledWith(expect.any(Number) && CHANNEL_REST_MS - 1_000);
    await expect(currentChannel("fixed-id", env)).resolves.toBe(NEW);
  });

  it("keeps the fixed channel when it cannot write the new one, or without the file", async () => {
    const { value } = deps(null, END);
    await expect(channelForSession("fixed-id", { ...ENV, NAMI_BRIDGE_CHANNEL_FILE: "/nonexistent/dir/channel" }, value, () => NEW)).resolves.toBe("fixed-id");
    await expect(currentChannel("fixed-id", ENV)).resolves.toBe("fixed-id");
    await expect(channelForSession("fixed-id", { NODE_ENV: "production", NAMI_LOCAL_SESSION_ID: "x" }, value, () => NEW)).resolves.toBe("fixed-id");
  });
});

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
