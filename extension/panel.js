import { namiUrl } from "./settings.js";

const frame = document.getElementById("nami");
const origin = await namiUrl();
// Nami opens on its side panel screen (/panel); messages are still checked against its origin.
frame.src = `${origin}/panel`;

const sameSite = (tabUrl, host) => {
  try {
    const h = new URL(tabUrl).hostname;
    return h === host || h.endsWith(`.${host}`);
  } catch {
    return false;
  }
};

async function bringToFront(url) {
  const host = url.hostname;
  const tabs = await chrome.tabs.query({});
  // Several tabs on the official site: prefer the exact page, then the one used last (the agent's).
  const tab = tabs
    .filter((t) => t.url && sameSite(t.url, host))
    .sort((a, b) => (b.url === url.href) - (a.url === url.href) || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
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
