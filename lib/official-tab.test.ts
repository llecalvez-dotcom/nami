import { describe, expect, it, vi } from "vitest";
import { SAMPLE_AGENT_RUN, SAMPLE_FORMALITIES } from "@/data/sample";
import { agentOfficialUrl, FOCUS_OFFICIAL, showOfficialSite } from "@/lib/official-tab";

describe("agentOfficialUrl", () => {
  it("points at the visa the paper agent fills in", () => {
    expect(agentOfficialUrl({ agent_run: SAMPLE_AGENT_RUN, formalities: SAMPLE_FORMALITIES })).toBe(
      SAMPLE_FORMALITIES.find((f) => f.id === "evoa")?.official_url,
    );
  });

  it("is empty without a paper agent or papers", () => {
    expect(agentOfficialUrl({ agent_run: null, formalities: SAMPLE_FORMALITIES })).toBeNull();
    expect(agentOfficialUrl({ agent_run: { ...SAMPLE_AGENT_RUN, kind: "flights" }, formalities: SAMPLE_FORMALITIES })).toBeNull();
    expect(agentOfficialUrl({ agent_run: SAMPLE_AGENT_RUN, formalities: [] })).toBeNull();
  });
});

function fakeHost(framed: boolean) {
  let listener: ((e: MessageEvent) => void) | null = null;
  const timers: (() => void)[] = [];
  const parent = { postMessage: vi.fn() };
  const host = {
    open: vi.fn(),
    addEventListener: vi.fn((_: string, fn: (e: MessageEvent) => void) => (listener = fn)),
    removeEventListener: vi.fn(() => (listener = null)),
    setTimeout: vi.fn((fn: () => void) => timers.push(fn)),
    clearTimeout: vi.fn(),
    parent: parent as unknown,
  };
  if (!framed) host.parent = host;
  return {
    host: host as unknown as Parameters<typeof showOfficialSite>[1],
    parent,
    raw: host,
    reply: (data: unknown, source: unknown = parent) => listener?.({ source, data } as MessageEvent),
    timeout: () => timers.forEach((t) => t()),
  };
}

const URL_ = "https://evisa.imigrasi.go.id/web/visa-selection";

describe("showOfficialSite", () => {
  it("opens a new tab outside the side panel", async () => {
    const f = fakeHost(false);
    await expect(showOfficialSite(URL_, f.host)).resolves.toBe("opened");
    expect(f.raw.open).toHaveBeenCalledWith(URL_, "_blank", "noopener");
  });

  it("asks the side panel to bring the agent's tab to the front", async () => {
    const f = fakeHost(true);
    const done = showOfficialSite(URL_, f.host);
    expect(f.parent.postMessage).toHaveBeenCalledWith({ type: FOCUS_OFFICIAL, url: URL_ }, "*");
    f.reply({ type: "other" });
    f.reply({ type: `${FOCUS_OFFICIAL}:done`, result: "focused" }, {});
    f.reply({ type: `${FOCUS_OFFICIAL}:done`, result: "focused" });
    await expect(done).resolves.toBe("focused");
    expect(f.raw.open).not.toHaveBeenCalled();
  });

  it("opens the site itself if the panel fails or does not answer", async () => {
    const failed = fakeHost(true);
    const a = showOfficialSite(URL_, failed.host);
    failed.reply({ type: `${FOCUS_OFFICIAL}:done`, result: "failed" });
    await expect(a).resolves.toBe("opened");
    expect(failed.raw.open).toHaveBeenCalledOnce();

    const silent = fakeHost(true);
    const b = showOfficialSite(URL_, silent.host);
    silent.timeout();
    await expect(b).resolves.toBe("opened");
    expect(silent.raw.open).toHaveBeenCalledOnce();
  });
});
