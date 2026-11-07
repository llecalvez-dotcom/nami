export const DEFAULT_URL = "http://localhost:3000";

export function normaliseUrl(value) {
  try {
    const url = new URL(String(value).trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export async function namiUrl() {
  const { namiUrl: saved } = await chrome.storage.local.get("namiUrl");
  return normaliseUrl(saved) ?? DEFAULT_URL;
}
