// Local only: picks an option of a native <select> hidden behind a custom dropdown (Select2...) in the traveller's
// own Chrome, through its DevTools port. The agent's clicks cannot open those menus.

import { agentChromePort } from "@/lib/chrome-cdp";

type CdpTab = { type: string; url: string; webSocketDebuggerUrl?: string };

export function localChromeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "production";
}

export function cdpUrls(env: Record<string, string | undefined> = process.env): string[] {
  const port = agentChromePort(env);
  return port === null ? [] : [`http://127.0.0.1:${port}`];
}

async function listTabs(urls: string[]): Promise<CdpTab[]> {
  for (const url of urls) {
    try {
      const response = await fetch(`${url}/json`);
      if (response.ok) return (await response.json()) as CdpTab[];
    } catch {
      // Not this port, try the next one.
    }
  }
  throw new Error("Chrome is not reachable on its DevTools port.");
}

function onDomain(url: string, domains: string[]): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return (protocol === "https:" || protocol === "http:") && domains.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

// Runs in the page: finds the select whose name, id or label matches the field, then the option matching the value.
export function pickExpression(field: string, option: string): string {
  return `((field, option) => {
  const norm = (s) => String(s || "").replace(/\\s+/g, " ").trim().toLowerCase();
  const f = norm(field), o = norm(option);
  const labelOf = (el) => norm([el.name, el.id, el.getAttribute("aria-label"), el.labels && [...el.labels].map((l) => l.innerText).join(" "), el.closest(".form-group, .mb-3, div")?.innerText.split("\\n")[0]].join(" "));
  const selects = [...document.querySelectorAll("select")].filter((s) => !s.disabled);
  const named = selects.filter((s) => f && labelOf(s).includes(f));
  for (const s of named.length ? named : selects) {
    const opts = [...s.options];
    const hit = opts.find((x) => norm(x.text) === o) || opts.find((x) => norm(x.text).startsWith(o)) || opts.find((x) => norm(x.text).includes(o));
    if (!hit) continue;
    if (window.jQuery) window.jQuery(s).val(hit.value).trigger("change");
    else { s.value = hit.value; s.dispatchEvent(new Event("input", { bubbles: true })); s.dispatchEvent(new Event("change", { bubbles: true })); }
    return "Picked " + hit.text.trim() + " in " + (s.name || s.id || "the list") + ". The page already shows it. Do not reload or refresh the page or navigate away; take a screenshot and continue with the next field.";
  }
  return "No list has an option matching " + option + ". Try another wording, or call ask_user.";
})(${JSON.stringify(field)}, ${JSON.stringify(option)})`;
}

export async function pickOption(field: string, option: string, domains: string[], urls = cdpUrls()): Promise<string> {
  const tabs = await listTabs(urls);
  const tab = tabs.find((t) => t.type === "page" && t.webSocketDebuggerUrl && onDomain(t.url, domains));
  if (!tab?.webSocketDebuggerUrl) return "The official site is not open in Chrome.";
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("Chrome did not answer."));
    }, 5000);
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Could not reach Chrome."));
    };
    ws.onopen = () =>
      ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: pickExpression(field, option), returnByValue: true } }));
    ws.onmessage = (event) => {
      const reply = JSON.parse(String(event.data)) as { id?: number; result?: { result?: { value?: unknown } } };
      if (reply.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      const value = reply.result?.result?.value;
      resolve(typeof value === "string" ? value : "Chrome could not pick the option.");
    };
  });
}
