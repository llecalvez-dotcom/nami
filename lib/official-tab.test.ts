import { describe, expect, it, vi } from "vitest";
import { SAMPLE_AGENT_RUN, SAMPLE_FORMALITIES } from "@/data/sample";
import { agentOfficialUrl, focusOfficialTab, FOCUS_OFFICIAL, PAPER_HOME_URLS, paperUrl, showOfficialSite } from "@/lib/official-tab";

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

describe("paperUrl", () => {
  it("points each paper at its official form, the flights at the page the agent opened", () => {
    const trip = { agent_run: null, formalities: SAMPLE_FORMALITIES };
    expect(paperUrl(trip, "visa")).toBe(SAMPLE_FORMALITIES.find((f) => f.id === "evoa")?.official_url);
    expect(paperUrl(trip, "arrival_card")).toBe(SAMPLE_FORMALITIES.find((f) => f.id === "arrival_card")?.official_url);
    expect(paperUrl(trip, "flights")).toBe(PAPER_HOME_URLS.flights);
    const flights = { ...SAMPLE_AGENT_RUN, kind: "flights" as const, result: { flights: { url: "https://www.google.com/travel/flights/search?x=1", options: [] } } };
    expect(paperUrl({ agent_run: flights, formalities: [] }, "flights")).toBe("https://www.google.com/travel/flights/search?x=1");
  });

  it("falls back to the site's own page when the trip has no papers yet", () => {
    expect(paperUrl({ agent_run: null, formalities: [] }, "visa")).toBe(PAPER_HOME_URLS.visa);
    expect(paperUrl({ agent_run: null, formalities: [] }, "arrival_card")).toBe(PAPER_HOME_URLS.arrival_card);
    expect(Object.values(PAPER_HOME_URLS).every((url) => url.startsWith("https://"))).toBe(true);
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

describe("focusOfficialTab", () => {
  it("does nothing outside the side panel, and asks the panel inside it", async () => {
    const plain = fakeHost(false);
    expect(focusOfficialTab(URL_, plain.host)).toBeNull();
    expect(plain.raw.open).not.toHaveBeenCalled();
    const framed = fakeHost(true);
    const done = focusOfficialTab(URL_, framed.host);
    expect(framed.parent.postMessage).toHaveBeenCalledWith({ type: FOCUS_OFFICIAL, url: URL_ }, "*");
    framed.reply({ type: `${FOCUS_OFFICIAL}:done`, result: "opened" });
    await expect(done).resolves.toBe("opened");
  });
});
