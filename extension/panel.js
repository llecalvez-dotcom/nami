import { namiUrl } from "./settings.js";

const frame = document.getElementById("nami");
const origin = await namiUrl();
frame.src = origin;

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
  const tab = tabs.find((t) => t.url && sameSite(t.url, host));
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
