import { namiUrl } from "./settings.js";
import { isAgentPage, relayAgentState } from "./agent-state.js";

chrome.runtime.connect({ name: "nami-panel" });

const frame = document.getElementById("nami");
const origin = await namiUrl();
// Nami opens on its side panel screen (/panel); messages are still checked against its origin.
frame.src = `${origin}/panel`;

// How well a tab matches the page asked for: the exact page, then the agent's section of a shared site (Google
// Flights, never a Google search), then the official site itself (the agent moves between its pages).
const match = (tabUrl, url) => {
  try {
    const tab = new URL(tabUrl);
    const sameHost = tab.hostname === url.hostname || tab.hostname.endsWith(`.${url.hostname}`);
    if (!sameHost || tab.protocol !== "https:") return 0;
    if (tab.href === url.href) return 3;
    if (isAgentPage(tab)) return 2;
    return isAgentPage(url) ? 0 : 1;
  } catch {
    return 0;
  }
};

async function bringToFront(url) {
  const tabs = await chrome.tabs.query({});
  // Several tabs on the site: prefer the exact page, then the one used last (the agent's). None left: open it again.
  const tab = tabs
    .filter((t) => t.url && match(t.url, url) > 0)
    .sort((a, b) => match(b.url, url) - match(a.url, url) || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  if (tab?.id !== undefined) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    return "focused";
  }
  await chrome.tabs.create({ url: url.href });
  return "opened";
}

window.addEventListener("message", async (event) => {
  if (event.source !== frame.contentWindow || event.origin !== origin) return;
  if (event.data?.type === "nami:agent-state") {
    if (typeof event.data.active === "boolean" && typeof event.data.step === "string") await relayAgentState(event.data);
    return;
  }
  const { type, url } = event.data ?? {};
  if (type !== "nami:focus-official" || typeof url !== "string") return;
  let target;
  try {
    target = new URL(url);
  } catch {
    return;
  }
  if (target.protocol !== "https:") return;
  const result = await bringToFront(target).catch(() => "failed");
  frame.contentWindow.postMessage({ type: "nami:focus-official:done", result }, origin);
});
