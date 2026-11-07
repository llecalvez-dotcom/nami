import { namiUrl, normaliseUrl } from "./settings.js";

const input = document.getElementById("url");
const saved = document.getElementById("saved");
const micStatus = document.getElementById("mic-status");

input.value = await namiUrl();

document.getElementById("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = normaliseUrl(input.value);
  if (!url) {
    saved.textContent = "Enter an http or https address.";
    return;
  }
  await chrome.storage.local.set({ namiUrl: url });
  input.value = url;
  saved.textContent = `Saved. Reopen the side panel to load ${url}.`;
});

document.getElementById("mic").addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    micStatus.textContent = "Microphone allowed. Reopen the side panel.";
  } catch (error) {
    micStatus.textContent = `Microphone refused (${error.name}). Allow it in the site settings of this extension.`;
  }
});
