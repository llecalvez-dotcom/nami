import { agentChromePort, connectChrome, type CdpConnection } from "@/lib/chrome-cdp";

type Target = { targetId: string; type: string; url: string };

const BLANK_TAB = /^(about:blank|chrome:\/\/newtab)/;

// A search works in its own tab (Nathan, 2026-11-08): the visa form stays as the agent left it. Nami opens the page herself
// as soon as the traveller answers: H needs up to 40 s before its first action after another session, and the tab stayed
// blank all that time. A blank tab, or the tab of an earlier try of the same search, is reused, so a retry does not pile
// them up. Never an error: on any doubt the session starts as before and the agent opens the page itself.
// Returns the id of the tab: it is the tab_id of H's switch_tab_web, so the agent goes straight to it instead of visiting
// every tab, the visa's included (bench 2026-11-08, 2 runs out of 6 cut by the domain guard that way). null: it did not open.
export async function openSearchTab(url: string, connect: (port: number) => Promise<CdpConnection> = connectChrome, port: number | null = agentChromePort()): Promise<string | null> {
  if (port === null || process.env.NODE_ENV === "production") return null;
  let client: CdpConnection | undefined;
  try {
    client = await connect(port);
    const { origin, pathname } = new URL(url);
    const { targetInfos } = await client.send("Target.getTargets") as { targetInfos: Target[] };
    const tab = targetInfos.find((target) => target.type === "page" && (BLANK_TAB.test(target.url) || target.url.startsWith(origin + pathname)));
    if (!tab) {
      const { targetId } = await client.send("Target.createTarget", { url }) as { targetId: string };
      return targetId;
    }
    await client.send("Target.activateTarget", { targetId: tab.targetId });
    const { sessionId } = await client.send("Target.attachToTarget", { targetId: tab.targetId, flatten: true }) as { sessionId: string };
    await client.send("Page.navigate", { url }, sessionId);
    return tab.targetId;
  } catch {
    // The session is created as before.
    return null;
  } finally {
    client?.close();
  }
}
