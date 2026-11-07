import { relayAgentState } from "./agent-state.js";

const openOnClick = () => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onInstalled.addListener(openOnClick);
chrome.runtime.onStartup.addListener(openOnClick);

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "nami-panel" || port.sender?.id !== chrome.runtime.id) return;
  port.onDisconnect.addListener(() => {
    relayAgentState({ type: "nami:agent-state", active: false, step: "" }).catch(() => {});
  });
});
