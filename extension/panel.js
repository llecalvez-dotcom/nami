import { namiUrl } from "./settings.js";
import { pickTab, relayAgentState } from "./agent-state.js";

chrome.runtime.connect({ name: "nami-panel" });

const frame = document.getElementById("nami");
const origin = await namiUrl();
// Nami opens on its side panel screen (/panel); messages are still checked against its origin.
frame.src = `${origin}/panel`;

const PAPERS = new Set(["visa", "arrival_card", "flights", "hotels"]);

// A tab of the site is brought to the front as it is (its URL is never changed: the form the agent filled in lives
// there); a new tab opens only when none is left.
async function bringToFront(url, paper, open) {
  const tabs = await chrome.tabs.query({});
  const remembered = (await chrome.storage?.session?.get("agentTabs").catch(() => ({})))?.agentTabs ?? {};
  const tab = pickTab(tabs, url, paper, remembered);
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    return "focused";
  }
  if (!open) return "missing";
  await chrome.tabs.create({ url: url.href });
  return "opened";
}

window.addEventListener("message", async (event) => {
  if (event.source !== frame.contentWindow || event.origin !== origin) return;
  if (event.data?.type === "nami:agent-state") {
    if (typeof event.data.active === "boolean" && typeof event.data.step === "string") await relayAgentState(event.data);
    return;
  }
  const { type, url, paper, open } = event.data ?? {};
  if (type !== "nami:focus-official" || typeof url !== "string") return;
  let target;
  try {
    target = new URL(url);
  } catch {
    return;
  }
  if (target.protocol !== "https:") return;
  const result = await bringToFront(target, PAPERS.has(paper) ? paper : undefined, open !== false).catch(() => "failed");
  frame.contentWindow.postMessage({ type: "nami:focus-official:done", result }, origin);
});
