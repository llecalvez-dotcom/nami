import { describe, expect, it } from "vitest";
import { agentTab, isAgentPage, pickTab, registeredDomain, sameSite, siteKey } from "./agent-state.js";

const u = (href: string) => new URL(href);
const VISA = u("https://evisa.imigrasi.go.id/web/visa-selection");
const CARD = u("https://allindonesia.imigrasi.go.id/arrival-card-submission/personal-information");
const FLIGHTS = u("https://www.google.com/travel/flights");

describe("the site of a page", () => {
  it("takes the registered domain, one label longer under go.id, gov.uk or com.au", () => {
    expect(registeredDomain("www.evisa.mofa.go.jp")).toBe("mofa.go.jp");
    expect(registeredDomain("molina.imigrasi.go.id")).toBe("imigrasi.go.id");
    expect(registeredDomain("www.gov.uk")).toBe("www.gov.uk");
    expect(registeredDomain("visa.immigration.go.tz")).toBe("immigration.go.tz");
    expect(registeredDomain("www.example.com")).toBe("example.com");
    expect(registeredDomain("example.com")).toBe("example.com");
    expect(registeredDomain("deep.sub.example.com.au")).toBe("example.com.au");
  });

  it("keeps each known official host as a site of its own, and only the flights section of Google", () => {
    expect(siteKey(VISA)).toBe("evisa.imigrasi.go.id");
    expect(siteKey(CARD)).toBe("allindonesia.imigrasi.go.id");
    expect(siteKey(u("https://www.google.com/travel/flights/search?tfs=abc"))).toBe("www.google.com/travel/flights");
    expect(siteKey(u("https://www.google.com/search?q=bali"))).toBeNull();
    expect(siteKey(u("https://www.google.com/travel/hotels"))).toBeNull();
    expect(siteKey(u("http://evisa.imigrasi.go.id/"))).toBeNull();
    expect(siteKey(u("https://www.evisa.mofa.go.jp/index"))).toBe("mofa.go.jp");
  });

  it("is the same for a deeper page, with or without www, on another subdomain", () => {
    expect(sameSite(u("https://evisa.imigrasi.go.id/front/application/step-1?id=42"), VISA)).toBe(true);
    expect(sameSite(u("https://www.evisa.mofa.go.jp/form/3"), u("https://evisa.mofa.go.jp/"))).toBe(true);
    expect(sameSite(u("https://evisa.mofa.go.jp/"), u("https://www.evisa.mofa.go.jp/"))).toBe(true);
    expect(sameSite(u("https://evisa.imigrasi.go.id/front/login"), u("https://molina.imigrasi.go.id/"))).toBe(true);
    expect(sameSite(u("https://evisa.imigrasi.go.id/front/login"), u("https://www.imigrasi.go.id/"))).toBe(true);
    expect(sameSite(u("https://www.google.com/travel/flights/search?tfs=abc"), FLIGHTS)).toBe(true);
  });

  it("is not the same for another official site, a Google search, a look-alike host or plain http", () => {
    expect(sameSite(CARD, VISA)).toBe(false);
    expect(sameSite(u("https://lovebali.baliprov.go.id/"), VISA)).toBe(false);
    expect(sameSite(u("https://www.google.com/search?q=bali"), FLIGHTS)).toBe(false);
    expect(sameSite(u("https://www.google.com/travel/hotels/Bali"), FLIGHTS)).toBe(false);
    expect(sameSite(u("https://consent.google.com/m?continue=x"), FLIGHTS)).toBe(false);
    expect(sameSite(u("https://evisa.imigrasi.go.id.evil.example/"), VISA)).toBe(false);
    expect(sameSite(u("http://evisa.imigrasi.go.id/web/visa-selection"), VISA)).toBe(false);
    expect(sameSite(u("https://example.com/"), VISA)).toBe(false);
  });

  it("still tells the agent's pages apart", () => {
    expect(isAgentPage(VISA)).toBe(true);
    expect(isAgentPage(u("https://www.google.com/travel/flights/search"))).toBe(true);
    expect(isAgentPage(u("https://www.google.com/search"))).toBe(false);
  });
});

