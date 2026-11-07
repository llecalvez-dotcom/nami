// Local only: reads the text of the Google Flights tab in the agent's Chrome through its DevTools port, so that the
// flights reported by the agent are checked against what is really on the page.

import { cdpUrls, guardedExpression } from "@/lib/local-chrome";
import { pageTextExpression } from "@/lib/flights/read";

type CdpTab = { type: string; url: string; webSocketDebuggerUrl?: string };

export const FLIGHT_DOMAINS = ["www.google.com", "consent.google.com"] as const;

function onFlightsDomain(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return (protocol === "https:" || protocol === "http:") && FLIGHT_DOMAINS.some((d) => hostname === d);
  } catch {
    return false;
  }
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

// null when no Google Flights tab is open or Chrome does not answer: the caller treats the page as unreadable.
export async function readFlightsPageText(urls = cdpUrls(), timeoutMs = 6000): Promise<string | null> {
  let tabs: CdpTab[];
  try {
    tabs = await listTabs(urls);
  } catch {
    return null;
  }
  const tab = tabs.find((t) => t.type === "page" && t.webSocketDebuggerUrl && onFlightsDomain(t.url) && t.url.includes("/travel/flights"));
  if (!tab?.webSocketDebuggerUrl) return null;
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  return new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => {
      ws.close();
      resolve(null);
    }, timeoutMs);
    ws.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    ws.onopen = () =>
      ws.send(JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: { expression: guardedExpression(pageTextExpression(), [...FLIGHT_DOMAINS]), returnByValue: true, awaitPromise: true },
      }));
    ws.onmessage = (event) => {
      const reply = JSON.parse(String(event.data)) as { id?: number; result?: { result?: { value?: unknown } } };
      if (reply.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      const value = reply.result?.result?.value;
      resolve(typeof value === "string" && value.trim() ? value : null);
    };
  });
}
