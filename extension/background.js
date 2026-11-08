import { relayAgentState } from "./agent-state.js";

const openOnClick = () => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onInstalled.addListener(openOnClick);
chrome.runtime.onStartup.addListener(openOnClick);

// A page of the official site that loads while the agent works asks where things stand (agent-overlay.js).
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.type !== "nami:agent-state:get") return;
  chrome.storage.session.get("agentState")
    .then((stored) => sendResponse(stored.agentState ?? { type: "nami:agent-state", active: false, step: "" }))
    .catch(() => sendResponse({ type: "nami:agent-state", active: false, step: "" }));
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "nami-panel" || port.sender?.id !== chrome.runtime.id) return;
  port.onDisconnect.addListener(() => {
    relayAgentState({ type: "nami:agent-state", active: false, step: "" }).catch(() => {});
  });
});
