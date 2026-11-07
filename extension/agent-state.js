const officialHosts = new Set(["evisa.imigrasi.go.id", "allindonesia.imigrasi.go.id", "lovebali.baliprov.go.id"]);

export async function relayAgentState(message) {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(async (tab) => {
    if (tab.id === undefined || !tab.url) return;
    try {
      const url = new URL(tab.url);
      if (url.protocol !== "https:" || !officialHosts.has(url.hostname)) return;
      await chrome.tabs.sendMessage(tab.id, { type: "nami:agent-state", active: message.active, step: message.step.slice(0, 320) });
    } catch { return; }
  }));
}
