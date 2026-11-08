const officialHosts = new Set(["evisa.imigrasi.go.id", "allindonesia.imigrasi.go.id", "lovebali.baliprov.go.id"]);
// Shared hosts hold unrelated tabs too: only this section of the site is the agent's.
const sharedSections = { "www.google.com": "/travel/flights" };

export function isAgentPage(url) {
  if (url.protocol !== "https:") return false;
  if (officialHosts.has(url.hostname)) return true;
  const section = sharedSections[url.hostname];
  return section !== undefined && url.pathname.startsWith(section);
}

export async function relayAgentState(message) {
  const state = { type: "nami:agent-state", active: message.active, step: message.step.slice(0, 320) };
  // Kept for the pages that load later (a new page of the form, a tab brought back): they ask for it.
  await chrome.storage?.session?.set({ agentState: state })?.catch(() => {});
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(async (tab) => {
    if (tab.id === undefined || !tab.url) return;
    try {
      if (!isAgentPage(new URL(tab.url))) return;
      await chrome.tabs.sendMessage(tab.id, state);
    } catch { return; }
  }));
}
