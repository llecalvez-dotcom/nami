const officialHosts = new Set(["evisa.imigrasi.go.id", "allindonesia.imigrasi.go.id", "lovebali.baliprov.go.id"]);
// Shared hosts hold unrelated tabs too: only this section of the site is the agent's.
const sharedSections = { "www.google.com": "/travel/flights" };
// Where each paper is known to live (lib/official-tab.ts): the mark of a paper prefers a tab of that site when the
// page asked for is elsewhere on the same registered domain (the visa found live at molina.imigrasi.go.id).
const paperSites = { visa: "evisa.imigrasi.go.id", arrival_card: "allindonesia.imigrasi.go.id", flights: "www.google.com/travel/flights" };
// Second-level labels under which the registered domain is one label longer (imigrasi.go.id, gov.uk, com.au).
const secondLevel = new Set(["ac", "co", "com", "edu", "gc", "go", "gob", "gouv", "gov", "mil", "ne", "net", "or", "org"]);

export function isAgentPage(url) {
  if (url.protocol !== "https:") return false;
  if (officialHosts.has(url.hostname)) return true;
  const section = sharedSections[url.hostname];
  return section !== undefined && url.pathname.startsWith(section);
}

export function registeredDomain(hostname) {
  const labels = hostname.toLowerCase().split(".");
  const keep = labels.length > 2 && secondLevel.has(labels.at(-2)) ? 3 : 2;
  return labels.slice(-keep).join(".");
}

// The site a page belongs to, for Nami: a known official host is a site of its own (the visa and the arrival card
// share imigrasi.go.id), the agent's section of a shared host (a Google search is nobody's), otherwise the
// registered domain, so www or not and every subdomain are one site.
export function siteKey(url) {
  if (url.protocol !== "https:") return null;
  if (officialHosts.has(url.hostname)) return url.hostname;
  const section = sharedSections[url.hostname];
  if (section !== undefined) return url.pathname.startsWith(section) ? `${url.hostname}${section}` : null;
  return registeredDomain(url.hostname);
}

// Whether a tab is on the site of the page asked for: the agent moves to deeper pages of the form, to www or another
// subdomain, so only the site counts. Two known official hosts are two sites even on one registered domain.
export function sameSite(tabUrl, url) {
  const tab = siteKey(tabUrl);
  const asked = siteKey(url);
  if (tab === null || asked === null) return false;
  if (tab === asked) return true;
  if (sharedSections[tabUrl.hostname] !== undefined || sharedSections[url.hostname] !== undefined) return false;
  if (officialHosts.has(tabUrl.hostname) && officialHosts.has(url.hostname)) return false;
  return registeredDomain(tabUrl.hostname) === registeredDomain(url.hostname);
}

const parse = (href) => {
  try {
    return new URL(href);
  } catch {
    return null;
  }
};

// The tab a paper's mark brings back, or null when no tab of the site is left (only then is one opened): the tab
// the agent worked on last for this site, then a tab of the site the paper is known to live on or of the exact
// site asked, then any tab of the same registered domain; ties go to the tab used last. Never a new tab otherwise.
export function pickTab(tabs, url, paper, agentTabs = {}) {
  const known = paperSites[paper];
  const paperSite = known && registeredDomain(known.split("/")[0]) === registeredDomain(url.hostname) ? known : null;
  const rank = (tab) => {
    const tabUrl = tab.id === undefined || !tab.url ? null : parse(tab.url);
    if (!tabUrl) return 0;
    const key = siteKey(tabUrl);
    const site = key !== null && (key === paperSite || key === siteKey(url));
    if (!site && !sameSite(tabUrl, url)) return 0;
    return (site ? 2 : 1) + (agentTabs[key]?.id === tab.id ? 2 : 0);
  };
  return tabs
    .map((tab) => [rank(tab), tab])
    .filter(([score]) => score > 0)
    .sort(([scoreA, a], [scoreB, b]) => scoreB - scoreA || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0]?.[1] ?? null;
}

// The tab the agent is working in, among the open tabs: a page of its own sites first, then the tab shown in a
// window (the agent drives the tab next to the panel), the one used last between them.
export function agentTab(tabs) {
  return tabs
    .filter((tab) => tab.id !== undefined && tab.url && parse(tab.url)?.protocol === "https:" && (tab.active || isAgentPage(parse(tab.url))))
    .sort((a, b) => Number(isAgentPage(parse(b.url))) - Number(isAgentPage(parse(a.url))) || Number(Boolean(b.active)) - Number(Boolean(a.active)) || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0] ?? null;
}

// Remembers, per site, the tab the agent works in and the page it is on, so a paper's mark brings that very tab back
// later (the form filled in by the agent lives there), even after the agent has moved on to another paper.
async function rememberAgentTab(tabs) {
  const tab = agentTab(tabs);
  const key = tab ? siteKey(new URL(tab.url)) : null;
  if (!tab || key === null) return;
  const stored = (await chrome.storage?.session?.get("agentTabs").catch(() => ({})))?.agentTabs ?? {};
  await chrome.storage?.session?.set({ agentTabs: { ...stored, [key]: { id: tab.id, url: tab.url, at: Date.now() } } })?.catch(() => {});
}

export async function relayAgentState(message) {
  const state = { type: "nami:agent-state", active: message.active, step: message.step.slice(0, 320) };
  // Kept for the pages that load later (a new page of the form, a tab brought back): they ask for it.
  await chrome.storage?.session?.set({ agentState: state })?.catch(() => {});
  const tabs = await chrome.tabs.query({});
  if (state.active) await rememberAgentTab(tabs).catch(() => {});
  await Promise.all(tabs.map(async (tab) => {
    if (tab.id === undefined || !tab.url) return;
    try {
      if (!isAgentPage(new URL(tab.url))) return;
      await chrome.tabs.sendMessage(tab.id, state);
    } catch { return; }
  }));
}