describe("the tab a mark brings back", () => {
  it("brings back the deeper page of the same host instead of opening the paper's first page", () => {
    const tabs = [
      { id: 1, url: "about:blank", lastAccessed: 1 },
      { id: 2, url: "https://evisa.imigrasi.go.id/front/application/step-1?id=42", lastAccessed: 10 },
    ];
    expect(pickTab(tabs, VISA, "visa")?.id).toBe(2);
  });

  it("brings back the tab even when the page asked for is on www, a sibling subdomain or the bare domain", () => {
    const tabs = [{ id: 2, url: "https://evisa.imigrasi.go.id/front/application/step-1", lastAccessed: 10 }];
    expect(pickTab(tabs, u("https://www.evisa.imigrasi.go.id/web/visa-selection"), "visa")?.id).toBe(2);
    expect(pickTab(tabs, u("https://molina.imigrasi.go.id/"), "visa")?.id).toBe(2);
    expect(pickTab(tabs, u("https://imigrasi.go.id/"), "visa")?.id).toBe(2);
    const japan = [{ id: 3, url: "https://www.evisa.mofa.go.jp/form/3", lastAccessed: 10 }];
    expect(pickTab(japan, u("https://evisa.mofa.go.jp/"), "visa")?.id).toBe(3);
  });

  it("prefers the tab the agent worked in for the site, whatever was used since", () => {
    const tabs = [
      { id: 2, url: "https://evisa.imigrasi.go.id/front/application/step-1", lastAccessed: 10 },
      { id: 4, url: "https://evisa.imigrasi.go.id/web/visa-selection", lastAccessed: 50 },
    ];
    expect(pickTab(tabs, VISA, "visa")?.id).toBe(4);
    const remembered = { "evisa.imigrasi.go.id": { id: 2, url: tabs[0].url, at: 5 } };
    expect(pickTab(tabs, VISA, "visa", remembered)?.id).toBe(2);
    // The agent's tab has moved to another site since: it is no longer the visa's.
    const moved = [{ id: 2, url: "https://allindonesia.imigrasi.go.id/arrival-card-submission/personal-information", lastAccessed: 10 }, tabs[1]];
    expect(pickTab(moved, VISA, "visa", remembered)?.id).toBe(4);
  });

  it("otherwise takes the tab of the site used last", () => {
    const tabs = [
      { id: 1, url: "https://evisa.imigrasi.go.id/front/login", lastAccessed: 10 },
      { id: 2, url: "https://evisa.imigrasi.go.id/web/visa-selection", lastAccessed: 5 },
      { id: 3, url: "https://example.com/", lastAccessed: 99 },
    ];
    expect(pickTab(tabs, VISA, "visa")?.id).toBe(1);
  });

  it("knows which official site a paper lives on when its page was found elsewhere on the domain", () => {
    const tabs = [
      { id: 1, url: "https://evisa.imigrasi.go.id/front/application/step-1", lastAccessed: 10 },
      { id: 2, url: "https://allindonesia.imigrasi.go.id/arrival-card-submission/trip", lastAccessed: 50 },
    ];
    const remembered = { "evisa.imigrasi.go.id": { id: 1, url: tabs[0].url, at: 1 }, "allindonesia.imigrasi.go.id": { id: 2, url: tabs[1].url, at: 2 } };
    expect(pickTab(tabs, u("https://molina.imigrasi.go.id/"), "visa", remembered)?.id).toBe(1);
    expect(pickTab(tabs, u("https://www.imigrasi.go.id/"), "arrival_card", remembered)?.id).toBe(2);
    // Without the paper, the domain alone cannot tell: the tab used last.
    expect(pickTab(tabs, u("https://www.imigrasi.go.id/"), undefined, remembered)?.id).toBe(2);
    // The paper's known site never pulls a tab of another country's visa.
    expect(pickTab([tabs[0]], u("https://www.evisa.mofa.go.jp/"), "visa", remembered)).toBeNull();
  });

  it("never brings back another official site, a Google search or Google Hotels for the flights", () => {
    expect(pickTab([{ id: 2, url: "https://allindonesia.imigrasi.go.id/arrival-card-submission/trip", lastAccessed: 50 }], VISA, "visa")).toBeNull();
    const google = [
      { id: 1, url: "https://www.google.com/search?q=bali", lastAccessed: 50 },
      { id: 3, url: "https://www.google.com/travel/hotels/Bali", lastAccessed: 40 },
      { id: 2, url: "https://www.google.com/travel/flights/search?tfs=abc", lastAccessed: 10 },
    ];
    expect(pickTab(google, FLIGHTS, "flights")?.id).toBe(2);
    expect(pickTab(google.slice(0, 2), FLIGHTS, "flights")).toBeNull();
  });

  it("is null when no tab of the site is left, so one is opened, and ignores tabs without id or url", () => {
    expect(pickTab([{ id: 1, url: "about:blank" }, { url: VISA.href }, { id: 5 }, { id: 6, url: "not a URL" }], VISA, "visa")).toBeNull();
    expect(pickTab([], VISA, "visa")).toBeNull();
  });
});

describe("the tab the agent works in", () => {
  it("is a page of its sites first, then the tab shown, the one used last between them", () => {
    const tabs = [
      { id: 1, url: "https://www.google.com/search?q=bali", active: true, lastAccessed: 90 },
      { id: 2, url: "https://evisa.imigrasi.go.id/front/application/step-1", lastAccessed: 10 },
      { id: 3, url: "https://evisa.imigrasi.go.id/web/visa-selection", active: true, lastAccessed: 5 },
      { id: 4, url: "http://evisa.imigrasi.go.id/", active: true, lastAccessed: 99 },
    ];
    expect(agentTab(tabs)?.id).toBe(3);
    expect(agentTab(tabs.slice(0, 2))?.id).toBe(2);
    expect(agentTab([tabs[0]])?.id).toBe(1);
    expect(agentTab([{ id: 9, url: "https://example.com/", lastAccessed: 1 }])).toBeNull();
    expect(agentTab([])).toBeNull();
  });
});
