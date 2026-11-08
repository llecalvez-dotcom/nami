import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BRIDGE_READY_LINE, bridgeIsUsed, bridgeManaged, markBridgeUsed, refreshBridge, resetBridgeState, type BridgeDeps } from "@/lib/local-bridge";

function fakeDeps(script: { pids: (number | null)[]; log?: (string | null)[]; chrome?: boolean[] }) {
  let clock = 0;
  const pids = [...script.pids];
  const logs = [...(script.log ?? [])];
  const killed: number[] = [];
  const lines: string[] = [];
  const deps: BridgeDeps = {
    pgrep: async () => (pids.length > 1 ? pids.shift()! : pids[0] ?? null),
    kill: async (pid) => {
      killed.push(pid);
    },
    readLog: async () => (logs.length > 1 ? logs.shift()! : (logs[0] ?? null)),
    chromeUp: async () => script.chrome?.shift() ?? true,
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
    log: (line) => lines.push(line),
  };
  return { deps, killed, lines };
}

beforeEach(() => resetBridgeState());
afterEach(() => vi.unstubAllEnvs());

describe("bridgeManaged", () => {
  it("is on only on the bench: not production, a local session id, darwin or linux", () => {
    expect(bridgeManaged({ NODE_ENV: "development", NAMI_LOCAL_SESSION_ID: "abc" }, "darwin")).toBe(true);
    expect(bridgeManaged({ NODE_ENV: "test", NAMI_LOCAL_SESSION_ID: "abc" }, "linux")).toBe(true);
    expect(bridgeManaged({ NODE_ENV: "production", NAMI_LOCAL_SESSION_ID: "abc" }, "darwin")).toBe(false);
    expect(bridgeManaged({ NODE_ENV: "development", NAMI_LOCAL_SESSION_ID: " " }, "darwin")).toBe(false);
    expect(bridgeManaged({ NODE_ENV: "development", NAMI_LOCAL_SESSION_ID: "abc" }, "win32")).toBe(false);
  });
});

describe("bridgeIsUsed and markBridgeUsed", () => {
  it("is false before any session, true once the running bridge served one, false when it is another process", async () => {
    const { deps } = fakeDeps({ pids: [100] });
    expect(await bridgeIsUsed(deps)).toBe(false);
    await markBridgeUsed(deps);
    expect(await bridgeIsUsed(deps)).toBe(true);
    const other = fakeDeps({ pids: [101] });
    expect(await bridgeIsUsed(other.deps)).toBe(false);
  });

  it("forgets when no bridge is found", async () => {
    const { deps } = fakeDeps({ pids: [null] });
    await markBridgeUsed(deps);
    expect(await bridgeIsUsed(deps)).toBe(false);
  });
});

describe("refreshBridge", () => {
  it("kills the used bridge, waits for the new pid and its ready line, then Chrome", async () => {
    const { deps, killed, lines } = fakeDeps({
      pids: [100, 100, 100, 100, 200],
      log: ["old\n", "old\n", `old\n${BRIDGE_READY_LINE} abc\n`],
      chrome: [false, true],
    });
    await markBridgeUsed(deps);
    expect(await refreshBridge(deps)).toBe("refreshed");
    expect(killed).toEqual([100]);
    expect(await bridgeIsUsed(deps)).toBe(false);
    expect(lines[0]).toMatch(/pid 100 -> 200, ready/);
  });

  it("ignores a ready line written before the kill", async () => {
    const before = `${BRIDGE_READY_LINE} abc\n`;
    const { deps } = fakeDeps({ pids: [100, 100, 200], log: [before, before, before, `${before}${BRIDGE_READY_LINE} abc\n`] });
    await markBridgeUsed(deps);
    expect(await refreshBridge(deps)).toBe("refreshed");
  });

  it("does nothing when the running bridge is not the used one, or when none runs", async () => {
    const fresh = fakeDeps({ pids: [100, 200] });
    await markBridgeUsed(fresh.deps);
    expect(await refreshBridge(fresh.deps)).toBe("skipped");
    expect(fresh.killed).toEqual([]);
    const none = fakeDeps({ pids: [null] });
    expect(await refreshBridge(none.deps)).toBe("skipped");
  });

  it("waits 4 s instead of the log when there is no log, and gives up after 20 s without a new pid", async () => {
    const noLog = fakeDeps({ pids: [100, 100, 200], log: [null] });
    await markBridgeUsed(noLog.deps);
    expect(await refreshBridge(noLog.deps)).toBe("refreshed");
    expect(noLog.deps.now()).toBeGreaterThanOrEqual(4_000);
    const stuck = fakeDeps({ pids: [100] });
    await markBridgeUsed(stuck.deps);
    expect(await refreshBridge(stuck.deps)).toBe("timeout");
    expect(stuck.lines[0]).toMatch(/did not come back/);
    expect(await bridgeIsUsed(stuck.deps)).toBe(false);
  });

  it("never throws when kill fails", async () => {
    const { deps } = fakeDeps({ pids: [100] });
    deps.kill = async () => {
      throw new Error("EPERM");
    };
    await markBridgeUsed(deps);
    expect(await refreshBridge(deps)).toBe("skipped");
  });
});
